#!/usr/bin/env node
// examples/quickstart.mjs — 最小 MCP 宿主 demo：连上 Stemem 跑一遍人格运行时闭环。
//
// 用途：在「把 Stemem 接进真正的 MCP 宿主（WorkBuddy / Claude Code / Cursor）」之前，
//       先用这个零依赖脚本本地验证 server 是否正常工作。不需要任何网络 / 外部依赖。
//
// 用法：node examples/quickstart.mjs
//
// 它等价于一个最简宿主：每轮把 snapshot 注入 system prompt（抗压缩失忆），
// 人格相关时调 event 驱动演化，空闲时 tick，最后导出一份 SoulSpec 包。
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(here, "..");
const SERVER = path.join(ROOT, "src", "server.js");
const ENGINE = process.env.NESHAMA_ENGINE || path.join(ROOT, "engine", "neshama_engine.js");
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), "stemem-quickstart-"));

const log = (...a) => console.log(...a);

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, STEMEM_AGENT_ID: "quickstart", STEMEM_STATE_DIR: STATE, NESHAMA_ENGINE: ENGINE },
      stdio: ["pipe", "pipe", "inherit"],
    });
    let buf = "";
    const pending = new Map();
    let idc = 0;
    const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");
    const rpc = (method, params = {}) =>
      new Promise((res) => {
        const id = ++idc;
        pending.set(id, res);
        send({ jsonrpc: "2.0", id, method, params });
      });
    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const m = JSON.parse(line);
        if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); }
      }
    });
    child.on("error", reject);
    rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "quickstart", version: "0.1.0" } })
      .then(() => resolve({ child, rpc }));
  });
}

async function call(rpc, name, args = {}) {
  const r = await rpc("tools/call", { name, arguments: args });
  return JSON.parse(r.content[0].text);
}

const OCEAN_KEYS = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"];

async function main() {
  log("▶ 启动 Stemem MCP server（stdio）…");
  const { child, rpc } = await startServer();

  const list = await rpc("tools/list", {});
  log(`▶ tools/list 返回 ${list.tools.length} 个工具：${list.tools.map((t) => t.name).join(", ")}`);

  log("\n— 第 1 轮：装配人格（init）—");
  const init = await call(rpc, "init", {
    ocean: { openness: 0.78, conscientiousness: 0.55, extraversion: 0.34, agreeableness: 0.26, neuroticism: 0.62 },
  });
  log("  OCEAN baseline:", OCEAN_KEYS.map((k) => `${k[0].toUpperCase()}=${init.ocean[k]}`).join(" "));

  log("\n— 第 2 轮：JOJO 说了句话（event 驱动演化）—");
  const ev = await call(rpc, "event", { text: "JOJO 夸我了，我有点开心", tags: ["joy"] });
  log("  主导情绪:", ev.top_emotion?.name, "| 活跃情绪:", ev.active_emotions?.map((e) => e.name).join(",") || "—");

  log("\n— 第 3 轮：时间流逝（tick）—");
  await call(rpc, "tick", { seconds: 7200 });
  log("  驱力随心跳自然紧迫…");

  log("\n— 第 4 轮：每轮开始必调 snapshot，把身份态注入 system prompt —");
  const snap = await call(rpc, "snapshot", {});
  log("  注入串：\n" + snap.inject_prompt.split("\n").map((l) => "    " + l).join("\n"));

  log("\n— 第 5 轮：满足一个驱力（satisfy）—");
  const sat = await call(rpc, "satisfy", { drive: "belonging", amount: 0.5 });
  const bel = sat.drive.ranking.find((d) => d.drive === "belonging");
  log(`  belonging 满足度 → ${bel.satisfaction}`);

  log("\n— 收尾：导出 SoulSpec 包（generate_soul）—");
  const outDir = path.join(STATE, "soul-out");
  const soul = await call(rpc, "generate_soul", { target_dir: outDir });
  log("  生成:", soul.ok ? `${outDir}/SOUL.md, soul.json, IDENTITY.md` : "失败");

  // 跨重启确定性验证（压缩/重启不失忆的解药）
  child.stdin.end();
  const { child: child2, rpc: rpc2 } = await startServer();
  await rpc2("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "quickstart", version: "0.1.0" } });
  const snap2 = await call(rpc2, "snapshot", {});
  const same = JSON.stringify(snap2.ocean) === JSON.stringify(snap.ocean);
  child2.stdin.end();
  log("\n✔ 跨进程/跨重启 OCEAN 一致性:", same ? "通过（人格态在本地 JSON 确定性恢复）" : "失败");

  log("\n✅ 本地测试通过。把 Stemem 接进真实宿主即可获得持久人格态。");
  process.exit(same ? 0 : 1);
}

main().catch((e) => { console.error("demo 异常:", e); process.exit(1); });
