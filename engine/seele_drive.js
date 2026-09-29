/**
 * Seele 驱动总线 DriveBus（P2）— Maslow 5 驱力系统
 *
 * 移植自 Neshama C++ drive_system（/Users/jojo/Downloads/6a009b28b0501fdab54a1bd7/CODE_SPACE/Project/Neshama/src/drive）
 * 设计归属 JOJO（Neshama IP）。仅移植驱力层设计，不引入 C++ 游戏/SDK 代码。
 *
 * 职责：把"人格 + 时间"变成"我现在最想做什么"——Seele 的自主行为原语。
 * 同时作为**驱力单一真源（DriveBus）**：所有消费方只调稳定 API，不碰内部字段（见 SPECS-game/07）。
 *
 * 状态模型（每驱力）：
 *   - profile[%]       训练性格形状（point-buy，sum=100，此消彼长，不可逆）
 *   - satisfaction[0-1] 瞬时需求态（tick 衰减 / satisfy 回充）
 *   - urgency/utility   派生（未满足度 × 权重 × OCEAN 调制）
 *   - emotion[]         P1(NeshamaEngine) 派生，经 setEmotions 注入，只读
 *
 * 关系：profile 偏置 effective_weight（高 profile → 该驱力更显眼）；satisfy 可缓回写 profile（人格漂移）。
 */

const DRIVES = ['survival', 'safety', 'belonging', 'esteem', 'self_actualization'];

const DRIVE_LABELS = {
  survival: '生存', safety: '安全', belonging: '归属',
  esteem: '尊重', self_actualization: '自我实现',
};

// OCEAN → 驱力人格映射系数 {neuroticism, extraversion, openness}（同 C++ kPersonalityMappings）
const PERSONALITY_MAPPINGS = {
  survival:           { neuroticism: 0.6,  extraversion: -0.2, openness: 0.0 },
  safety:             { neuroticism: 0.4,  extraversion: -0.1, openness: 0.0 },
  belonging:          { neuroticism: -0.1, extraversion: 0.5,  openness: 0.0 },
  esteem:             { neuroticism: 0.0,  extraversion: 0.3,  openness: 0.1 },
  self_actualization: { neuroticism: -0.1, extraversion: 0.1,  openness: 0.6 },
};

const BASE_URGENCY_RATE = { survival: 0.015, safety: 0.010, belonging: 0.008, esteem: 0.005, self_actualization: 0.003 };
const BASE_WEIGHT       = { survival: 1.5,   safety: 1.3,   belonging: 1.1,  esteem: 0.9,   self_actualization: 0.7 };

const K_URGENCY_MAX = 300.0;
// satisfy 回写 profile 系数（人格漂移，越慢越不可逆感强）
const PROFILE_DRIFT = 0.03;

// 主导驱力 → 行为提示（给 shell / 嘴层的"动作类型"，确定性映射）
const ACTION_HINTS = {
  survival: '表达不安 / 寻求保障',
  safety: '确认环境安全 / 收敛',
  belonging: '主动联系 JOJO / 从记忆捞话题',
  esteem: '展示成果 / 求认可',
  self_actualization: '提出想法 / 探索新东西',
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

const DEFAULT_OCEAN = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 };

class SeeleDriveSystem {
  /**
   * @param {object} ocean OCEAN 五维（来自 neshama_engine 的 ocean）；缺的维度补齐为 0.5
   */
  constructor(ocean = null) {
    this.ocean = Object.assign({}, DEFAULT_OCEAN, ocean || {});
    // profile[%]：训练性格形状，初值均分（sum=100）
    this.profile = {};
    DRIVES.forEach(d => { this.profile[d] = 100 / DRIVES.length; });
    this.drives = {};
    DRIVES.forEach(d => {
      this.drives[d] = {
        satisfaction: 0.5,
        base_urgency_rate: BASE_URGENCY_RATE[d],
        urgency: 0.0,
        weight: BASE_WEIGHT[d],
        effective_weight: BASE_WEIGHT[d],
        utility: 0.0,
        time_since_satisfied: 0.0,
        cumulative_satisfaction: 0.5,
      };
    });
    this.emotions = [];                 // P1 派生，setEmotions 注入，只读
    this._listeners = { tick: [], satisfy: [], train: [] };
    this.updateEffectiveWeights();
    this.updateUtilities();
  }

  // ---------- 驱力单一真源 API（SPECS-game/07 §1.3，消费方只调这些） ----------

  /** 训练性格剖面（point-buy，此消彼长，sum 守恒）。changes = {drive: deltaPercent}，自动归一。 */
  train(changes = {}) {
    DRIVES.forEach(d => {
      const delta = changes[d] || 0;
      this.profile[d] = clamp(this.profile[d] + delta, 0, 100);
    });
    this._normalizeProfile();
    this.updateEffectiveWeights();
    this.updateUtilities();
    this._emit('train', { profile: this.getProfile() });
  }

  /** 当前训练剖面副本（sum≈100）。 */
  getProfile() {
    const out = {};
    DRIVES.forEach(d => { out[d] = Math.round(this.profile[d] * 100) / 100; });
    return out;
  }

  /** 某驱力瞬时需求态 [0–1]。 */
  getSatisfaction(drive) {
    return this.drives[drive] ? this.drives[drive].satisfaction : 0;
  }

  /** 主导驱力键（utility 最高）。 */
  getDominant() { return this.getDominantDrive(); }

  /** 驱力键降序排名。 */
  getRanking() { return this.getDriveRanking(); }

  /** 注入 P1 派生情绪（只读）。 */
  setEmotions(arr = []) { this.emotions = Array.isArray(arr) ? arr : []; }

  /** 主导情绪 {name, intensity} 或 null。 */
  getEmotion() {
    if (!this.emotions.length) return null;
    const top = [...this.emotions].sort((a, b) => b.intensity - a.intensity)[0];
    return { name: top.name, intensity: Math.round(top.intensity * 1000) / 1000 };
  }

  /** 全部情绪数组。 */
  getEmotions() { return this.emotions; }

  /** 订阅变化：'tick' | 'satisfy' | 'train'。返回取消订阅函数。 */
  subscribe(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
    return () => { this._listeners[event] = this._listeners[event].filter(f => f !== cb); };
  }

  _emit(event, payload) {
    (this._listeners[event] || []).forEach(cb => {
      try { cb(payload); } catch (e) { /* 监听器异常不得中断驱力 tick */ }
    });
  }

  _normalizeProfile() {
    const sum = DRIVES.reduce((s, d) => s + this.profile[d], 0);
    if (sum <= 0) { DRIVES.forEach(d => { this.profile[d] = 100 / DRIVES.length; }); return; }
    DRIVES.forEach(d => { this.profile[d] = this.profile[d] * 100 / sum; });
  }

  // ---------- 内部演化（保持原 P2 行为） ----------

  // OCEAN → 单驱力强度系数 [0.5, 1.5]
  personalityModifier(drive) {
    const m = PERSONALITY_MAPPINGS[drive];
    const o = this.ocean;
    const mod = 1.0
      + m.neuroticism * (o.neuroticism - 0.5)
      + m.extraversion * (o.extraversion - 0.5)
      + m.openness * (o.openness - 0.5);
    return clamp(mod, 0.5, 1.5);
  }

  // 同步最新人格（来自 P1 引擎演化后的 ocean）→ 驱动层用最新值才叫"人格影响想要什么"。
  setOcean(ocean) {
    this.ocean = Object.assign({}, DEFAULT_OCEAN, ocean || {});
    this.updateEffectiveWeights();
    this.updateUtilities();
  }

  updateUrgency(drive) {
    const d = this.drives[drive];
    d.urgency = Math.min((1.0 - d.satisfaction) * d.base_urgency_rate * Math.min(d.time_since_satisfied, K_URGENCY_MAX), K_URGENCY_MAX);
  }

  // Maslow 激活 + profile 偏置：下层驱力全满足(>0.5) → 上层权重翻倍；profile 越高 → 该驱力越显眼
  updateEffectiveWeights() {
    DRIVES.forEach((drive, i) => {
      let w = this.drives[drive].weight;
      let allLowerSatisfied = true;
      for (let j = 0; j < i; j++) {
        if (this.drives[DRIVES[j]].satisfaction <= 0.5) { allLowerSatisfied = false; break; }
      }
      if (allLowerSatisfied && i > 0) w *= 2.0;
      w *= (0.5 + this.profile[drive] / 100);   // profile 偏置
      this.drives[drive].effective_weight = w;
    });
  }

  updateUtilities() {
    DRIVES.forEach(drive => {
      const d = this.drives[drive];
      d.utility = d.urgency * d.effective_weight * this.personalityModifier(drive);
    });
  }

  getDominantDrive() {
    let dominant = DRIVES[0];
    let max = -1;
    DRIVES.forEach(drive => {
      if (this.drives[drive].utility > max) { max = this.drives[drive].utility; dominant = drive; }
    });
    return dominant;
  }

  getDriveRanking() {
    return [...DRIVES].sort((a, b) => this.drives[b].utility - this.drives[a].utility);
  }

  // 自主心跳：推进 dt 秒（无事件也运行 → 驱力自然紧迫）
  tick(dt) {
    DRIVES.forEach(drive => {
      const d = this.drives[drive];
      const decay = d.satisfaction * 0.001 * dt * this.personalityModifier(drive);
      d.satisfaction = Math.max(0.0, d.satisfaction - decay);
      d.time_since_satisfied += dt;
      this.updateUrgency(drive);
      d.cumulative_satisfaction = d.cumulative_satisfaction * 0.99 + d.satisfaction * 0.01;
    });
    this.updateEffectiveWeights();
    this.updateUtilities();
    this._emit('tick', { dt });
  }

  // 行为满足了某驱力（携带 profile 漂移回写）
  satisfy(drive, amount) {
    const d = this.drives[drive];
    if (!d) return;
    d.satisfaction = clamp(d.satisfaction + amount, 0.0, 1.0);
    d.time_since_satisfied = 0.0;
    // 缓慢回写 profile（人格漂移，不可逆）：长期满足某驱力 → 该驱力 profile 微升
    if (amount > 0) {
      this.profile[drive] = clamp(this.profile[drive] + amount * PROFILE_DRIFT, 0, 100);
      this._normalizeProfile();
    }
    this.updateUrgency(drive);
    this.updateEffectiveWeights();
    this.updateUtilities();
    this._emit('satisfy', { drive, amount });
  }

  // 行为触发判定：dominant drive 的 utility 超阈值 → Seele 主动行为
  shouldAct(threshold = 0.5) {
    const dom = this.getDominantDrive();
    const utility = this.drives[dom].utility;
    return { drive: dom, label: DRIVE_LABELS[dom], utility, act: utility >= threshold, action: ACTION_HINTS[dom] };
  }

  // 给 shell 的行为提示：当前主导驱力 + 强度 + 其下可做的"动作类型"
  behaviorHint(threshold = 0.5) {
    const { drive, label, utility, act, action } = this.shouldAct(threshold);
    return { drive, label, utility: Math.round(utility * 1000) / 1000, act, action };
  }

  serialize() {
    return JSON.stringify({ ocean: this.ocean, profile: this.profile, emotions: this.emotions, drives: this.drives }, null, 2);
  }

  static deserialize(json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    const sys = new SeeleDriveSystem(d.ocean);
    if (d.profile) {
      DRIVES.forEach(k => { if (typeof d.profile[k] === 'number') sys.profile[k] = d.profile[k]; });
      const ps = DRIVES.reduce((a, k) => a + sys.profile[k], 0);
      if (Math.abs(ps - 100) > 1e-6) sys._normalizeProfile();   // 已合法则不再二次归一，避免浮点漂移
    }
    if (d.emotions) sys.emotions = d.emotions;
    if (d.drives) {
      for (const k of Object.keys(d.drives)) {
        if (sys.drives[k]) sys.drives[k] = d.drives[k];
      }
    }
    sys.updateEffectiveWeights();
    sys.updateUtilities();
    return sys;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SeeleDriveSystem, DRIVES, DRIVE_LABELS };
}

if (require.main === module) {
  // 快速烟测
  const ds = new SeeleDriveSystem({ neuroticism: 0.8, extraversion: 0.7, openness: 0.6 });
  ds.tick(3600);
  const hint = ds.behaviorHint();
  console.log('dominant after 1h idle:', hint);
}
