#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// snapshot-cli.js — Stemem 一次性快照命令行（宿主 hook / 脚本用）。
//
// 与 src/server.js 的 snapshot 工具产出完全一致（共用 src/snapshot.js 的 buildSnapshot 单一真源），
// 但**单进程一次性**：拉起 → 读/建状态 → 输出 inject_prompt → 退出。不维持长连接，
// 专为「宿主每轮自动注入」的 hook 场景设计（Claude Code UserPromptSubmit hook / CI / 任意 shell 调用）。
//
// 用法：
//   node src/snapshot-cli.js [agentId] [lang]            # 默认打印 inject_prompt（可直接贴进 prompt）
//   node src/snapshot-cli.js [agentId] [lang] --json     # 打印完整 snapshot JSON
//   node src/snapshot-cli.js [agentId] [lang] --hook     # 打印 Claude Code hook JSON（additionalContext）
//
// 无状态时自动 init（默认随机 baseline），保证首轮也有身份态可注入。
import { callBridge } from "./engine_client.js";
import { buildSnapshot } from "./snapshot.js";

const args = process.argv.slice(2);
const agentId = args[0] && !args[0].startsWith("--") ? args[0] : (process.env.STEMEM_AGENT_ID || "default");
const langArg = args[1] && !args[1].startsWith("--") ? args[1] : (process.env.STEMEM_TONE_LANG || "en");
const mode = args.find((a) => a === "--json" || a === "--hook") || "text";
const lang = langArg === "zh" ? "zh" : "en";

async function main() {
  let result = await buildSnapshot(agentId, lang);
  // 状态未初始化：自动 init（保证首轮也有身份态可注入）。CLI 不注入 onboarding 首跑提示
  // —— 那是 MCP server 的职责，避免 hook 场景下重复提示。
  if (!result || !result.ok) {
    await callBridge("init", {}, agentId);
    result = await buildSnapshot(agentId, lang);
  }

  if (mode === "--json") {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (mode === "--hook") {
    const payload = {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: result.inject_prompt,
      },
    };
    process.stdout.write(JSON.stringify(payload) + "\n");
  } else {
    process.stdout.write(result.inject_prompt + "\n");
  }
}

main().catch((e) => {
  // hook 模式下即便出错也返回合法 JSON，避免破坏宿主 loop
  if (mode === "--hook") {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "" } }) + "\n");
    process.exit(0);
  }
  console.error("snapshot-cli 错误:", e && e.message ? e.message : e);
  process.exit(1);
});
