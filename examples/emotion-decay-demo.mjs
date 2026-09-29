// emotion-decay-demo.mjs — 情绪时间衰减演示（科学校准版）：堵死"永久阴阳怪气 agent"。
//
// 跑法：node examples/emotion-decay-demo.mjs  （或 npm run demo:decay）
// 对应 JOJO 决策："要做衰减，否则永远和一个阴阳怪气的 Agent 共事可能会疯掉" + 09-30 科学校准
// （per-emotion TAU：愤怒~20min、恐惧~15min、悲伤~3h；高重要性事件触发反刍延长）。
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

const NEG = new Set(["betrayal", "anger", "shame", "contempt", "fear", "sadness", "背叛感", "愤怒", "羞耻", "蔑视", "恐惧", "悲伤"]);
const negOf = (s) => {
  const a = (s.active_emotions || []).find((e) => NEG.has(e.name));
  return a ? a : { name: "(已回落至基线)", intensity: null };
};
const toneOf = (s) =>
  formatTonePrompt(
    { ok: true, top_emotion: s.top_emotion, ocean: s.ocean, drive: { dominant: s.drive && s.drive.dominant } },
    LANG
  );

console.log("=== Stemem 情绪时间衰减演示（科学校准：per-emotion TAU）===\n");
const init = await run("init");
console.log("init：基线 OCEAN =", init.ocean, "\n");

// 普通遭遇（非反刍）：被夸 → 喜悦，应分钟级回落
const happy = await run("event", { text: "方案一次过审，被夸了", tags: "success" });
console.log(`[被夸] 主导情绪 = ${happy.top_emotion?.name}（强度 ${happy.top_emotion?.intensity?.toFixed(2)}）`);
console.log("  语气：\n" + toneOf(happy) + "\n");
const h10 = await run("tick", { seconds: 600 });
console.log(`[+10 分钟 tick] 情绪 = ${negOf(h10).name}（强度 ${negOf(h10).intensity != null ? negOf(h10).intensity.toFixed(2) : "-"}) —— 喜悦已明显回落`);
console.log("  语气：\n" + toneOf(h10) + "\n");

// 高重要性遭遇（反刍）：被背刺 → 愤怒，记一会儿但不过夜
const b = await run("event", { text: "被最信任的伙伴背叛了", tags: "betrayal", importance: "high" });
const bn = negOf(b);
console.log(`\n[遭遇背叛·高重要] 主导负面情绪 = ${bn.name}（强度 ${bn.intensity != null ? bn.intensity.toFixed(2) : "-"})`);
console.log("  语气：\n" + toneOf(b) + "\n");
const b20 = await run("tick", { seconds: 1200 });
const bn20 = negOf(b20);
console.log(`[+20 分钟 tick] 愤怒 = ${bn20.name}（强度 ${bn20.intensity != null ? bn20.intensity.toFixed(2) : "已回落"}）— 反刍中，还记着`);
console.log("  语气：\n" + toneOf(b20) + "\n");
const b90 = await run("tick", { seconds: 5400 }); // 反刍窗口(3600s)过后正常衰减
const bn90 = negOf(b90);
console.log(`[+90 分钟 tick] 愤怒 = ${bn90.name}（强度 ${bn90.intensity != null ? bn90.intensity.toFixed(2) : "已回落"}）— 记了一会儿，但没记仇到天荒地老`);

console.log("\n结论：情绪按各自时间常数回落（喜悦~30min、愤怒~20min、悲伤~3h），高重要事件触发反刍稍延长；");
console.log("      agent 不会永久阴阳怪气，也不会因此暂停工作——科学，且不烦人。");
