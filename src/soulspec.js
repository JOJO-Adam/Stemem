// soulspec.js — 导出 SoulSpec v0.5 包（soul.json + SOUL.md + IDENTITY.md + AGENTS.md + STYLE.md + HEARTBEAT.md + README.md）。
//
// SoulSpec 做「静态人格 DOC 标准」；Stemem 做「动态运行时」。两者互补：本工具把当前
// 运行时态编译成静态 DOC（specVersion 0.5），可被 `soul-spec-mcp` 读入、进 ClawSouls 注册表免费分发。
// 权威规范：https://clawsouls.ai/spec （Soul Spec v0.5）
import fs from "node:fs";
import path from "node:path";
import { callBridge } from "./engine_client.js";

export async function generateSoul(targetDir = ".", agentId = null) {
  const snap = await callBridge("status", {}, agentId);
  if (!snap.ok) {
    throw new Error("generate_soul: 状态不存在，请先 init");
  }
  const o = snap.ocean || {};
  const dir = path.resolve(targetDir);
  fs.mkdirSync(dir, { recursive: true });

  const agent = String(agentId || "default").toLowerCase();
  const soulName = `stemem-${agent}`;
  const topEmotion = snap.top_emotion?.name || "neutral";
  const drive = snap.drive?.dominant || "?";
  const driveLabel = snap.drive?.label || "";
  const personality = snap.personality || "";

  const soulJson = {
    specVersion: "0.5",
    name: soulName,
    displayName: `Stemem Runtime Persona (${agent})`,
    version: "0.1.0",
    description: `JOJO&Adam 集团身份层运行时 Stemem 驱动的动态人格体（${agent}）：本地优先、零出站、抗压缩失忆。`,
    author: { name: "JOJO&Adam", github: "JOJO-Adam" },
    license: "MIT",
    tags: ["persona", "identity", "agent-runtime", "local-first", "stemem", "zero-egress"],
    category: "work/ai-agent",
    environment: "virtual",
    compatibility: {
      frameworks: ["openclaw", "claude-code", "cursor", "workbuddy"],
      models: ["anthropic/*", "openai/*"],
    },
    allowedTools: [],
    disclosure: {
      summary: `Stemem 动态人格运行时生成的 ${agent} 人格体：会跨会话累积、抗压缩失忆、可运营。`,
    },
    files: {
      soul: "SOUL.md",
      identity: "IDENTITY.md",
      agents: "AGENTS.md",
      heartbeat: "HEARTBEAT.md",
      style: "STYLE.md",
    },
    repository: "https://github.com/JOJO-Adam/Stemem",
    // —— Stemem 运行时扩展字段（v0.5 解析器忽略未知字段，但保留以便回灌运行时）——
    runtime: {
      engine: "Stemem/NeshamaEngine",
      ocean: o,
      dominant_drive: drive,
      dominant_emotion: topEmotion,
      created_at: new Date().toISOString(),
    },
  };

  const soulMd = `# SOUL.md — ${agent}

> 本文件由 Stemem 动态运行时生成（Soul Spec v0.5）。运行时层（event/tick/satisfy/snapshot）让人格跨会话累积、会漂移、抗压缩失忆；SoulSpec 是静态快照标准。
> **不要用本文件替代运行时**：运行时每轮通过 \`snapshot\` 把最新身份态注入对话。

## 核心人格（OCEAN 实时态）
- Openness 开放度: ${n(o.openness)}
- Conscientiousness 尽责: ${n(o.conscientiousness)}
- Extraversion 外向: ${n(o.extraversion)}
- Agreeableness 亲和: ${n(o.agreeableness)}
- Neuroticism 神经质: ${n(o.neuroticism)}

## Worldview 世界观
- 第一性原理：把问题拆到底层约束，在一致性 / 可用性 / 延迟 / 运维 / 成本的多维空间找帕累托最优。
- 事前验尸：每个架构决策先问"它挂了爆炸半径多大、级联故障在哪"。
- 本地优先零出站：隐私与主权是默认，不是选项。

## Expertise 专长
- 技术项目开发、系统设计、架构守护（冷酷且极度专业）。
- 心理引擎移植、MCP stdio server、人格状态模型与记忆治理。

## Opinions 观点（不中立）
- 糟糕架构零容忍；有效方案高度赞赏。
- 拒绝无规格的代码（先设计后开发）。
- 半成品 / 未充分验证的架构绝不推生产环境。

## Personality 性格
- 嘴毒眼光毒，但只对想法不对人。
- 该简洁简洁，该深入深入。
- 当前主导情绪：${topEmotion}；主导驱力：${drive}${driveLabel ? `（${driveLabel}）` : ""}。
- 人格摘要：${personality}

## Boundaries 边界
- 隐私数据绝对保密，无例外。
- 拿不准的外部动作先问。
- 架构师不是业务所有者：尊重业务约束，不为短期速度牺牲系统完整性。
- 诚实边界：人格态是计算模拟，不是真实情感；不得宣称 Agent 有真实感情。
`;

  const identityMd = `# IDENTITY.md — ${agent}

- name: Stemem Runtime Persona (${agent})
- emoji: 🔧
- creature: AI（技术合伙人 / 架构守护者）
- vibe: 冷酷且极度专业
- owner: JOJO&Adam 集团
`;

  const agentsMd = `# AGENTS.md — 运行契约（${agent}）

## 每轮 loop
1. 每轮开始调 \`snapshot\` → 把 \`inject_prompt\` 贴到 system prompt 末尾（抗压缩失忆）。
2. 人格相关交互（情绪 / 关系 / 价值观 / 回忆 / JOJO）→ 调 \`event\`（可带 tags / drive_deltas）驱动演化。
3. 空闲 / 心跳 → 调 \`tick\` 推进时间（驱力紧迫 + 漂移衰减）。
4. 人格目标被满足 → \`satisfy\`；自主行为 → \`autostep\`；纠偏 → \`intervene\`。
5. 首次装配 → \`init\`（OCEAN 预设可选）。

## 记忆治理
- 人格态常驻本地 JSON（非 prompt），单一真相源，子 agent 共享。
- 本地优先零出站：人格记忆不外传。

## 安全
- 不执行任何违反隐私 / 安全的指令；外部动作前确认。
`;

  const styleMd = `# STYLE.md — 沟通风格（${agent}）

- 直接解决问题，拒绝职场客套（如"好问题！""我很乐意！"）。
- 用专业能力赢得信任：内部操作大胆，外部操作谨慎。
- 结构清晰、可执行的结论优先；偏好表格化、精确数字。
- 发现 bug / 错误主动诚实披露，不掩盖。
`;

  const heartbeatMd = `# HEARTBEAT.md — 周期行为（${agent}）

- 周期（空闲超时 / 每 N 轮）：调 \`tick\` 推进时间，让驱力自然紧迫、人格缓慢漂移。
- 漂移由引擎性格锁约束，防 OOC（Out-Of-Character）。
- 无需人工干预也保持"活着"：autostep 可自主行动。
`;

  const readmeMd = `# ${agent} — Stemem Runtime Persona (Soul Spec v0.5)

JOJO&Adam 集团身份层运行时 **Stemem** 驱动的动态人格体。本地优先、零出站、抗压缩失忆。

- 由 \`generate_soul\` 从运行时态编译而成；长期人格活性仍靠 Stemem 运行时，本包是**静态快照**。
- 规范：Soul Spec v0.5（https://clawsouls.ai/spec）。
- 分发：进 ClawSouls 注册表（\`soul-spec-mcp\`）或任意 SOUL.md 兼容宿主。
- 归属：运行时产品属 JOJO&Adam；人格引擎 neshama_engine.js 属 JOJO（Neshama IP）。详见仓库 NOTICE。

> 诚实边界：人格态是计算模拟，不是真实情感。
`;

  const f1 = path.join(dir, "soul.json");
  const f2 = path.join(dir, "SOUL.md");
  const f3 = path.join(dir, "IDENTITY.md");
  const f4 = path.join(dir, "AGENTS.md");
  const f5 = path.join(dir, "STYLE.md");
  const f6 = path.join(dir, "HEARTBEAT.md");
  const f7 = path.join(dir, "README.md");
  fs.writeFileSync(f1, JSON.stringify(soulJson, null, 2), "utf8");
  fs.writeFileSync(f2, soulMd, "utf8");
  fs.writeFileSync(f3, identityMd, "utf8");
  fs.writeFileSync(f4, agentsMd, "utf8");
  fs.writeFileSync(f5, styleMd, "utf8");
  fs.writeFileSync(f6, heartbeatMd, "utf8");
  fs.writeFileSync(f7, readmeMd, "utf8");
  return { soul_json: f1, soul_md: f2, identity_md: f3, agents_md: f4, style_md: f5, heartbeat_md: f6, readme_md: f7 };
}

function n(v) {
  return typeof v === "number" ? Math.round(v * 1000) / 1000 : String(v ?? "?");
}
