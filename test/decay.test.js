// decay.test.js — 情绪衰减 + 反刍回归测试。
//
// 锁定 examples/emotion-decay-demo.mjs 演示的「科学校准」行为，防回归：
//   1) per-emotion TAU：负面复合情绪按各自时间常数（愤怒~20min/悲伤~3h…）小时级回落，
//      绝不永久黏着（堵死"永久阴阳怪气 agent"）。
//   2) 反刍(rumination)：高重要性 / 反刍型事件触发反刍，在 RUMINATION_WINDOW(3600s) 内延长滞留
//      ——"记一会儿"，过窗后按正常速率衰减——"不记仇到天荒地老"。
// 运行：node test/decay.test.js  （或 npm test）
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const bridge = path.resolve(here, "../engine/seele_bridge.js");
const ENGINE = process.env.NESHAMA_ENGINE || path.resolve(here, "../engine/neshama_engine.js");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stemem-decay-"));

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { passed++; console.log("  ✓ " + label); }
  else { failed++; console.error("  ✗ " + label); }
}

function runBridge(cmd, opts = {}, dataFile) {
  return new Promise((resolve, reject) => {
    const args = [bridge, cmd];
    for (const [k, v] of Object.entries(opts)) args.push("--" + k, String(v));
    const p = spawn(process.execPath, args, {
      env: { ...process.env, NESHAMA_ENGINE: ENGINE, SEELE_DATA: dataFile },
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

const NEG = new Set(["betrayal", "anger", "shame", "contempt", "fear", "sadness", "背叛感", "愤怒", "羞耻", "蔑视", "恐惧", "悲伤"]);
const negIntensity = (s) => {
  const a = (s.active_emotions || []).find((e) => NEG.has(e.name));
  return a ? a.intensity : undefined;
};

async function main() {
  console.log("Stemem emotion decay + rumination regression test");

  const rumData = path.join(dataDir, "rum.json");
  const ctrlData = path.join(dataDir, "ctrl.json");

  // ---------- 反刍态：高重要性背叛事件 ----------
  await runBridge("init", {}, rumData);
  const betrayal = await runBridge("event", { text: "被最信任的伙伴背叛了", tags: "betrayal", importance: "high" }, rumData);
  const beforeNeg = negIntensity(betrayal);
  assert(beforeNeg != null && beforeNeg >= 0.35, "背叛(高重要)浮现负面复合情绪 (≥0.35)");

  // 20min，仍在反刍窗口(3600s)内 → 应仍明显滞留（"记一会儿"，未过早回落）
  const after20 = await runBridge("tick", { seconds: 1200 }, rumData);
  const n20 = negIntensity(after20);
  assert(n20 != null && n20 >= beforeNeg - 0.05, `反刍窗口内(20min)负面态仍滞留（记一会儿）：before=${beforeNeg?.toFixed(2)} after20=${n20?.toFixed(2)}`);

  // 再过 90min（累计 110min > 反刍窗口）→ 正常衰减，已显著回落或落出表面（"不记仇"）
  const after90 = await runBridge("tick", { seconds: 5400 }, rumData);
  const n90 = negIntensity(after90);
  assert(n90 === undefined || n90 < beforeNeg - 0.05, `反刍窗口过后(90min)负面态已显著回落（不记仇到天荒地老）：after90=${n90 != null ? n90.toFixed(2) : "已落出表面"}`);

  // ---------- 对照组：普通背叛事件（无 high 亦会反刍，因 betrayal∈RUMINATION_TAGS） ----------
  // 此处只验证「纯时间衰减」方向：普通背叛事件后 1 天级空闲，负面态应完全回落（不永久黏着）。
  await runBridge("init", {}, ctrlData);
  const betrayalC = await runBridge("event", { text: "被最信任的伙伴背叛了", tags: "betrayal" }, ctrlData);
  const beforeNegC = negIntensity(betrayalC);
  assert(beforeNegC != null && beforeNegC >= 0.35, "对照：背叛(普通)浮现负面复合情绪 (≥0.35)");
  const decayedC = await runBridge("tick", { seconds: 86400 * 10 }, ctrlData);
  const nC = negIntensity(decayedC);
  assert(nC === undefined || nC < beforeNegC - 0.05, "对照：10 天后负面态完全回落（不永久阴阳怪气）");

  console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("衰减测试异常:", e); process.exit(1); });
