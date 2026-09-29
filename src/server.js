#!/usr/bin/env node
// server.js — Stemem MCP server（hand-rolled stdio，零依赖，本地优先零出站）。
//
// 为什么 hand-roll：MCP stdio 协议是 JSON-RPC 2.0 换行分隔，标准且简单；零依赖让本服务
// 完全离线、无供应链、对齐「本地优先」定位。工具表面与 设计要点.md §10.2 一致。
// 若日后要换官方 @modelcontextprotocol/sdk，只需把下面协议层替换为 SDK 的
// McpServer/StdioServerTransport，dispatch() 与工具表保持不变。
import { callBridge } from "./engine_client.js";
import { formatSnapshotPrompt, contractPrompt, shouldTriggerEvent } from "./runtime_contract.js";
import { isFirstRun, firstRunHint } from "./onboarding.js";
import { toneProfile } from "./tone.js";
import { generateSoul } from "./soulspec.js";

const AGENT_ID = process.env.STEMEM_AGENT_ID || "default";
const PROTOCOL_VERSION = "2024-11-05";
const DRIVES = ["survival", "safety", "belonging", "esteem", "self_actualization"];

// ---------- 工具表（MCP tools/list 返回，亦见 §10.2） ----------
const TOOLS = [
  {
    name: "init",
    description: "初始化一个人格态（首次装配人格时调用一次）。可传 OCEAN 预设；不传则随机 baseline。",
    inputSchema: {
      type: "object",
      properties: {
        ocean: { type: "object", description: "OCEAN 五维预设 {openness,conscientiousness,extraversion,agreeableness,neuroticism}" },
      },
    },
  },
  {
    name: "event",
    description: "喂入一个记忆事件，驱动人格/情绪演化。当本轮交互人格相关时调用。返回演化后 snapshot + voiceHint/logicHint。",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "事件文本" },
        tags: { type: "array", items: { type: "string" }, description: "情绪/驱力标签，如 betrayal,conflict,joy" },
        importance: { type: "string", enum: ["low", "normal", "high"], description: "事件重要性；high 触发反刍、延长相关情绪衰减（对应'记一会儿'）" },
        drive_deltas: { type: "object", description: "驱力增量 JSON，如 {\"belonging\":0.2}" },
      },
    },
  },
  {
    name: "tick",
    description: "时间流逝心跳：驱力自然紧迫 + 漂移衰减。空闲/心跳时调用。",
    inputSchema: { type: "object", properties: { seconds: { type: "number", description: "推进秒数，默认 3600" } } },
  },
  {
    name: "satisfy",
    description: "满足某驱力（闭环）。",
    inputSchema: {
      type: "object",
      properties: { drive: { type: "string", enum: DRIVES }, amount: { type: "number", description: "满足量 0–1，默认 0.3" } },
    },
  },
  {
    name: "snapshot",
    description: "读取紧凑身份态（OCEAN+主导情绪+驱力）+ 可注入 prompt 片段。每轮重注入宿主 prompt 抗压缩失忆。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "autostep",
    description: "自主行为推进：按驱力自己决定并做想做的事（玩家不干预也活）。",
    inputSchema: { type: "object", properties: { seconds: { type: "number", description: "推进秒数，默认 3600" } } },
  },
  {
    name: "intervene",
    description: "人工干预：顺驱力（帮他做想做的）或逆驱力（对抗意愿去塑造他）。",
    inputSchema: {
      type: "object",
      properties: {
        drive: { type: "string", enum: DRIVES },
        amount: { type: "number", description: "干预量，默认 0.4" },
        text: { type: "string", description: "干预描述" },
      },
    },
  },
  {
    name: "status",
    description: "完整状态检视（调试用）。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "generate_soul",
    description: "导出 SoulSpec v0.4 包（soul.json + SOUL.md + IDENTITY.md），进 ClawSouls 分发。",
    inputSchema: { type: "object", properties: { target_dir: { type: "string", description: "输出目录，默认当前目录" } } },
  },
];

// 首跑提示：状态尚未初始化时，在 snapshot/status 注入新手任务提示，让宿主每轮都能邀请用户玩一次。
// 这是「装上即被邀请」的轻量实现（stdio MCP 无法弹宿主 UI，但能往 prompt 里塞提示）。
function maybeOnboarding(result) {
  if (result && result.ok && isFirstRun(AGENT_ID)) {
    result.onboarding_available = true;
    if (typeof result.inject_prompt === "string") result.inject_prompt += "\n\n" + firstRunHint();
    else result.onboarding_hint = firstRunHint();
  }
  return result;
}

// ---------- 分发（工具实现，包裹 seele_bridge CLI） ----------
async function dispatch(name, args = {}) {
  switch (name) {
    case "init": {
      const opts = {};
      if (args.ocean) opts.ocean = JSON.stringify(args.ocean);
      return await callBridge("init", opts, AGENT_ID);
    }
    case "event": {
      const opts = {};
      if (args.text != null) opts.text = args.text;
      if (args.tags) opts.tags = Array.isArray(args.tags) ? args.tags.join(",") : String(args.tags);
      if (args.importance) opts.importance = args.importance;
      if (args.drive_deltas) opts.drive_deltas = JSON.stringify(args.drive_deltas);
      const d = await callBridge("event", opts, AGENT_ID);
      // 附上契约启发式，方便宿主判断（也演示 shouldTriggerEvent）
      d._contract_hint = shouldTriggerEvent(args.text || "");
      return d;
    }
    case "tick": {
      const opts = {};
      if (args.seconds != null) opts.seconds = String(args.seconds);
      return await callBridge("tick", opts, AGENT_ID);
    }
    case "satisfy": {
      return await callBridge(
        "satisfy",
        { drive: args.drive, amount: args.amount != null ? String(args.amount) : "0.3" },
        AGENT_ID
      );
    }
    case "snapshot": {
      const d = await callBridge("status", {}, AGENT_ID);
      if (!d.ok) return d;
      const lang = args.lang || process.env.STEMEM_TONE_LANG || "en";
      const result = {
        ocean: d.ocean,
        top_emotion: d.top_emotion,
        active_emotions: d.active_emotions,
        personality: d.personality,
        drive: d.drive,
        tone: toneProfile(d, lang),
        inject_prompt: formatSnapshotPrompt(d, lang),
      };
      return maybeOnboarding(result);
    }
    case "autostep": {
      const opts = {};
      if (args.seconds != null) opts.seconds = String(args.seconds);
      return await callBridge("autostep", opts, AGENT_ID);
    }
    case "intervene": {
      const opts = {};
      if (args.drive) opts.drive = args.drive;
      if (args.amount != null) opts.amount = String(args.amount);
      if (args.text) opts.text = args.text;
      return await callBridge("intervene", opts, AGENT_ID);
    }
    case "status": {
      const r = await callBridge("status", {}, AGENT_ID);
      return maybeOnboarding(r);
    }
    case "generate_soul": {
      const r = await generateSoul(args.target_dir || ".", AGENT_ID);
      return { ok: true, ...r };
    }
    default:
      throw new Error("unknown tool: " + name);
  }
}

// ---------- 极简 MCP stdio（JSON-RPC 2.0，换行分隔） ----------
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg);
  }
});

process.stdin.on("end", () => process.exit(0));

async function handle(msg) {
  try {
    if (msg.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: msg.params?.protocolVersion || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "stemem", version: "0.1.0" },
        },
      });
      return;
    }
    if (msg.method && msg.method.startsWith("notifications/")) return; // 通知不回复
    if (msg.method === "tools/list") {
      send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
      return;
    }
    if (msg.method === "tools/call") {
      const { name, arguments: args } = msg.params || {};
      try {
        const result = await dispatch(name, args || {});
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
        });
      } catch (e) {
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            content: [{ type: "text", text: JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }, null, 2) }],
            isError: true,
          },
        });
      }
      return;
    }
    if (msg.id != null) {
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found: " + msg.method } });
    }
  } catch (e) {
    if (msg.id != null) {
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(e && e.message ? e.message : e) } });
    }
  }
}

// 不自动退出：保持 stdin 监听（进程因 stdin 打开而存活）。
