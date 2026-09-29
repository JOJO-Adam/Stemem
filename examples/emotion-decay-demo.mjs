// emotion-decay-demo.mjs — 情绪时间衰减演示：堵死"永久阴阳怪气 agent"。
//
// 跑法：node examples/emotion-decay-demo.mjs  （或 npm run demo:decay）
// 对应 JOJO 决策："要做衰减，否则永远和一个阴阳怪气的 Agent 共事可能会疯掉"。
//
// 链路：seele_bridge(引擎) 产生情绪 → 经 tick 真实时间做指数衰减回落基线 → 语气随之松弛。
// 衰减纯状态层，不中断工作、不需批准、不调漫游，不碰「情绪≠工作表现」护栏。
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatTonePrompt } from "../src/tone.js";

const here = path.dirname(new URL(import.meta.url).pathname);
const bridge = path.resolve(here, "../engine/seele_bridge.js");
const ENGINE = process.env.NESHAMA_ENGINE || path.resolve(here, "../engine/neshama_engine.js");
const LANG = process.env.STEMEM_TONE_LANG === "zh" ? "zh" : "en";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stemem-decay-"));
const SEELE_DATA = path.join(dataDir, "seele_state.json");

const run = (cmd, opts = {}) =>
  new Promise((resolve, reject) => {
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
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error("非 JSON: " + out));
      }
    });
  });

const NEG = new Set([
  "betrayal", "anger", "shame", "contempt", "fear", "sadness",
  "背叛感", "愤怒", "羞耻", "蔑视", "恐惧", "悲伤",
]);
const negOf = (s) => {
  const a = (s.active_emotions || []).find((e) => NEG.has(e.name));
  return a ? a : { name: "(已回落至基线)", intensity: null };
};
const toneOf = (s) =>
  formatTonePrompt(
    {
      ok: true,
      top_emotion: s.top_emotion,
      ocean: s.ocean,
      drive: { dominant: s.drive && s.drive.dominant },
    },
    LANG
  );

console.log("=== Stemem 情绪时间衰减演示（堵死永久阴阳怪气）===\n");
const init = await run("init");
console.log("init：基线 OCEAN =", init.ocean, "\n");

const b = await run("event", { text: "被最信任的伙伴背叛了", tags: "betrayal" });
const bn = negOf(b);
console.log(`[遭遇背叛] 主导负面情绪 = ${bn.name}（强度 ${bn.intensity != null ? bn.intensity.toFixed(2) : "-"}）`);
console.log("  语气：\n" + toneOf(b) + "\n");

for (let day = 1; day <= 3; day++) {
  const s = await run("tick", { seconds: 86400 });
  const n = negOf(s);
  const tag = n.intensity != null ? `${n.name}（强度 ${n.intensity.toFixed(2)}）` : n.name;
  console.log(`[+${day} 天 tick] 负面情绪 = ${tag}`);
  console.log("  语气：\n" + toneOf(s) + "\n");
}

console.log("结论：负面态随真实时间向基线指数回落（TAU≈1 天），不会永久黏着。");
console.log("      agent 不会再变成永远阴阳怪气的共事对象，也不会因此暂停工作。");
