# Stemem 宿主钩子（host-hooks）

让宿主「装上即每轮带人格」。两种接线模式，按宿主能力选。

---

## 模式 A：MCP-native（首选，所有支持 MCP 的宿主）

Cursor / Gemini / Codex / ChatGPT / Claude Code 都支持 MCP。把 Stemem 配成 MCP server 后，
宿主的模型**自己**每轮调 `snapshot` 把身份态注入 prompt（运行时契约见 `skills/stemem/SKILL.md` §2）。
这是主路径，人格演化、事件驱动全部由模型按契约调用。

```json
// ~/.workbuddy/mcp.json 或宿主的 mcp config
{
  "mcpServers": {
    "stemem": {
      "command": "node",
      "args": ["<你的 Stemem clone 绝对路径>/src/server.js"],
      "env": {}
    }
  }
}
```

首跑时 `snapshot` 会主动提示新手任务（见下「新手任务」），用户可一键玩、可跳过。

---

## 模式 B：Claude Code 钩子（每轮自动注入，零改 system prompt）

Claude Code 支持 `UserPromptSubmit` hook，可在每轮用户消息前把身份态作为 `additionalContext` 自动塞回模型。
适合「不想手动维护 system prompt 里的契约段」的场景。

1. 把下面这段加进项目的 `.claude/settings.json`（或 `settings.local.json`）：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "/abs/path/to/Stemem/host-hooks/stemem-claude-hook.sh" } ] }
    ]
  }
}
```

2. （可选）设环境变量区分多分身 / 语言：

```bash
export STEMEM_AGENT_ID="my-agent"     # 默认 default
export STEMEM_TONE_LANG="zh"          # 默认 en（国际分发安全默认）
export STEMEM_STATE_DIR="$HOME/.stemem"  # 状态目录，默认 ~/.stemem
```

钩子脚本 `stemem-claude-hook.sh` 调用 `src/snapshot-cli.js --hook`，一次性产出 Claude Code 所需的
`hookSpecificOutput.additionalContext` JSON。无状态时自动 `init`，首轮也有身份态可注入。
脚本对失败零敏感（任何异常都回退空上下文），绝不阻断宿主 loop。

---

## 一次性命令行：`src/snapshot-cli.js`

不依赖常驻 server，单进程拉起→读/建状态→输出→退出。可被任意 shell / CI / hook 调用：

```bash
node src/snapshot-cli.js                 # 打印 inject_prompt（可直接贴进 prompt）
node src/snapshot-cli.js my-agent zh     # 指定 agent + 中文语气
node src/snapshot-cli.js --json          # 完整 snapshot JSON
node src/snapshot-cli.js --hook          # Claude Code hook JSON
```

---

## 新手任务（装上即被邀请）

MCP 配置完成后，首跑 `snapshot`/`status` 会在注入串里附一行新手任务提示；或手动跑：

```bash
npm run demo:onboarding
```

选一个预设性格 → 触发几种情绪看它变声 → 可随时跳过。这是「语气随情绪漂移」最可感知的体验入口，
也是普通用户装上 Stemem 第一周最可能被勾住的点。
