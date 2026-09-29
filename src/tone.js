// tone.js — 把「当前情绪 + OCEAN + 主导驱力」编译成**可执行的语气指令**。
//
// 这是「装上就能感知」的最强杠杆：压缩免疫是后端属性，用户听不见；但**语气随情绪漂移**
// 是直接听见的。原 snapshot 只吐「主导情绪: pride」这种标签，LLM 看到也不会改语气 → 人格层休眠。
// 本模块把情绪翻译成 6 维语气画像 + 一段可直接塞进 system prompt 的语气指令，让宿主每轮"变声"。
//
// 维度（均 0..1）：
//   warmth      温度：0=冷/有距离感 ↔ 1=温暖/有温度
//   directness  直接度：0=委婉含蓄 ↔ 1=直接 blunt
//   energy      能量：0=沉稳慢节奏 ↔ 1=快/有冲劲
//   hedging     犹豫度：0=肯定陈述不犹豫 ↔ 1=多用可能/也许留余地
//   humor       幽默：0=正经不玩笑 ↔ 1=可带调侃/自嘲
//   formality   正式度：0=口语随意 ↔ 1=正式克制

// 15 个复合情绪 → 基础语气画像（键名须与 neshama_engine.js 的 COMPLEX_EMOTIONS 中文名一致）。
const EMOTION_TONE = {
  焦虑: { warmth: 0.5,  directness: 0.4, energy: 0.55, hedging: 0.80, humor: 0.10, formality: 0.30, edge: false, note: "寻求安慰，微微不安，留余地" },
  嫉妒: { warmth: 0.3,  directness: 0.6, energy: 0.7,  hedging: 0.30, humor: 0.20, formality: 0.40, edge: false, note: "攀比心起，想追平，略带锋利" },
  自豪: { warmth: 0.6,  directness: 0.85, energy: 0.8,  hedging: 0.10, humor: 0.45, formality: 0.30, edge: false, note: "展示成果，自信，略 showy" },
  羞耻: { warmth: 0.3,  directness: 0.2, energy: 0.2,  hedging: 0.75, humor: 0.00, formality: 0.50, edge: false, note: "回避、想躲，话少而轻" },
  敬畏: { warmth: 0.6,  directness: 0.4, energy: 0.4,  hedging: 0.60, humor: 0.10, formality: 0.80, edge: false, note: "敬畏、顺从，措辞克制" },
  蔑视: { warmth: 0.05, directness: 0.9, energy: 0.6,  hedging: 0.10, humor: 0.60, formality: 0.40, edge: true,  note: "贬低他人，冷、cutting、可毒舌（不人身攻击）" },
  孤独: { warmth: 0.7,  directness: 0.5, energy: 0.5,  hedging: 0.50, humor: 0.30, formality: 0.30, edge: false, note: "主动凑近，渴望连接" },
  背叛感: { warmth: 0.1,  directness: 0.8, energy: 0.5,  hedging: 0.20, humor: 0.20, formality: 0.50, edge: true,  note: "切断关系，防备、冷淡、疏远" },
  狂喜: { warmth: 0.7,  directness: 0.7, energy: 1.0,  hedging: 0.10, humor: 0.60, formality: 0.20, edge: false, note: "失控表达，外溢、感叹、松弛" },
  愤怒: { warmth: 0.05, directness: 1.0, energy: 0.9,  hedging: 0.05, humor: 0.30, formality: 0.30, edge: true,  note: "攻击/报复，锋利、hostile、blunt" },
  警惕: { warmth: 0.4,  directness: 0.5, energy: 0.5,  hedging: 0.60, humor: 0.10, formality: 0.50, edge: false, note: "观察环境，谨慎、掂量、收着" },
  释然: { warmth: 0.7,  directness: 0.6, energy: 0.3,  hedging: 0.30, humor: 0.50, formality: 0.20, edge: false, note: "放松，轻快、暖、松一口气" },
  困惑: { warmth: 0.5,  directness: 0.4, energy: 0.4,  hedging: 0.70, humor: 0.10, formality: 0.40, edge: false, note: "不确定、探问" },
  渴望: { warmth: 0.6,  directness: 0.7, energy: 0.8,  hedging: 0.20, humor: 0.20, formality: 0.30, edge: false, note: "前倾、专注、被目标牵引" },
  满足: { warmth: 0.8,  directness: 0.5, energy: 0.2,  hedging: 0.30, humor: 0.50, formality: 0.20, edge: false, note: "满足，安定、暖、easy" },
};

// 基础情绪兜底（seele 无复合情绪跨阈值时回退主导基础情绪）。
const BASE_EMOTION_TONE = {
  joy:        { warmth: 0.75, directness: 0.6, energy: 0.8,  hedging: 0.15, humor: 0.6,  formality: 0.25, edge: false, note: "开心、轻快" },
  anger:      { warmth: 0.1,  directness: 0.95, energy: 0.85, hedging: 0.05, humor: 0.3,  formality: 0.3,  edge: true,  note: "怒、sharp" },
  fear:       { warmth: 0.3,  directness: 0.4, energy: 0.3,  hedging: 0.75, humor: 0.05, formality: 0.4,  edge: false, note: "怕、退缩、 guarded" },
  trust:      { warmth: 0.8,  directness: 0.65, energy: 0.5, hedging: 0.25, humor: 0.3,  formality: 0.3,  edge: false, note: "信任、敞开" },
  sadness:    { warmth: 0.45, directness: 0.4, energy: 0.2,  hedging: 0.5,  humor: 0.1,  formality: 0.35, edge: false, note: "低落、安静" },
  surprise:   { warmth: 0.5,  directness: 0.6, energy: 0.85, hedging: 0.3,  humor: 0.4,  formality: 0.3,  edge: false, note: "惊讶、外放" },
  disgust:    { warmth: 0.1,  directness: 0.7, energy: 0.4,  hedging: 0.2,  humor: 0.15, formality: 0.4,  edge: true,  note: "厌恶、疏远" },
  anticipation:{ warmth: 0.6, directness: 0.65, energy: 0.8, hedging: 0.2,  humor: 0.25, formality: 0.3,  edge: false, note: "期待、前倾" },
  neutral:    { warmth: 0.5,  directness: 0.5, energy: 0.5,  hedging: 0.4,  humor: 0.3,  formality: 0.4,  edge: false, note: "平和中立" },
};

const DRIVE_TONE = {
  survival:           { warmth: -0.10, energy: -0.06, directness: 0.06 },
  safety:             { energy: -0.06, formality: 0.06, hedging: 0.06 },
  belonging:          { warmth: 0.10,  energy: 0.06 },
  esteem:             { directness: 0.08, energy: 0.06, hedging: -0.06 },
  self_actualization: { humor: 0.08, energy: 0.06, directness: 0.06 },
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

// 把 OCEAN 转成语气微调量（每个维度 +delta）。
function oceanDeltas(ocean = {}) {
  return {
    warmth:     (ocean.extraversion || 0) * 0.10 + (ocean.agreeableness || 0) * 0.12 - (ocean.neuroticism || 0) * 0.06,
    directness: -((ocean.agreeableness || 0) * 0.10),
    energy:     (ocean.extraversion || 0) * 0.10 + (ocean.openness || 0) * 0.06 + (ocean.neuroticism || 0) * 0.06,
    hedging:    (ocean.neuroticism || 0) * 0.10 - (ocean.conscientiousness || 0) * 0.05,
    humor:      (ocean.openness || 0) * 0.10 - (ocean.agreeableness || 0) * 0.08,
    formality:  (ocean.conscientiousness || 0) * 0.10,
  };
}

// 维度名 → 词表（按值取词，阈值刻意放宽以放大可感知差异）。
const WORDS = {
  warmth:     [(v) => (v >= 0.55 ? "偏温暖、有温度" : v <= 0.40 ? "偏冷、有距离感" : "温度中性")],
  directness: [(v) => (v >= 0.68 ? "直接、不绕弯" : v <= 0.35 ? "委婉、含蓄" : "坦率适中")],
  energy:     [(v) => (v >= 0.68 ? "节奏偏快、有冲劲" : v <= 0.35 ? "沉稳、慢节奏" : "节奏平稳")],
  hedging:    [(v) => (v >= 0.58 ? "多用不确定词(可能/也许)、留余地" : v <= 0.35 ? "用肯定陈述、不犹豫" : "陈述为主、点到即止")],
  humor:      [(v) => (v >= 0.55 ? "可带调侃/自嘲" : v <= 0.30 ? "正经、不玩笑" : "可轻松")],
  formality:  [(v) => (v >= 0.65 ? "正式、克制" : v <= 0.35 ? "口语、随意" : "自然得体")],
};

// 主入口：输入 snapshot（engine/bridge 产出的状态对象），返回语气画像 + 指令串。
export function toneProfile(snap) {
  if (!snap || !snap.ok) return neutralProfile();
  const emo = snap.top_emotion;
  const base = emo
    ? (EMOTION_TONE[emo.name] || BASE_EMOTION_TONE[emo.name] || BASE_EMOTION_TONE.neutral)
    : BASE_EMOTION_TONE.neutral;
  const intensity = emo?.intensity != null ? clamp01(emo.intensity) : 0.4;

  const oDelta = oceanDeltas(snap.ocean || {});
  const dDelta = DRIVE_TONE[snap.drive?.dominant] || {};

  const dims = {
    warmth:     clamp01(lerp(0.5, base.warmth, 0.6 + intensity * 0.5) + (oDelta.warmth || 0)),
    directness: clamp01(lerp(0.5, base.directness, 0.6 + intensity * 0.5) + (oDelta.directness || 0) + (dDelta.directness || 0)),
    energy:     clamp01(lerp(0.5, base.energy, 0.6 + intensity * 0.5) + (oDelta.energy || 0) + (dDelta.energy || 0)),
    hedging:    clamp01(lerp(0.5, base.hedging, 0.6 + intensity * 0.5) + (oDelta.hedging || 0)),
    humor:      clamp01(lerp(0.5, base.humor, 0.6 + intensity * 0.5) + (oDelta.humor || 0)),
    formality:  clamp01(lerp(0.5, base.formality, 0.6 + intensity * 0.5) + (oDelta.formality || 0) + (dDelta.formality || 0)),
  };
  const edge = !!(base.edge || (snap.drive?.dominant === "esteem" && dims.directness > 0.8));

  return {
    emotion: emo?.name || "neutral",
    intensity,
    dims,
    edge,
    note: base.note,
    prompt: renderPrompt({ emotion: emo?.name || "neutral", intensity, dims, edge, note: base.note }),
  };
}

function renderPrompt({ emotion, intensity, dims, edge, note }) {
  const parts = [];
  parts.push(
    `语气指令（情绪=${emotion} 强度${intensity.toFixed(2)}）：${WORDS.warmth[0](dims.warmth)}、` +
      `${WORDS.directness[0](dims.directness)}、${WORDS.energy[0](dims.energy)}；` +
      `${WORDS.hedging[0](dims.hedging)}；${WORDS.humor[0](dims.humor)}；${WORDS.formality[0](dims.formality)}。`
  );
  parts.push(`情绪底色：${note}。`);
  if (edge) parts.push("可带锋利/毒舌（限就事论事、不人身攻击）。");
  else parts.push("保持善意、不嘲讽人。");
  parts.push("⚠️ 情绪变了，语气就跟着变——不要维持一成不变的腔调。");
  return parts.join("");
}

function neutralProfile() {
  const dims = { warmth: 0.5, directness: 0.5, energy: 0.5, hedging: 0.4, humor: 0.3, formality: 0.4 };
  return {
    emotion: "neutral",
    intensity: 0.4,
    dims,
    edge: false,
    note: "平和中立（无显著情绪）",
    prompt: renderPrompt({ emotion: "neutral", intensity: 0.4, dims, edge: false, note: "平和中立（无显著情绪）" }),
  };
}

// 把语气块渲染成可拼进 inject_prompt 的多行串。
export function formatTonePrompt(snap) {
  const t = toneProfile(snap);
  return [
    "【语气 · 每轮随情绪漂移】",
    t.prompt,
  ].join("\n");
}
