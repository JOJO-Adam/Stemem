#!/usr/bin/env bash
# stemem-claude-hook.sh — Claude Code UserPromptSubmit 钩子
#
# 作用：每次用户发消息前，自动把 Stemem 的「身份态注入串」作为 additionalContext 塞回模型，
#       实现「装上即每轮带人格、跨压缩存活」，无需手动改 system prompt。
#
# 接线（Claude Code 的 .claude/settings.json 或 settings.local.json）：
# {
#   "hooks": {
#     "UserPromptSubmit": [
#       { "hooks": [ { "type": "command", "command": "/abs/path/to/Stemem/host-hooks/stemem-claude-hook.sh" } ] }
#     ]
#   }
# }
#
# 可选：设 STEMEM_AGENT_ID 区分多分身；设 STEMEM_TONE_LANG=zh 用中文语气（默认英文）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STEMEM_CLI="$SCRIPT_DIR/../src/snapshot-cli.js"
AGENT_ID="${STEMEM_AGENT_ID:-default}"

if [ ! -f "$STEMEM_CLI" ]; then
  # 找不到 CLI 时返回空上下文，绝不阻断宿主
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
  exit 0
fi

# --hook 模式直接吐 Claude Code 所需的 JSON（含 additionalContext）
node "$STEMEM_CLI" "$AGENT_ID" "${STEMEM_TONE_LANG:-en}" --hook || \
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
