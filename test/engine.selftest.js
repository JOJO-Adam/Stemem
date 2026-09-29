// engine.selftest.js — 引擎层自测（直接驱动 vendored seele_bridge CLI，验证
// NeshamaEngine 人格演化 + Seele 驱力桥的底层行为：性格锁 / 驱力紧迫 / 满足闭环 /
// 序列化往返 / 自主行为 / 干预）。运行：node test/engine.selftest.js  （或 npm test）
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const bridge = path.resolve(here, "../engine/seele_bridge.js");
const ENGINE = process.env.NESHAMA_ENGINE || path.resolve(here, "../engine/neshama_engine.js");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stemem-eng-"));
const SEELE_DATA = path.join(dataDir, "seele_state.json");

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { passed++; console.log("  ✓ " + label); }
  else { failed++; console.error("  ✗ " + label); }
}

function runBridge(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const args = [bridge, cmd];
    for (const [k, v] of Object.entries(opts)) args.push("--" + k, String(v));
    const p = spawn(process.execPath, args, {
      env: { ...process.env, NESHAMA_ENGINE: ENGINE, SEELE_DATA },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", () => {
      out = out.trim();
      if (!out) return reject(new Error("bridge " + cmd + " 无输出"));
      try { resolve(JSON.parse(out)); } catch (e) { reject(new Error("bridge 输出非 JSON: " + out)); }
    });
  });
}

const OCEAN_KEYS = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"];
const inRange01 = (o) => o && OCEAN_KEYS.every((k) => typeof o[k] === "number" && o[k] >= 0 && o[k] <= 1);

async function main() {
  console.log("Stemem engine selftest (vendored NeshamaEngine + Seele drive bridge)");

  const init = await runBridge("init");
  assert(init.ok === true, "init 返回 ok");
  assert(inRange01(init.ocean), "init ocean 五维 ∈ [0,1]");

  const ev = await runBridge("event", { text: "今天和朋友聊得很开心", tags: "joy|belonging" });
  assert(ev.ok === true, "event 返回 ok");
  assert(Array.isArray(ev.active_emotions), "event 产生 active_emotions 数组");
  assert(inRange01(ev.ocean), "event 后 ocean 仍 ∈ [0,1]（性格锁生效，不出界）");
  const evOcean = JSON.stringify(ev.ocean);

  const tk = await runBridge("tick", { seconds: 7200 });
  assert(tk.ok === true, "tick 返回 ok");
  assert(inRange01(tk.ocean), "tick 后 ocean 仍 ∈ [0,1]");
  // 驱力紧迫：tick 后主导驱力 utility 不降
  assert(tk.drive.utility >= init.drive.utility - 1e-9, "tick 后主导驱力 utility 不降（驱力紧迫）");

  // 满足闭环：satisfy 提升该驱力 satisfaction
  const sat = await runBridge("satisfy", { drive: "belonging", amount: 0.5 });
  assert(sat.ok === true, "satisfy 返回 ok");
  const belSat = sat.drive.ranking.find((d) => d.drive === "belonging").satisfaction;
  assert(belSat >= 0.5 - 1e-9, "satisfy 提升 belonging 满足度 (≥0.5)");
  const satOcean = JSON.stringify(sat.ocean);

  // 序列化落盘 + 重启往返：ocean 一致（确定性持久化）
  const onDisk = JSON.parse(fs.readFileSync(SEELE_DATA, "utf8"));
  assert(onDisk && onDisk.engine && onDisk.drive, "状态文件含 engine + drive 段（序列化落盘）");
  assert(fs.existsSync(SEELE_DATA), "状态文件已写入磁盘");
  const status2 = await runBridge("status");
  assert(JSON.stringify(status2.ocean) === satOcean, "重启后 ocean 与上次一致（序列化/反序列化往返）");
  assert(JSON.stringify(status2.ocean) === evOcean, "ocean 自 event 后未被 tick/satisfy 篡改（单一真源）");

  // 干预：顺/逆驱力
  const iv = await runBridge("intervene", { drive: "esteem", amount: 0.4, text: "鼓励他演讲" });
  assert(iv.ok === true && (iv.mode === "facilitate" || iv.mode === "counteract"), "intervene 返回 mode");

  // 自主行为
  const au = await runBridge("autostep", { seconds: 3600 });
  assert(au.ok === true && typeof au.autonomous.acted === "boolean", "autostep 返回 autonomous.acted");

  // 情绪时间衰减：负面态随 tick 向基线回落（解决"永久阴阳怪气 agent"）
  const NEG = new Set(["betrayal", "anger", "shame", "contempt", "fear", "sadness", "背叛感", "愤怒", "羞耻", "蔑视", "恐惧", "悲伤"]);
  const negIntensity = (s) => {
    const a = (s.active_emotions || []).find((e) => NEG.has(e.name));
    return a ? a.intensity : undefined;
  };
  const betrayal = await runBridge("event", { text: "被最信任的人背叛了", tags: "betrayal" });
  const beforeNeg = negIntensity(betrayal);
  assert(beforeNeg != null && beforeNeg >= 0.35, "背叛事件浮现负面复合情绪 (≥0.35)");
  const decayed = await runBridge("tick", { seconds: 86400 * 10 });
  const afterNeg = negIntensity(decayed);
  assert(afterNeg === undefined || afterNeg < beforeNeg - 0.05, "tick 10 天后负面情绪显著回落（时间衰减生效，不永久黏着）");

  console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("引擎自测异常:", e); process.exit(1); });
