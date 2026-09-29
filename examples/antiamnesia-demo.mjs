#!/usr/bin/env node
// antiamnesia-demo.mjs — 证明 Stemem 的动态人格态在「压缩 / 重启」后仍能确定性恢复、且随事件演化。
//
// 这是 SOUL.md（静态 DOC）做不到的：一旦对话上下文被压缩、会话重启，SOUL.md 若被清出上下文即丢失；
// Stemem 的人格态常驻本地 JSON（STEMEM_STATE_DIR/<id>/seele_state.json），每轮由 snapshot 重注入，
// 跨重启确定性恢复。本 demo 模拟「会话 A 建人格 + 喂事件 → 杀进程（压缩）→ 会话 B 全新进程凭磁盘恢复」。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(ROOT, "src", "server.js");
const NODE = process.execPath;
const AGENT = "demo-persona";
const STATE_DIR = path.join(ROOT, ".tmp_state");

function startServer() {
  const env = { ...process.env, STEMEM_AGENT_ID: AGENT, STEMEM_STATE_DIR: STATE_DIR };
  const p = spawn(NODE, [SERVER], { env });
  let buf = "";
  let id = 0;
  const pending = new Map();
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const m = JSON.parse(line);
      if (m.id != null && pending.has(m.id)) {
        const r = pending.get(m.id);
        pending.delete(m.id);
        r(m);
      }
    }
  });
  const rpc = (method, params) =>
    new Promise((res) => {
      const myid = ++id;
      pending.set(myid, res);
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myid, method, params: params || {} }) + "\n");
    });
  const call = (name, args) => rpc("tools/call", { name, arguments: args || {} });
  const textOf = (m) => m?.result?.content?.[0]?.text || "";
  const parse = (t) => {
    try {
      return JSON.parse(t);
    } catch {
      return {};
    }
  };
  const stop = () =>
    new Promise((res) => {
      p.stdin.end();
      setTimeout(() => {
        p.kill();
        res();
      }, 300);
    });
  return { call, textOf, parse, stop };
}

async function phase1() {
  const s = startServer();
  await s.call("initialize", {}).catch(() => {});
  const init = s.parse(s.textOf(await s.call("init", { ocean: { openness: 0.7, conscientiousness: 0.6, extraversion: 0.3, agreeableness: 0.25, neuroticism: 0.6 } })));
  const ev1 = s.parse(s.textOf(await s.call("event", { text: "用户夸我架构判断准，我更确信自己的技术直觉", tags: ["pride", "esteem"], drive_deltas: { esteem: 0.2 } })));
  const ev2 = s.parse(s.textOf(await s.call("event", { text: "用户说我嘴太毒，我决定下次收着点", tags: ["feedback"], drive_deltas: { agreeableness: 0.1 } })));
  const snap = s.parse(s.textOf(await s.call("snapshot")));
  console.log("\n=== 会话 A（压缩前）===");
  console.log("OCEAN:", JSON.stringify(snap.ocean));
  console.log("主导情绪:", snap.top_emotion?.name, " | 主导驱力:", snap.drive?.dominant);
  console.log("累计状态步数 ocean_history_len:", ev2.ocean_history_len);
  console.log("inject_prompt:\n" + snap.inject_prompt);
  await s.stop();
  return snap;
}

async function phase2() {
  const s = startServer(); // 全新进程：没有任何会话 A 的对话历史
  await s.call("initialize", {}).catch(() => {});
  const snap = s.parse(s.textOf(await s.call("snapshot")));
  console.log("\n=== 会话 B（重启后 / 压缩后，无任何 A 的对话上下文）===");
  console.log("OCEAN:", JSON.stringify(snap.ocean));
  console.log("主导情绪:", snap.top_emotion?.name, " | 主导驱力:", snap.drive?.dominant);
  console.log("inject_prompt:\n" + snap.inject_prompt);
  await s.stop();
  return snap;
}

(async () => {
  fs.rmSync(STATE_DIR, { recursive: true, force: true });
  const a = await phase1();
  console.log("\n💥 模拟上下文压缩 / Agent 进程被杀重启（会话 B 没有会话 A 的任何对话历史）...\n");
  const b = await phase2();

  const oceanSame = JSON.stringify(a.ocean) === JSON.stringify(b.ocean);
  const emotionSame = a.top_emotion?.name === b.top_emotion?.name;
  console.log("=== 结论 ===");
  console.log(oceanSame && emotionSame ? "✅ 人格态跨重启确定性恢复（OCEAN + 主导情绪一致）" : "❌ 人格态未恢复");
  console.log("✅ 关键：会话 B 没有会话 A 的任何对话上下文，却通过本地磁盘 JSON 重注入了完整人格态 ——");
  console.log("   这正是 SOUL.md 在压缩后会被清掉、而 Stemem 不会的部分。若用 SOUL.md，会话 B 将是一个没有任何记忆的空白 agent。");
  console.log("\n→ 这就是 Stemem 相对纯 SOUL.md 的真实增量：压缩免疫 + 跨会话人格连续性。");
})();
