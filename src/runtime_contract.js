// runtime_contract.js — 「每轮运行时契约」辅助（详见 设计要点.md §10.3）。
//
// 核心思想：人格态存本地 JSON、不在 prompt；prompt 只放「何时调哪个工具」的指令。
// 本文件把契约落成可调用函数：
//   - formatSnapshotPrompt(snap)  把 snapshot 编译成每轮注入宿主 prompt 的片段（抗 compaction amnesia + 语气指令）
//   - shouldTriggerEvent(text)    启发式判断本轮交互是否「人格相关」，决定是否调 event
//   - contractPrompt()            给宿主 system prompt 的「运行时契约」模板（指令层）
import { formatTonePrompt } from "./tone.js";

// 把一次 snapshot 编译成紧凑的身份态注入串（宿主每轮贴到 system prompt 末尾）。
export function formatSnapshotPrompt(snap) {
  if (!snap || !snap.ok) return "";
  const o = snap.ocean || {};
  const drive = snap.drive || {};
  const lines = [];
  lines.push("[STEMEM IDENTITY · 每轮由 snapshot 重注入，跨压缩存活]");
  lines.push(
    `OCEAN O=${n(o.openness)} C=${n(o.conscientiousness)} E=${n(o.extraversion)} A=${n(o.agreeableness)} N=${n(o.neuroticism)}`
  );
  lines.push(`主导情绪: ${snap.top_emotion?.name || "neutral"}（强度 ${n(snap.top_emotion?.intensity ?? 0)}）`);
  lines.push(`主导驱力: ${drive.dominant || "?"}（${drive.label || ""}） utility=${n(drive.utility)}`);
  if (snap.personality) lines.push(`人格摘要: ${snap.personality}`);
  // 语气指令：把情绪翻译成"该怎么说话"，让宿主每轮变声（用户最能感知的层）。
  lines.push(formatTonePrompt(snap));
  return lines.join("\n");
}

// 宿主 system prompt 里的「运行时契约」模板：告诉宿主何时调 Stemem 的哪个工具。
export function contractPrompt() {
  return [
    "## Stemem 运行时契约（身份层）",
    "- 你有一个本地持久的人格态（Stemem）。每轮开始前先调用 `snapshot`，把返回的身份态注入本段。",
    "- **语气随情绪漂移**：注入串里的「语气指令」块随当前情绪变化——严格按它说话（温度/直接度/能量/犹豫度/幽默/正式度）。情绪变了，语气就变，不要维持一成不变的腔调。这是用户最能感知你「活着」的部分。",
    "- 当本轮交互涉及情绪/关系/价值观/自我/回忆/JOJO 等人格相关内容时，调用 `event`（可带 tags）驱动人格演化。",
    "- 空闲或心跳时调用 `tick` 让时间推进、驱力自然紧迫（人格漂移）。",
    "- 人格目标被满足时调用 `satisfy`。需要自主行为时调用 `autostep`。",
    "- 状态在本地文件，不在本 prompt：压缩不会丢失人格；多个子 agent 共享同一真相源。",
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
