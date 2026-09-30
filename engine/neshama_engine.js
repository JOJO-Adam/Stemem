/**
 * Neshama JS Engine v1.0
 * OCEAN 人格 + 复合情绪 + 驱力系统 + 性格锁
 */
// SPDX-License-Identifier: MIT
// JavaScript port/derivative of Neshama Soul Engine (MIT, Copyright (c) 2026 Neshama AI — gitee.com/neshama_ai/neshama).
// Redistributed under MIT per upstream license terms.

// ========== OCEAN 人格 ==========
const OCEAN_DIMS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

const OCEAN_LABELS = {
  openness: { high: '开放', low: '保守', label: '开放性' },
  conscientiousness: { high: '自律', low: '随性', label: '尽责性' },
  extraversion: { high: '外向', low: '内向', label: '外向性' },
  agreeableness: { high: '宜人', low: '强势', label: '宜人性' },
  neuroticism: { high: '敏感', low: '稳定', label: '神经质' },
};

// ========== 基础情绪 (Ekman 6) ==========
const BASE_EMOTIONS = ['joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust'];

// ========== 15 种复合情绪 ==========
const COMPLEX_EMOTIONS = {
  焦虑: {
    components: { fear: 0.5, sadness: 0.3, anticipation: 0.2 },
    threshold: 0.5,
    behavior: '寻求安慰',
    description: '内心被不安填满，你渴望抓住什么来确定感'
  },
  嫉妒: {
    components: { anger: 0.4, sadness: 0.4, fear: 0.2 },
    threshold: 0.45,
    behavior: '追求同等成就',
    description: '看着别人拥有的，你心里像烧着一团火'
  },
  自豪: {
    components: { joy: 0.6, satisfaction: 0.4 },
    threshold: 0.55,
    behavior: '展示成果',
    description: '你做到了。你的胸膛微微挺起，眼神发亮'
  },
  羞耻: {
    components: { sadness: 0.5, fear: 0.3, disgust: 0.2 },
    threshold: 0.5,
    behavior: '回避行为',
    description: '你想找个地缝钻进去。那件事在不断重播'
  },
  敬畏: {
    components: { fear: 0.5, surprise: 0.5 },
    threshold: 0.5,
    behavior: '服从/追随',
    description: '巨大的力量面前，你屏住了呼吸'
  },
  蔑视: {
    components: { anger: 0.5, disgust: 0.3, joy: 0.2 },
    threshold: 0.45,
    behavior: '贬低他人',
    description: '你从鼻子里哼了一声。不值一提'
  },
  孤独: {
    components: { sadness: 0.5, fear: 0.3, anger: 0.2 },
    threshold: 0.5,
    behavior: '主动社交',
    description: '喧闹的世界里，只有你一个人在角落'
  },
  背叛感: {
    components: { anger: 0.4, sadness: 0.4, fear: 0.2 },
    threshold: 0.55,
    behavior: '切断关系',
    description: '信任是一面摔碎的镜子，你弯腰时割伤了手'
  },
  狂喜: {
    components: { joy: 0.7, surprise: 0.3 },
    threshold: 0.6,
    behavior: '失控表达',
    description: '你的心快要跳出胸膛，世界在闪闪发光'
  },
  愤怒: {
    components: { anger: 0.6, fear: 0.4 },
    threshold: 0.55,
    behavior: '攻击/报复',
    description: '血涌上头顶。你握紧了拳头'
  },
  警惕: {
    components: { anticipation: 0.4, fear: 0.3, satisfaction: 0.3 },
    threshold: 0.45,
    behavior: '观察环境',
    description: '有什么不对劲。你的后背微微绷紧'
  },
  释然: {
    components: { joy: 0.4, satisfaction: 0.4, anticipation: 0.2 },
    threshold: 0.5,
    behavior: '放松行为',
    description: '紧绷的弦松开了。你长长地呼出一口气'
  },
  困惑: {
    components: { surprise: 0.4, sadness: 0.3, fear: 0.3 },
    threshold: 0.45,
    behavior: '寻求答案',
    description: '这一切说不通。你皱起了眉头'
  },
  渴望: {
    components: { anticipation: 0.5, sadness: 0.3, joy: 0.2 },
    threshold: 0.5,
    behavior: '追求目标',
    description: '你想要，真的很想要。前方有什么在牵引着你'
  },
  满足: {
    components: { joy: 0.5, satisfaction: 0.3, achievement: 0.2 },
    threshold: 0.5,
    behavior: '维持现状',
    description: '这样就很好。你靠在椅背上，微笑了一下'
  },
};

// ========== 9 种驱力 ==========
const DRIVES = ['survival', 'safety', 'belonging', 'glory', 'honor', 'esteem', 'revenge', 'loyalty', 'self_actualization'];

const DRIVE_LABELS = {
  survival: '生存', safety: '安全', belonging: '归属',
  glory: '荣耀', honor: '荣誉', esteem: '尊重',
  revenge: '复仇', loyalty: '忠诚', self_actualization: '自我实现'
};

// 驱力冲突对
const DRIVE_CONFLICTS = {
  glory: 'loyalty',
  honor: 'revenge',
  revenge: 'honor',
  revenge_alt: 'loyalty',
  loyalty: 'revenge',
  loyalty_alt: 'glory',
};

// ========== 情绪代理变量 ==========
const EMOTION_PROXIES = ['anticipation', 'satisfaction', 'achievement', 'trust'];

// ========== 引擎类 ==========
class NeshamaEngine {
  constructor(ocean = null) {
    // 初始化 OCEAN（默认中庸人格）；缺的维度补齐为 0.5，防部分 ocean 传入导致 NaN
    const DEFAULT_OCEAN = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 };
    this.ocean = Object.assign({}, DEFAULT_OCEAN, ocean || {});

    // 初始情绪
    this.emotions = {
      joy: 0.4, sadness: 0.3, anger: 0.3,
      fear: 0.3, surprise: 0.3, disgust: 0.2,
      anticipation: 0.4, satisfaction: 0.4,
      achievement: 0.3, trust: 0.5,
    };

    // 情绪基线（确定性回归用，不随事件漂移）
    this.baseline_emotions = { ...this.emotions };

    // 初始 OCEAN 基线（漂移均值回归锚点）
    this.baseline_ocean = { ...this.ocean };

    // 初始驱力
    this.drives = {};
    DRIVES.forEach(d => { this.drives[d] = 0.5; });

    // 历史记录
    this.history = [];
    this.active_emotions = [];
    this.emotion_log = []; // 情绪高光
    this.ocean_history = [{ age: 0, ocean: { ...this.ocean } }];
  }

  // ---- 复合情绪计算 ----
  computeComplexEmotions() {
    const active = [];
    for (const [name, def] of Object.entries(COMPLEX_EMOTIONS)) {
      let sum = 0;
      let totalWeight = 0;
      for (const [emo, weight] of Object.entries(def.components)) {
        const val = this.emotions[emo] || 0;
        sum += val * weight;
        totalWeight += weight;
      }
      const intensity = totalWeight > 0 ? sum / totalWeight : 0;
      if (intensity >= def.threshold) {
        active.push({ name, intensity, ...def });
      }
    }
    active.sort((a, b) => b.intensity - a.intensity);
    this.active_emotions = active;
    return active;
  }

  // ---- 事件触发：更新情绪 + 驱力 ----
  triggerEvent(event) {
    const changes = [];

    // 情绪映射
    const emotionDeltas = {
      success: { joy: 0.15, achievement: 0.15, satisfaction: 0.1 },
      failure: { sadness: 0.15, achievement: -0.1 },
      betrayal: { anger: 0.2, fear: 0.1, trust: -0.15 },
      loss: { sadness: 0.2, fear: 0.1 },
      discovery: { surprise: 0.15, anticipation: 0.1 },
      conflict: { anger: 0.1, fear: 0.05 },
      connection: { joy: 0.1, trust: 0.1, belonging: 0.05 },
      isolation: { sadness: 0.1, fear: 0.1 },
    };

    const tags = event.emotion_tags || [];
    for (const tag of tags) {
      const delta = emotionDeltas[tag] || {};
      for (const [emo, val] of Object.entries(delta)) {
        if (this.emotions[emo] !== undefined) {
          this.emotions[emo] = clamp(this.emotions[emo] + val, 0, 1);
        }
      }
    }

    // 驱力变化
    if (event.drive_deltas) {
      for (const [drive, val] of Object.entries(event.drive_deltas)) {
        if (this.drives[drive] !== undefined) {
          this.drives[drive] = clamp(this.drives[drive] + val, 0, 1);
        }
      }
    }

    // 情绪衰减（确定性回归个体基线，避免随机噪声污染演化信号）
    for (const key of Object.keys(this.emotions)) {
      const base = this.baseline_emotions[key] ?? 0.3;
      this.emotions[key] = clamp(this.emotions[key] + (base - this.emotions[key]) * 0.15, 0.05, 0.95);
    }

    // 记录
    this.computeComplexEmotions();

    // OCEAN 自动漂移：重复情绪信号真实推动人格（演化吃记忆才成立）
    this.applyOceanDrift();

    // 情绪高光
    if (this.active_emotions.length > 0) {
      const top = this.active_emotions[0];
      this.emotion_log.push({
        event: event.text,
        emotion: top.name,
        intensity: top.intensity,
        description: top.description,
      });
      if (this.emotion_log.length > 10) this.emotion_log.shift();
    }

    this.history.push({
      event: event.text,
      choice: event.choice_text || '',
      emotions: { ...this.emotions },
      active: [...this.active_emotions],
    });

    return this.active_emotions;
  }

  // ---- OCEAN 自动漂移：情绪组 → 人格五维 ----
  // 原则：持续被激活的情绪会把对应人格维度慢慢推离基线。
  // 每次漂移量极小（~0.005），需跨多个事件累积才可见，模拟真实人格演化节奏。
  applyOceanDrift() {
    const e = this.emotions;
    const mean = (a, b) => (a + b) / 2;
    // 情绪信号（有符号，正=拉高维度，负=拉低维度）
    const signal = {
      openness:           (mean(e.anticipation, e.surprise) - mean(e.sadness, e.anger)),
      conscientiousness:  (mean(e.achievement, e.satisfaction) - e.sadness * 0.5),
      extraversion:       (mean(e.joy, e.trust) - mean(e.sadness, e.fear)),
      agreeableness:      (mean(e.trust, e.joy) - mean(e.anger, e.disgust)),
      neuroticism:        (mean(e.fear, e.sadness) - mean(e.joy, e.satisfaction)),
    };
    const LR = 0.01; // 学习率
    for (const dim of OCEAN_DIMS) {
      // 漂移 + 向基线的微弱均值回归，避免单向跑飞到边界
      const drift = signal[dim] * LR;
      const regress = (this.baseline_ocean[dim] - this.ocean[dim]) * 0.002;
      this.ocean[dim] = clamp(this.ocean[dim] + drift + regress, 0.05, 0.95);
    }
    this.ocean_history.push({ age: this.history.length, ocean: { ...this.ocean } });
    if (this.ocean_history.length > 500) this.ocean_history.shift();
  }

  // ---- 性格锁检测 ----
  checkChoiceLock(oceanRequirement) {
    if (!oceanRequirement) return { locked: false };

    const reason = [];
    const dims = ['openness','conscientiousness','extraversion','agreeableness','neuroticism'];

    for (const dim of dims) {
      const req = oceanRequirement[dim];
      if (req === undefined || req === null) continue;
      if (this.ocean[dim] < req) {
        reason.push({
          dim,
          label: OCEAN_LABELS[dim].label,
          your_value: this.ocean[dim],
          required: req,
        });
      }
    }

    return {
      locked: reason.length > 0,
      reasons: reason,
    };
  }

  // ---- OCEAN 人格微调 ----
  evolvePersonality(age, ocnDeltas) {
    if (!ocnDeltas) return;
    for (const [dim, val] of Object.entries(ocnDeltas)) {
      if (this.ocean[dim] !== undefined) {
        this.ocean[dim] = clamp(this.ocean[dim] + val, 0.05, 0.95);
      }
    }
    this.ocean_history.push({ age, ocean: { ...this.ocean } });
  }

  // ---- 状态序列化 / 反序列化（跨会话持久化） ----
  serialize() {
    return JSON.stringify({
      version: 2,
      ocean: this.ocean,
      emotions: this.emotions,
      drives: this.drives,
      baseline_emotions: this.baseline_emotions,
      baseline_ocean: this.baseline_ocean,
      history: this.history.slice(-50),
      active_emotions: this.active_emotions,
      emotion_log: this.emotion_log,
      ocean_history: this.ocean_history.slice(-200),
    }, null, 2);
  }

  static deserialize(json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    const eng = new NeshamaEngine(d.ocean || null);
    eng.emotions = d.emotions || eng.emotions;
    eng.drives = d.drives || eng.drives;
    eng.baseline_emotions = d.baseline_emotions || eng.baseline_emotions;
    eng.baseline_ocean = d.baseline_ocean || eng.baseline_ocean;
    eng.history = d.history || [];
    eng.active_emotions = d.active_emotions || [];
    eng.emotion_log = d.emotion_log || [];
    eng.ocean_history = d.ocean_history || eng.ocean_history;
    return eng;
  }

  // ---- 获取人格描述 ----
  getPersonalitySummary() {
    const parts = [];
    for (const dim of OCEAN_DIMS) {
      const v = this.ocean[dim];
      const info = OCEAN_LABELS[dim];
      parts.push(v >= 0.55 ? `${info.label}偏高` : v <= 0.45 ? `${info.label}偏低` : `${info.label}中等`);
    }
    return parts.join('，');
  }

  // ---- 驱力冲突检测 ----
  getDriveConflicts() {
    const conflicts = [];
    if (this.drives.glory > 0.6 && this.drives.loyalty > 0.6) {
      conflicts.push('荣耀与忠诚在撕扯');
    }
    if (this.drives.honor > 0.6 && this.drives.revenge > 0.6) {
      conflicts.push('荣誉感与复仇欲望在对抗');
    }
    if (this.drives.belonging > 0.7 && this.drives.glory > 0.7) {
      conflicts.push('你想回家，但脚步停不下来');
    }
    return conflicts;
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// 浏览器环境
if (typeof globalThis !== 'undefined') {
  globalThis.NeshamaEngine = NeshamaEngine;
  globalThis.OCEAN_DIMS = OCEAN_DIMS;
  globalThis.OCEAN_LABELS = OCEAN_LABELS;
  globalThis.DRIVES = DRIVES;
  globalThis.DRIVE_LABELS = DRIVE_LABELS;
  globalThis.COMPLEX_EMOTIONS = COMPLEX_EMOTIONS;
}

// Node 环境（Seele 子进程 require 真源）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NeshamaEngine, OCEAN_DIMS, OCEAN_LABELS, DRIVES, DRIVE_LABELS, COMPLEX_EMOTIONS };
}
