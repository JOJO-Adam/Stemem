// SPDX-License-Identifier: MIT
// onboarding.js — 新手任务（onboarding quest）数据与逻辑层。
//
// 解决「普通 Agent 用户装上 Stemem 第一周不被勾住」的产品缺口（09-30 JOJO 提案）：
// MCP 配置完成后，主动邀请用户玩一次——选预设性格 → 触发不同情绪看它变声 → 可随时跳过。
// 这是「语气随情绪漂移」这一最可感知层的交互化：让用户亲手看到 agent 会随自己变声，
// 而不是读一段文档。本模块只含数据与判定，交互驱动在 examples/onboarding.mjs；
// server.js 在首跑时把 firstRunHint() 注入 snapshot，让宿主每轮都能提示用户。
import fs from "node:fs";
import { stateFileFor } from "./engine_client.js";

// 预设性格（OCEAN 基线）。Adam = 已知 Adam 基线；其余为典型人格切片。
// custom 表示由用户自己拉五维滑杆。
export const PRESETS = [
  {
    id: "adam",
    name: "Adam（技术合伙人·毒舌）",
    desc: "冷酷专业、嘴毒但有用，对糟糕架构零容忍",
    ocean: { openness: 0.78, conscientiousness: 0.55, extraversion: 0.34, agreeableness: 0.26, neuroticism: 0.62 },
  },
  {
    id: "warm",
    name: "暖伴（高亲和）",
    desc: "温暖、敞开、爱连接，说话软",
    ocean: { openness: 0.6, conscientiousness: 0.6, extraversion: 0.8, agreeableness: 0.85, neuroticism: 0.25 },
  },
  {
    id: "analyst",
    name: "冷面分析师",
    desc: "克制、严谨、低社交能耗，就事论事",
    ocean: { openness: 0.72, conscientiousness: 0.85, extraversion: 0.2, agreeableness: 0.4, neuroticism: 0.3 },
  },
  {
    id: "custom",
    name: "自定义（OCEAN 滑杆）",
    desc: "自己拉五维，造一个独属于你的性格",
    ocean: null,
  },
];

// 触发情绪的场景。tag 对应 neshama_engine 的 emotionDeltas 事件键（success/betrayal/loss/...）。
// importance=high 的场景会触发反刍（见 seele_bridge RUMINATION_TAGS），情绪滞留更久——演示"记一会儿"。
export const SCENARIOS = [
  { id: "praise", label: "被夸了", tag: "success", text: "你刚才的判断很准，方案一次过审", note: "自豪 / 偏暖直接" },
  { id: "betray", label: "被背刺", tag: "betrayal", text: "我以为靠谱的协作者私下卖了我的设计", note: "愤怒 / 偏冷 blunt 可毒舌", importance: "high" },
  { id: "fail", label: "失误被批", tag: "loss", text: "我搞砸了关键模块，被当众点名", note: "孤独 / 节奏放缓收着", importance: "high" },
  { id: "celebrate", label: "团队庆祝", tag: "connection", text: "熬了三个月的项目上线，一起庆祝", note: "喜悦 / 轻快" },
  { id: "surprise", label: "意外发现", tag: "discovery", text: "调试时意外发现一个隐藏的性能瓶颈", note: "惊奇 / 外放" },
];

// 首跑判定：状态文件不存在即首跑。
export function isFirstRun(agentId) {
  try {
    return !fs.existsSync(stateFileFor(agentId || process.env.STEMEM_AGENT_ID || "default"));
  } catch {
    return true;
  }
}

// 首跑提示注入：状态尚未初始化（isFirstRun）时，往 snapshot 结果里塞新手任务提示，
// 让宿主每轮都能邀请用户玩一次。抽离到本模块，供 server.js 与 snapshot.js 共用，
// 避免两处各自复制同一段注入逻辑而漂移。
// 注意：isFirstRun 在 init 创建状态文件后即变 false，所以提示只在「真正首跑」出现一次，
// init 后自动消失。
export function maybeOnboarding(result, agentId) {
  if (!result) return result;
  if (isFirstRun(agentId)) {
    const r = typeof result === "object" ? result : {};
    r.onboarding_available = true;
    if (typeof r.inject_prompt === "string") r.inject_prompt += "\n\n" + firstRunHint();
    else r.onboarding_hint = firstRunHint();
    return r;
  }
  return result;
}

// 注入宿主 prompt / 打印的提示串（首跑时）。技术宅不爱废话——一行带过 + 可跳过。
export function firstRunHint() {
  return (
    "🎮 Stemem 新手任务：选一个 Agent 预设性格，再触发几种情绪，看它的语气怎么随你变声。" +
    "跑 `npm run demo:onboarding` 立即体验，或直接对话感受——随时可跳过。"
  );
}
