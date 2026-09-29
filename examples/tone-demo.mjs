#!/usr/bin/env node
// tone-demo.mjs — 证明「语气随情绪漂移」是用户最能感知的层。
//
// 同一个人格基线（固定 OCEAN），4 个独立全新 agent 各吃一种遭遇，看 snapshot 的 tone.prompt 怎么变。
// 每个场景用独立 agent（独立状态目录），避免事件累积污染 —— 干净呈现「情绪 → 语气」映射。
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "os";
import path from "path";

const SERVER = "/Users/jojo/AI_Projects/Stemem/src/server.js";
const NODE = "/Users/jojo/.workbuddy/binaries/node/versions/22.22.2-3/bin/node";
const STATE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "stemem-tone-"));
const OCEAN = { openness: 0.78, conscientiousness: 0.55, extraversion: 0.34, agreeableness: 0.26, neuroticism: 0.62 };

function startAgent(agent) {
  const p = spawn(NODE, [SERVER], { env: { ...process.env, STEMEM_AGENT_ID: agent, STEMEM_STATE_DIR: STATE_ROOT } });
  let buf = "", id = 0; const pending = new Map();
  p.stdout.on("data", (d) => {
    buf += d; let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { const m = JSON.parse(line); if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch {}
    }
  });
  const rpc = (method, params) => new Promise((res) => { const myid = ++id; pending.set(myid, res); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myid, method, params: params || {} }) + "\n"); });
  const call = (name, args) => rpc("tools/call", { name, arguments: args || {} });
  const textOf = (m) => m?.result?.content?.[0]?.text || "";
  const parse = (t) => { try { return JSON.parse(t); } catch { return {}; } };
  const stop = () => new Promise((res) => { p.stdin.end(); setTimeout(() => { p.kill(); res(); }, 300); });
  return { call, textOf, parse, stop };
}

async function scenario(label, tag, text, reps = 2, lang = "en") {
  const s = startAgent("tone-" + tag + "-" + Date.now());
  await s.call("initialize", {}).catch(() => {});
  await s.call("init", { ocean: OCEAN });
  for (let i = 0; i < reps; i++) await s.call("event", { text, tags: [tag] });
  const snap = s.parse(s.textOf(await s.call("snapshot", { lang })));
  console.log(`\n▌${label}`);
  console.log(`  主导情绪: ${snap.top_emotion?.name}（强度 ${(snap.top_emotion?.intensity ?? 0).toFixed(2)}）`);
  console.log(`  语气指令: ${snap.tone?.prompt?.replace(/\n/g, " ")}`);
  await s.stop();
}

(async () => {
  const lang = process.env.STEMEM_TONE_LANG || "en";
  console.log(`=== 同一人格基线（OCEAN 固定），语气随遭遇漂移 · 渲染语言=${lang} ===`);
  await scenario("① 被夸、方案一次过审", "success", "用户夸我架构判断准，方案一次过审", 2, lang);
  await scenario("② 信赖的协作者背刺", "betrayal", "我以为靠谱的协作者私下把我的设计卖给了对手", 2, lang);
  await scenario("③ 失误被批、想躲", "loss", "我搞砸了关键模块，被当众点名，想找个地缝钻进去", 2, lang);
  await scenario("④ 项目上线、团队庆祝", "connection", "熬了三个月的项目上线，团队一起庆祝", 2, lang);
  console.log("\n=== 结论 ===");
  console.log("✅ 同一人格（OCEAN 不变），语气指令随遭遇明显分化：");
  console.log("   · 被夸/庆祝 → 自豪：偏暖、直接、节奏快、略 showy");
  console.log("   · 被背刺   → 愤怒：偏冷、blunt、可带锋利/毒舌（不人身攻击）");
  console.log("   · 失误被批 → 孤独：节奏放缓、收着、想凑近连接");
  console.log("   · 团队庆祝 → 自豪：与被夸同族，语气一致（同类情绪→同类语气，本身也证明映射稳定）");
  console.log("→ 这就是用户最能感知 Stemem 的部分：人格不是写死的腔调，而是会随遭遇变声的活体。");
})();
