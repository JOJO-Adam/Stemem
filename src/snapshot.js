// SPDX-License-Identifier: MIT
// snapshot.js — 标准化快照构造「单一真源」。
//
// 之前 server.js 的 snapshot 工具 与 snapshot-cli.js 各自拼装同一份 snapshot 对象，两份构造
// 逻辑一旦漂移就会出现「MCP 产出 与 一次性 CLI 产出不一致」——这是 host-harness / snapshot-cli
// 功能重叠的根因。本模块抽出 buildSnapshot(agentId, lang)，两边共用同一份，杜绝漂移。
//
// 职责：读/建状态 → 组装标准化 snapshot（ocean + 主导情绪 + 驱力 + 语气画像 + 可注入 prompt）。
// 不在此处理 onboarding 首跑提示（交由调用方按场景决定：MCP server 注入、CLI 不注入）。
import { callBridge } from "./engine_client.js";
import { toneProfile } from "./tone.js";
import { formatSnapshotPrompt } from "./runtime_contract.js";
import { maybeOnboarding } from "./onboarding.js";

// 构造标准化 snapshot 对象。
// 状态未初始化时返回 { ok:false, error }（调用方自行决定 auto-init 或注入首跑提示），
// 不在此隐式 init —— 否则会掩盖 isFirstRun 判定、让 onboarding 首跑提示永不出现。
export async function buildSnapshot(agentId, lang = "en") {
  const d = await callBridge("status", {}, agentId).catch(() => null);
  if (!d || !d.ok) return { ok: false, error: (d && d.error) || "state not initialized" };
  return {
    ocean: d.ocean,
    top_emotion: d.top_emotion,
    active_emotions: d.active_emotions,
    personality: d.personality,
    drive: d.drive,
    tone: toneProfile(d, lang),
    inject_prompt: formatSnapshotPrompt(d, lang),
  };
}
