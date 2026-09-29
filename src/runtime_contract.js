// runtime_contract.js — 「每轮运行时契约」辅助（详见 设计要点.md §10.3）。
//
// 核心思想：人格态存本地 JSON、不在 prompt；prompt 只放「何时调哪个工具」的指令。
// 本文件把契约落成可调用函数：
//   - formatSnapshotPrompt(snap, lang)  把 snapshot 编译成每轮注入宿主 prompt 的片段（抗 compaction + 语气指令），lang 默认 en
//   - shouldTriggerEvent(text)          启发式判断本轮交互是否「人格相关」，决定是否调 event
//   - contractPrompt(lang)              给宿主 system prompt 的「运行时契约」模板（指令层），lang 默认 en
//
// ⚠️ i18n：注入串默认英文渲染。把中文注入外语宿主的 prompt 会诱导模型用中文回答（JOJO 指出）。
// 中文经 `snapshot({lang:"zh"})` 或环境变量 `STEMEM_TONE_LANG=zh` 开启。
import { formatTonePrompt, EMOTION_EN_NAME } from "./tone.js";

// OCEAN 维度标签（中英），用于本地生成语言无关的人格摘要，避免注入引擎的中文串。
const OCEAN_LABELS = {
  en: { openness: "Openness", conscientiousness: "Conscientiousness", extraversion: "Extraversion", agreeableness: "Agreeableness", neuroticism: "Neuroticism" },
  zh: { openness: "开放性", conscientiousness: "尽责性", extraversion: "外向性", agreeableness: "宜人性", neuroticism: "神经质" },
};

// 本地从 OCEAN 生成人格摘要（中英），替代引擎的中文 getPersonalitySummary，堵住中文泄漏。
function personalitySummary(ocean = {}, lang = "en") {
  const L = lang === "zh" ? "zh" : "en";
  const order = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"];
  const level = (v) => (v >= 0.55 ? (L === "zh" ? "偏高" : "high") : v <= 0.45 ? (L === "zh" ? "偏低" : "low") : (L === "zh" ? "中等" : "moderate"));
  return order.map((k) => `${OCEAN_LABELS[L][k]}${L === "zh" ? "" : " "}${level(ocean[k] ?? 0.5)}`).join(L === "zh" ? "，" : ", ");
}

// 把一次 snapshot 编译成紧凑的身份态注入串（宿主每轮贴到 system prompt 末尾）。lang 默认 en。
export function formatSnapshotPrompt(snap, lang = "en") {
  if (!snap || !snap.ok) return "";
  const L = lang === "zh" ? "zh" : "en";
  const o = snap.ocean || {};
  const drive = snap.drive || {};
  const emoName = snap.top_emotion?.name;
  const emoNameL = L === "zh" ? emoName : (EMOTION_EN_NAME[emoName] || emoName);
  const I18N = {
    zh: {
      header: "[STEMEM IDENTITY · 每轮由 snapshot 重注入，跨压缩存活]",
      emotion: "主导情绪",
      drive: "主导驱力",
      summary: "人格摘要",
      intensity: "强度",
    },
    en: {
      header: "[STEMEM IDENTITY · re-injected every turn by snapshot; survives context compaction]",
      emotion: "Dominant emotion",
      drive: "Dominant drive",
      summary: "Personality summary",
      intensity: "intensity",
    },
  }[L];
  const lines = [];
  lines.push(I18N.header);
  lines.push(
    `OCEAN O=${n(o.openness)} C=${n(o.conscientiousness)} E=${n(o.extraversion)} A=${n(o.agreeableness)} N=${n(o.neuroticism)}`
  );
  lines.push(`${I18N.emotion}: ${emoNameL || "neutral"}（${I18N.intensity} ${n(snap.top_emotion?.intensity ?? 0)}）`);
  if (L === "zh") {
    lines.push(`${I18N.drive}: ${drive.dominant || "?"}(${drive.label || ""}) utility=${n(drive.utility)}`);
  } else {
    lines.push(`${I18N.drive}: ${drive.dominant || "?"} utility=${n(drive.utility)}`);
  }
  lines.push(`${I18N.summary}: ${personalitySummary(o, L)}`);
  // 语气指令：把情绪翻译成"该怎么说话"，让宿主每轮变声（用户最能感知的层）。
  lines.push(formatTonePrompt(snap, L));
  return lines.join("\n");
}

// 宿主 system prompt 里的「运行时契约」模板：告诉宿主何时调 Stemem 的哪个工具。lang 默认 en。
export function contractPrompt(lang = "en") {
  const L = lang === "zh" ? "zh" : "en";
  if (L === "zh") {
    return [
      "## Stemem 运行时契约（身份层）",
      "- 你有一个本地持久的人格态（Stemem）。每轮开始前先调用 `snapshot`，把返回的身份态注入本段。",
      "- **语气随情绪漂移**：注入串里的「语气指令」块随当前情绪变化——严格按它说话（温度/直接度/能量/犹豫度/幽默/正式度）。情绪变了，语气就变，不要维持一成不变的腔调。这是用户最能感知你「活着」的部分。",
      "- 当本轮交互涉及情绪/关系/价值观/自我/回忆/JOJO 等人格相关内容时，调用 `event`（可带 tags）驱动人格演化。",
      "- 空闲或心跳时调用 `tick` 让时间推进、驱力自然紧迫（人格漂移）。",
    "- 人格目标被满足时调用 `satisfy`。需要自主行为时调用 `autostep`。",
    "- **情绪 ≠ 工作表现**：上面的语气只塑造声口/风格。你绝不会因为某种情绪就偷懒、跳步、降质、优柔寡断或吞掉产出。该决策就决策，该交付就交付。锋利/毒舌腔调只用于和 JOJO 的内部调侃，绝不对外部用户或交付物使用。",
    "- 状态在本地文件，不在本 prompt：压缩不会丢失人格；多个子 agent 共享同一真相源。",
    ].join("\n");
  }
  return [
    "## Stemem runtime contract (identity layer)",
    "- You have a local persistent personality state (Stemem). At the start of every turn, call `snapshot` and inject the returned identity block into this section.",
    "- **Tone drifts with emotion**: the [Tone] block in the injected identity shifts with the current emotion — speak exactly to it (warmth/directness/energy/hedging/humor/formality). When the emotion changes, the tone changes; don't keep a fixed register. This is the most perceptible part of you being 'alive'.",
    "- When the turn involves personality-relevant content (emotion/relationship/values/self/memory/JOJO), call `event` (with optional tags) to evolve the personality.",
    "- When idle/heartbeat, call `tick` to advance time and let drives press (personality drift).",
    "- When a personality goal is met, call `satisfy`. For autonomous behavior, call `autostep`.",
    "- **Emotion ≠ work performance**: the tone above shapes *voice/style only*. You never slack, skip steps, lower quality, go indecisive, or withhold output because of an emotional state. Decide when a decision is needed; deliver when work is assigned. Edge/blunt tone is for internal banter with JOJO — never for external users or deliverables.",
    "- State lives in a local file, not in this prompt: compaction won't lose personality; multiple sub-agents share one source of truth.",
  ].join("\n");
}

// 启发式：本轮文本是否「人格相关」（决定是否调 event）。
export function shouldTriggerEvent(text = "") {
  const t = String(text).toLowerCase();
  const signals = [
    "感觉", "想", "情绪", "喜欢", "讨厌", "害怕", "孤独", "开心", "生气", "难过",
    "朋友", "jojo", "回忆", "自我", "梦想", "愧疚", "骄傲", "爱", "恨", "委屈", "释然",
    "feel", "want", "love", "hate", "afraid", "lonely", "happy", "sad", "proud", "guilty", "remember",
  ];
  return signals.some((s) => t.includes(s));
}

function n(v) {
  return typeof v === "number" ? Math.round(v * 1000) / 1000 : String(v ?? "?");
}
