#!/usr/bin/env node
// onboarding.mjs — Stemem 新手任务（可跳过）。装上即被邀请玩一次：选性格 → 触发情绪看变声。
//
// 用法：node examples/onboarding.mjs   （或 npm run demo:onboarding）
// 对应 JOJO 提案：MCP 配置完成后自动触发新手任务，选预设性格、用不同对话触发情绪变化，可像游戏一样跳过。
//
// 这是「语气随情绪漂移」最可感知层的交互化——让用户亲手看到 agent 会随自己变声，而不是读文档。
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { PRESETS, SCENARIOS } from "../src/onboarding.js";

const here = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(here, "..");
const SERVER = path.join(ROOT, "src", "server.js");
const ENGINE = process.env.NESHAMA_ENGINE || path.join(ROOT, "engine", "neshama_engine.js");
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), "stemem-onboard-"));
const LANG = process.env.STEMEM_TONE_LANG === "zh" ? "zh" : "en";
const log = (...a) => console.log(...a);

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, STEMEM_AGENT_ID: "onboarding", STEMEM_STATE_DIR: STATE, NESHAMA_ENGINE: ENGINE },
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
        if (m.id != null && pending.has(m.id)) {
          pending.get(m.id)(m.result ?? m.error);
          pending.delete(m.id);
        }
      }
    });
    child.on("error", reject);
    rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "onboarding", version: "0.1.0" } })
      .then(() => resolve({ child, rpc }));
  });
}

const call = async (rpc, name, args = {}) => {
  const r = await rpc("tools/call", { name, arguments: args });
  return JSON.parse(r.content[0].text);
};

async function main() {
  // 用 rl.on('line') 队列 + 等待器，兼容「管道一次性输入」与「交互逐行输入」两种模式。
  // 不用 rl.question()：全缓冲管道下 question() 会与预缓冲行错位/丢行导致死锁。
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const lineQueue = [];
  let lineWaiter = null;
  rl.on("line", (line) => {
    if (lineWaiter) { const w = lineWaiter; lineWaiter = null; w(line); }
    else lineQueue.push(line);
  });
  rl.on("close", () => { if (lineWaiter) { const w = lineWaiter; lineWaiter = null; w(""); } });
  const ask = async (q) => {
    log(q);
    if (lineQueue.length) return lineQueue.shift().trim();
    // 交互模式：等下一行；管道 EOF：close 事件会回退空串，循环自然退出。
    return new Promise((resolve) => { lineWaiter = (l) => resolve((l || "").trim()); });
  };

  log("\n🎮 === Stemem 新手任务（随时回车 / 输入 skip 跳过） ===\n");

  const skip0 = (await ask("按回车开始，或输入 skip 直接跳过：")).toLowerCase();
  if (skip0 === "skip") {
    log("⏭️  已跳过新手任务。以后想玩可重跑 `npm run demo:onboarding`。");
    rl.close();
    process.exit(0);
  }

  // ① 选预设性格
  log("\n① 选一个 Agent 预设性格：");
  PRESETS.forEach((p, i) => log(`  [${i + 1}] ${p.name} —— ${p.desc}`));
  const pick = (await ask(`输入编号（1-${PRESETS.length}，回车=Adam）：`)) || "1";
  let preset = PRESETS[Math.max(0, Number(pick) - 1)] || PRESETS[0];
  let ocean = preset.ocean;
  if (preset.id === "custom") {
    const raw = await ask("自定义 OCEAN（openness,conscientiousness,extraversion,agreeableness,neuroticism，0-1，逗号分隔）：");
    const parts = raw.split(",").map((x) => Number(x.trim()));
    if (parts.length === 5 && parts.every((n) => n >= 0 && n <= 1)) {
      ocean = { openness: parts[0], conscientiousness: parts[1], extraversion: parts[2], agreeableness: parts[3], neuroticism: parts[4] };
    } else {
      log("  无效输入，回退 Adam 基线。");
      ocean = PRESETS[0].ocean;
    }
  }

  const { child, rpc } = await startServer();
  const init = await call(rpc, "init", { ocean });
  log(`\n✅ 已装配人格：${preset.name}`);
  log("   OCEAN: " + Object.entries(init.ocean).map(([k, v]) => `${k[0].toUpperCase()}=${v}`).join(" "));

  // ② 触发情绪，看它变声
  log("\n② 触发情绪，看它怎么变声（输入场景编号；回车或 skip 结束）：");
  log("   （每个场景从基线重来，看清「这次事件本身」怎么给语气着色）");
  SCENARIOS.forEach((s, i) => log(`  [${i + 1}] ${s.label}（${s.note}）${s.importance === "high" ? " ·高重要·会记一会儿" : ""}`));
  while (true) {
    const sel = (await ask("\n场景编号：")).toLowerCase();
    if (sel === "skip" || sel === "") break;
    const s = SCENARIOS[Number(sel) - 1];
    if (!s) {
      log("  无效编号，重选。");
      continue;
    }
    // 归零情绪到基线：避免上一场景残余情绪压过本次，确保「变声」清晰可见
    await call(rpc, "init", { ocean });
    await call(rpc, "event", { text: s.text, tags: [s.tag], importance: s.importance || "normal" });
    const snap = await call(rpc, "snapshot", { lang: LANG });
    log(`\n  ▌${s.label}`);
    log(`    主导情绪: ${snap.top_emotion?.name}（强度 ${(snap.top_emotion?.intensity ?? 0).toFixed(2)}）`);
    log(`    语气: ${snap.tone?.prompt?.replace(/\n/g, " ")}`);
    // 展示衰减：10 分钟后情绪回落（高重要场景会稍慢，但不过夜）
    await call(rpc, "tick", { seconds: 600 });
    const snap2 = await call(rpc, "snapshot", { lang: LANG });
    log(`    （+10 分钟）情绪: ${snap2.top_emotion?.name}（强度 ${(snap2.top_emotion?.intensity ?? 0).toFixed(2)}）— 看，气不会记一辈子`);
  }

  log("\n✅ 新手任务完成。你的 agent 现在：随对话变声、跨会话记得你是谁、且不会阴阳怪气到疯。");
  log("   正常用法：宿主每轮把 snapshot 注入 prompt 即可；想再看演进跑 `npm run demo`。跳过与否都不影响功能。");
  child.stdin.end();
  rl.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("onboarding 异常:", e);
  process.exit(1);
});
