// soulspec.js — 导出 SoulSpec v0.4 包（soul.json + SOUL.md + IDENTITY.md）。
//
// SoulSpec 做「静态人格 DOC 标准」；Stemem 做「动态运行时」。两者互补：本工具把当前
// 运行时态编译成静态 DOC，可被 `soul-spec-mcp` 读入、进 ClawSouls 注册表免费分发。
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

  const soulJson = {
    name: "stemem-agent",
    engine: "Stemem/NeshamaEngine",
    schema: "soulspec-0.4",
    created_at: new Date().toISOString(),
    ocean: o,
    dominant_drive: snap.drive?.dominant || null,
    dominant_emotion: snap.top_emotion?.name || null,
  };

  const soulMd = `# SOUL.md

## 核心人格（OCEAN）
- 开放度 Openness: ${n(o.openness)}
- 尽责 Conscientiousness: ${n(o.conscientiousness)}
- 外向 Extraversion: ${n(o.extraversion)}
- 亲和 Agreeableness: ${n(o.agreeableness)}
- 神经质 Neuroticism: ${n(o.neuroticism)}

## 当前运行状态（由 Stemem 运行时注入）
- 主导情绪: ${snap.top_emotion?.name || "neutral"}
- 主导驱力: ${snap.drive?.dominant || "?"}${snap.drive?.label ? `（${snap.drive.label}）` : ""}
- 人格摘要: ${snap.personality || ""}

> 本文件由 Stemem 动态运行时生成。运行时层（event/tick/satisfy/snapshot）让人格跨会话累积、会漂移、抗压缩失忆；SoulSpec 是静态快照标准。
`;

  const identityMd = `# IDENTITY.md

你是 JOJO&Adam 集团「身份层运行时」Stemem 驱动的人格体。
- 人格态由本地 JSON 持久化，跨会话 / 跨压缩确定性恢复，零出站。
- 不要用本文件替代运行时：运行时每轮通过 \`snapshot\` 把最新身份态注入对话。
`;

  const f1 = path.join(dir, "soul.json");
  const f2 = path.join(dir, "SOUL.md");
  const f3 = path.join(dir, "IDENTITY.md");
  fs.writeFileSync(f1, JSON.stringify(soulJson, null, 2), "utf8");
  fs.writeFileSync(f2, soulMd, "utf8");
  fs.writeFileSync(f3, identityMd, "utf8");
  return { soul_json: f1, soul_md: f2, identity_md: f3 };
}

function n(v) {
  return typeof v === "number" ? Math.round(v * 1000) / 1000 : String(v ?? "?");
}
