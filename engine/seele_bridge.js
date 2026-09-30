#!/usr/bin/env node
/**
 * Seele 引擎桥（P1-4）
 *
 * 串起 P1 人格引擎（NeshamaEngine 真源） + P2 驱动引擎（SeeleDriveSystem），
 * 把"记忆事件 → 人格演化 → 驱力紧迫 → 主动行为"收敛到一份持久状态
 * `data/seele_state.json`，作为 Node 子进程被 backend/seele.py 调用。
 *
 * 每个子命令往 stdout 输出**一行 JSON**，Python 侧解析即可。
 *
 * 路径解析顺序：
 *             1. 环境变量 NESHAMA_ENGINE（Stemem 调用时由 engine_client 注入 vendored 副本）
 *             2. 相对本文件的 ../../Neshama/Neshama_Sim/neshama_engine.js（同机 Neshama 项目）
 *             （已 vendored 进 Stemem/engine/，正常情况下由环境变量注入，无需兜底）
 */
// SPDX-License-Identifier: MIT
// Originally part of the Seele project (AGPL-3.0, Copyright (c) 2026 JOJO & Adam).
// Relicensed to MIT for the Stemem repository by the sole copyright holder.

const fs = require('fs');
const path = require('path');

// ---------- 解析真源引擎路径 ----------
function resolveEnginePath() {
  if (process.env.NESHAMA_ENGINE) return process.env.NESHAMA_ENGINE;
  const candidates = [
    path.resolve(__dirname, '../../Neshama/Neshama_Sim/neshama_engine.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    '找不到 NeshamaEngine 真源。请设置环境变量 NESHAMA_ENGINE 指向 neshama_engine.js（本仓库已 vendored 进 engine/）'
  );
}

const { NeshamaEngine, COMPLEX_EMOTIONS } = require(resolveEnginePath());
const { SeeleDriveSystem, DRIVES, DRIVE_LABELS } = require('./seele_drive.js');

// ---------- 状态文件路径 ----------
const STATE_PATH = process.env.SEELE_DATA
  ? path.resolve(process.env.SEELE_DATA)
  : path.resolve(__dirname, '../data/seele_state.json');

// ---------- 状态读写 ----------
function loadState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  const d = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const engine = NeshamaEngine.deserialize(d.engine || '{}');
  const drive = SeeleDriveSystem.deserialize(d.drive || '{}');
  return { engine, drive, rumination: d.rumination || {} };
}

function saveState(engine, drive, rumination) {
  const out = {
    version: 1,
    updated_at: new Date().toISOString(),
    engine: JSON.parse(engine.serialize()),
    drive: JSON.parse(drive.serialize()),
    rumination: rumination && Object.keys(rumination).length ? rumination : {},
  };
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(out, null, 2), 'utf8');
}

function freshState(ocean = null) {
  const engine = new NeshamaEngine(ocean || null);
  const drive = new SeeleDriveSystem(engine.ocean);
  return { engine, drive, rumination: {} };
}

// P1 的 OCEAN 演化后，把最新人格推给驱动层（人格调制驱力必须用最新值）。
// 情绪表面由 snapshot() 内 computeMoodSurface 统一计算并注入 DriveBus（D-G8 单一真源）。
function syncDriveOcean(drive, engine) {
  drive.setOcean(engine.ocean);
}

// ---------- Seele 侧情绪表面层（D-G8 情绪驱力） ----------
// Neshama 真源只算「复合情绪触发」：阈值 0.45–0.6 + 每次事件向基线衰减 0.15 →
// Seele 的稀疏交互（聊天/事件稀疏、tick 不碰情绪）几乎永远冲不过 → active_emotions 恒空
// → getEmotion() 恒 null → 19 复合情绪在 Seele 休眠。伴侣语境要"情绪有反应"，故 Seele
// 自校准（不碰 Neshama 真源）：用 engine.emotions（6 基础 + 4 代理）跑 COMPLEX_EMOTIONS
// 加权强度，阈值降到 SEELE_EMOTION_THRESHOLD，让情绪在少量交互下就冒头；无复合跨阈值时
// 回退主导基础情绪作 mood —— 保证 06 视觉 / 05 物语 / 自主行为恒有情绪信号。
//
// 校准历史：0.42 → 0.35（09-29）。原因：负向复合情绪（shame/anger/betrayal 类）单次事件
// 强度仅 ~0.34，卡在 0.42 下永远浮不出 → 主导情绪黏在正向往向（pride 易浮），人格层"听不出
// 情绪变化"。降到 0.35 后单次负面遭遇也能浮现，语气随情绪漂移才真正可被用户感知。
// 代价：静置态会多浮出 1–2 个低强度复合情绪（如 pride/contentment 作静息基调），可接受。
const SEELE_EMOTION_THRESHOLD = 0.35;

function computeMoodSurface(engine) {
  const state = engine.emotions || {};
  const surfaced = [];
  for (const [name, def] of Object.entries(COMPLEX_EMOTIONS)) {
    let sum = 0, tw = 0;
    for (const [emo, w] of Object.entries(def.components)) {
      const v = state[emo] || 0;
      sum += v * w; tw += w;
    }
    const intensity = tw > 0 ? sum / tw : 0;
    if (intensity >= SEELE_EMOTION_THRESHOLD) {
      surfaced.push({
        name,
        intensity: Math.round(intensity * 1000) / 1000,
        behavior: def.behavior || null,
        description: def.description || null,
      });
    }
  }
  surfaced.sort((a, b) => b.intensity - a.intensity);
  // 兜底：无复合情绪跨阈值 → 取主导基础情绪（joy/anger/.../trust）作 mood
  if (surfaced.length === 0) {
    const entries = Object.entries(state);
    if (entries.length) {
      entries.sort((a, b) => b[1] - a[1]);
      const [baseName, baseVal] = entries[0];
      surfaced.push({
        name: baseName,
        intensity: Math.round(baseVal * 1000) / 1000,
        behavior: null,
        description: null,
        base: true,
      });
    }
  }
  return surfaced;
}

// ---------- 情绪时间衰减（Seele 校准层，科学校准版） ----------
// 解决「压缩免疫的反面诅咒」：状态永不忘 = 负面态永不忘 → 否则会和一个永久阴阳怪气的
// agent 共事到疯。Neshama 真源只在 triggerEvent 时按事件衰减 0.15，但 tick（时间流逝）
// 不触发事件 → 空闲期情绪冻结、永不回落。这里在 tick/autostep 时按经过秒数做指数衰减，
// 把 engine.emotions 拉回 baseline_emotions。
//
// 科学校准（09-30 JOJO 质疑"1 天 TAU 反科学"后重做）：公式 state(t)=baseline+(state-baseline)·exp(−γ·Δt)
// 正是 Kuppens(2010) DynAffect 的 Ornstein-Uhlenbeck 模型（数学结构正确，错的是常数 TAU）。
// 各情绪时间常数取自 Verduyn & Lavrijsen(2014/2015) 与经验取样中位数：典型情绪片段极短
// （愤怒中位 11–22min、恐惧~16min、喜悦~19min），悲伤最长寿但给小时级（非 120h 反刍极端）。
// 反刍(rumination)：高重要性事件 / 反刍型情绪（背叛/失落/冲突）临时延长 TAU（Verduyn: 重要性+反刍驱动时长），
// 窗口 RUMINATION_WINDOW 后回落正常速率——既不一秒忘、也不记仇到天荒地老。
// 纯状态层松弛——不中断工作、不需批准、不调漫游，不碰「情绪≠工作表现」护栏。
const EMOTION_DECAY_TAU = {
  joy: 1800,          // 30 min（正情绪略黏）
  sadness: 10800,     // 3 h（最长寿；反刍极端才到天）
  anger: 1200,        // 20 min
  fear: 900,          // 15 min
  surprise: 120,      // 2 min
  disgust: 1500,      // 25 min
  anticipation: 1800, // 30 min
  satisfaction: 1800, // 30 min
  achievement: 1800,  // 30 min
  trust: 3600,        // 1 h（关系型，重建/衰退更慢）
};
const EMOTION_DECAY_TAU_DEFAULT = 1800; // 未列明情绪回退 30 min
const RUMINATION_TAU_MULT = 8;          // 反刍时 TAU 放大倍数（情绪滞留更久）
const RUMINATION_WINDOW = 3600;         // 反刍持续窗口（秒）：窗口内慢衰，过窗正常衰
const RUMINATION_TAGS = new Set([
  'betrayal', 'loss', 'failure', 'conflict', 'isolation', 'grief',
  '背叛感', '悲伤', '羞耻', '屈辱', '孤独', '失落',
]);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// rumination: { [emotionKey]: 剩余反刍秒数 }；为 0/缺失则按常态 TAU 衰减。
function decayEmotions(engine, seconds, rumination) {
  const emo = engine.emotions || {};
  const base = engine.baseline_emotions || {};
  const t = Math.max(0, Number(seconds) || 0);
  if (t <= 0) return;
  for (const key of Object.keys(emo)) {
    const tau = (EMOTION_DECAY_TAU[key] != null ? EMOTION_DECAY_TAU[key] : EMOTION_DECAY_TAU_DEFAULT);
    const ruminating = rumination && rumination[key] > 0;
    // k = 1 - e^(-t/(TAU·mult))：已衰减比例（越大越靠近基线）。反刍时 mult=8 → 衰减更慢。
    const k = 1 - Math.exp(-t / (tau * (ruminating ? RUMINATION_TAU_MULT : 1)));
    if (k <= 0) continue;
    const b = base[key] != null ? base[key] : 0.4;
    const cur = emo[key] || 0;
    // new = cur·(1−k) + b·k：向基线移动 k 比例，绝不越过基线（clamp 与 Neshama 一致）
    emo[key] = clamp(cur * (1 - k) + b * k, 0.05, 0.95);
  }
}

// ---------- 快照（对外 JSON） ----------
// 全部经由 DriveBus 稳定 API 取数（getDominant / getProfile / getSatisfaction / getEmotion
// / getRanking / shouldAct），不再依赖 behaviorHint 并行表示（D-G8：单一真源）。
function snapshot(engine, drive) {
  drive.ensureFresh(); // 惰性重算：seele_drive 改为 dirty 标记后，直接读 drive.drives[x].utility 前必须确保新鲜
  const dom = drive.getDominant();
  const domUtil = Math.round(drive.drives[dom].utility * 1000) / 1000;
  const sa = drive.shouldAct(0.5);
  const ranking = drive.getRanking().map((d) => ({
    drive: d,
    label: DRIVE_LABELS[d],
    utility: Math.round(drive.drives[d].utility * 1000) / 1000,
    satisfaction: Math.round(drive.getSatisfaction(d) * 1000) / 1000,
  }));
  const profile = drive.getProfile();
  // 情绪表面（Seele 校准）：注入 DriveBus，使 getEmotion()/getEmotions() 为单一真源
  const emotionSurface = computeMoodSurface(engine);
  drive.setEmotions(emotionSurface);
  const emotion = drive.getEmotion();
  const emotions = drive.getEmotions();
  return {
    ocean: engine.ocean,
    top_emotion: emotion,
    active_emotions: emotionSurface.map((e) => ({
      name: e.name,
      intensity: e.intensity,
      behavior: e.behavior || null,
      base: !!e.base,
    })),
    personality: engine.getPersonalitySummary(),
    drive: {
      dominant: dom,
      label: DRIVE_LABELS[dom],
      utility: domUtil,
      act: sa.act,
      action: sa.action,
      ranking,
      profile,
      emotion,
      emotions,
    },
    ocean_history_len: engine.ocean_history.length,
  };
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// ---------- 极简 CLI ----------
function parseArgs(argv) {
  const cmd = argv[2];
  const opts = {};
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a && a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      opts[key] = val;
    }
  }
  return { cmd, opts };
}

function main() {
  const { cmd, opts } = parseArgs(process.argv);

  try {
    if (cmd === 'init') {
      const ocean = opts.ocean ? JSON.parse(opts.ocean) : null;
      const { engine, drive } = freshState(ocean);
      saveState(engine, drive, {});
      out({ ok: true, action: 'init', ...snapshot(engine, drive) });
      return;
    }

    if (cmd === 'event') {
      let st = loadState();
      if (!st) st = freshState();
      const { engine, drive } = st;
      const text = opts.text || '(无名事件)';
      const tags = (opts.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
      const drive_deltas = opts.drive_deltas ? JSON.parse(opts.drive_deltas) : {};
      const importance = opts.importance || 'normal'; // low | normal | high
      engine.triggerEvent({ text, emotion_tags: tags, drive_deltas });
      // 反刍：高重要性事件 或 反刍型标签 → 延长相关情绪衰减（Verduyn: 重要性+反刍驱动时长）
      const rum = st.rumination || {};
      const isHigh = importance === 'high' || tags.some((t) => RUMINATION_TAGS.has(t));
      if (isHigh) {
        const emo = engine.emotions || {};
        const base = engine.baseline_emotions || {};
        for (const key of Object.keys(emo)) {
          if (emo[key] > (base[key] != null ? base[key] : 0.4) + 0.03) rum[key] = RUMINATION_WINDOW;
        }
      }
      syncDriveOcean(drive, engine);
      saveState(engine, drive, rum);
      out({ ok: true, action: 'event', text, tags, importance, ...snapshot(engine, drive) });
      return;
    }

    if (cmd === 'tick') {
      let st = loadState();
      if (!st) st = freshState();
      const { engine, drive } = st;
      const seconds = parseFloat(opts.seconds || '3600');
      drive.tick(seconds);
      const rum = st.rumination || {};
      for (const k of Object.keys(rum)) rum[k] = Math.max(0, (rum[k] || 0) - seconds); // 反刍窗口随真实时间消减
      decayEmotions(engine, seconds, rum);
      saveState(engine, drive, rum);
      out({ ok: true, action: 'tick', seconds, ...snapshot(engine, drive) });
      return;
    }

    if (cmd === 'satisfy') {
      const st = loadState();
      if (!st) {
        out({ ok: false, error: '状态不存在，先 init' });
        return;
      }
      const { engine, drive } = st;
      const driveName = opts.drive;
      const amount = parseFloat(opts.amount || '0.3');
      if (!DRIVES.includes(driveName)) {
        out({ ok: false, error: `未知驱力 ${driveName}`, valid: DRIVES });
        return;
      }
      drive.satisfy(driveName, amount);
      saveState(engine, drive, st.rumination || {});
      out({ ok: true, action: 'satisfy', drive: driveName, amount, ...snapshot(engine, drive) });
      return;
    }

    if (cmd === 'autostep') {
      // 自主权：时间流逝，希灵按驱力自己决定并做想做的事（玩家不干预也活）
      let st = loadState();
      if (!st) st = freshState();
      const { engine, drive } = st;
      const seconds = parseFloat(opts.seconds || '3600');
      drive.tick(seconds);
      const rum = st.rumination || {};
      for (const k of Object.keys(rum)) rum[k] = Math.max(0, (rum[k] || 0) - seconds); // 反刍窗口随真实时间消减
      decayEmotions(engine, seconds, rum);
      const want = drive.shouldAct(0.5);
      let acted = false;
      if (want.act) {
        // 他自己做了想做的事 → 自我满足主导驱力，情绪满足/喜悦
        drive.satisfy(want.drive, 0.3);
        engine.triggerEvent({ text: '希灵自己做了想做的事：' + want.action, emotion_tags: 'joy|satisfaction' });
        syncDriveOcean(drive, engine);
        acted = true;
      }
      saveState(engine, drive, rum);
      out({ ok: true, action: 'autostep', seconds, autonomous: { drive: want.drive, action: want.action, acted }, ...snapshot(engine, drive) });
      return;
    }

    if (cmd === 'intervene') {
      // 玩家干预：顺驱力(帮他做想做的) 或 逆驱力(对抗他的意愿去塑造他)
      const st = loadState();
      if (!st) { out({ ok: false, error: '状态不存在，先 init' }); return; }
      const { engine, drive } = st;
      const T = opts.drive;
      const amount = parseFloat(opts.amount || '0.4');
      const text = opts.text || '(玩家干预)';
      if (!DRIVES.includes(T)) { out({ ok: false, error: `未知驱力 ${T}`, valid: DRIVES }); return; }
      const want = drive.shouldAct(0.5);
      const mode = (T === want.drive) ? 'facilitate' : 'counteract';
      drive.satisfy(T, amount); // 玩家的动作落在 T 上（逆驱力时=强加 T，塑造他）
      if (mode === 'facilitate') {
        engine.triggerEvent({ text: text + '（顺应了他的意愿）', emotion_tags: 'trust|joy' });
      } else {
        // 他想做 want.action，你却让他做别的 → 抵触/渴望（但你在塑造他成为 T 导向）
        engine.triggerEvent({ text: text + '（他想' + want.action + '，你却让他做别的）', emotion_tags: 'longing|confusion' });
      }
      syncDriveOcean(drive, engine);
      saveState(engine, drive, st.rumination || {});
      out({ ok: true, action: 'intervene', mode, want: { drive: want.drive, action: want.action, act: want.act }, acted_drive: T, ...snapshot(engine, drive) });
      return;
    }

    if (cmd === 'status') {
      const st = loadState();
      if (!st) {
        out({ ok: false, error: '状态不存在，先 init' });
        return;
      }
      const { engine, drive } = st;
      out({ ok: true, action: 'status', ...snapshot(engine, drive) });
      return;
    }

    // 默认：用法
    out({
      ok: false,
      error: 'unknown command',
      usage: [
        'init [--ocean JSON]',
        'event --text "..." [--tags betrayal,conflict] [--drive_deltas JSON]',
        'tick [--seconds 3600]',
        'satisfy --drive belonging --amount 0.3',
        'status',
      ],
    });
  } catch (e) {
    out({ ok: false, error: String(e && e.message ? e.message : e) });
    process.exitCode = 1;
  }
}

main();
