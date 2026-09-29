#!/usr/bin/env node
// harness-demo.mjs — 演示宿主如何把 Stemem 接进自己的 agent loop，让"装上就能感知"。
//
// 真实宿主只需三步（见 runTurn）：
//   1. preTurn()  → 拿 inject_prompt
//   2. systemPrompt = inject_prompt + baseSystemPrompt  → 调 LLM
//   3. postTurn()  → 把这一轮对话回写 event，驱动人格演化
//
// 本 demo 用一个"假 LLM"（规则生成回复）代替真实模型，聚焦集成模式本身。
// 跑完前 3 轮后模拟"压缩/重启"：杀掉进程、起新进程，继续第 4 轮，证明人格连续性。
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { StememHarness } from "../src/host-harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STATE_DIR = path.join(ROOT, ".tmp_state");
const AGENT = "harness-demo";

// 假 LLM：根据当前人格态生成一句"带人格色彩"的回复（仅用于演示，真实场景换真模型）。
function fakeLLM(injectPrompt, userText) {
  const hasTrust = injectPrompt.includes("trust");
  const lowAgree = /A=0\.2\d/.test(injectPrompt);
  if (userText.includes("方案")) {
    return hasTrust
      ? "按你的约束我先拆到底层再给方案——拒绝无规格的代码。"
      : "我需要先理解约束再动手。";
  }
  if (userText.includes("谢谢") || userText.includes("夸")) {
    return lowAgree ? "收到。不过别指望我变得温柔。" : "不客气。";
  }
  return "继续说，我在听。";
}

async function runTurn(h, idx, userText) {
  const { injectPrompt, state } = await h.preTurn();
  const agentText = fakeLLM(injectPrompt, userText);
  await h.postTurn({ userText, agentText });
  console.log(`\n— 轮次 ${idx} —`);
  console.log(`[注入] ${injectPrompt.replace(/\n/g, " ").slice(0, 80)}...`);
  console.log(`[用户] ${userText}`);
  console.log(`[Agent·带人格] ${agentText}`);
  console.log(`[状态] OCEAN O=${state.ocean?.openness?.toFixed(3)} A=${state.ocean?.agreeableness?.toFixed(3)} | 情绪=${state.top_emotion?.name}`);
  return { injectPrompt, state };
}

(async () => {
  fs.rmSync(STATE_DIR, { recursive: true, force: true });

  console.log("=== 宿主 loop：前 3 轮（进程常驻）===");
  const LANG = process.env.STEMEM_TONE_LANG || "en";
  const h = new StememHarness({
    agentId: AGENT,
    stateDir: STATE_DIR,
    lang: LANG,
    ocean: { openness: 0.78, conscientiousness: 0.55, extraversion: 0.34, agreeableness: 0.26, neuroticism: 0.62 },
  }).start();
  await h.init();
  await runTurn(h, 1, "帮我看下这个架构方案");
  await runTurn(h, 2, "你刚才的判断很准，谢谢");
  await runTurn(h, 3, "再给个演进路线");
  const before = (await h.preTurn()).state;
  await h.stop();

  console.log("\n💥 模拟上下文压缩 / 进程被杀重启（宿主重新拉起 Stemem）...\n");
  const h2 = new StememHarness({ agentId: AGENT, stateDir: STATE_DIR, lang: LANG }).start();
  await h2.init(); // 注意：不传 ocean —— 新进程没有任何初始人格上下文
  const after = (await h2.preTurn()).state;
  await runTurn(h2, 4, "重启后你还记得我是谁吗？");
  await h2.stop();

  const same =
    JSON.stringify(before.ocean) === JSON.stringify(after.ocean) &&
    before.top_emotion?.name === after.top_emotion?.name;
  console.log("\n=== 结论 ===");
  console.log(
    same
      ? "✅ 宿主 loop 接入后：每轮自动注入人格态，且压缩/重启后人格连续不丢。"
      : "❌ 人格态未延续"
  );
  console.log("→ 这就是「用户装上能感知」的闭环：宿主只需 3 行 loop，Stemem 从「休眠的库」变成「活着的人格层」。");
})();
