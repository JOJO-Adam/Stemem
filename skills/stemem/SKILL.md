---
name: stemem
description: "为 WorkBuddy 接入 Stemem 身份层运行时（本地优先 MCP server）：让 Agent 拥有会跨会话累积、抗压缩失忆、可运营的人格态。当要配置/使用 Stemem、让 Agent 拥有持久人格、或导出 SoulSpec 人格包时调用。"
version: "0.1.0"
display_name: "Stemem 身份层运行时"
display_name_en: "Stemem Identity Runtime"
description_zh: "本地优先、零出站的 Agent 人格运行时（MCP server）。每轮把人格态从本地 JSON 重注入，治 SoulSpec 静态 DOC 的压缩失忆；人格随事件/时间演化，可被运营成 NPC/虚拟伴侣/客服人格资产。"
description_en: "Local-first, zero-egress identity runtime for agents (MCP server). Re-injects persona state from local JSON every turn to cure SoulSpec's compaction amnesia; persona evolves with events/time and can be operated as an NPC/companion/customer-service persona asset."
---

# Stemem · 身份层运行时

> JOJO&Adam 集团产品线。本地优先 stdio MCP server，零出站、零依赖。让任意 MCP 宿主（WorkBuddy / Claude Code / Cursor / Gemini / Codex / ChatGPT）给 Agent 装一个「会成长的人格」。
> 真源与归属：人格引擎 `neshama_engine.js` 属 JOJO（Neshama IP）；运行时产品属 JOJO&Adam；Seele 桥属 JOJO/Seele。详见仓库 `NOTICE`。

## 0. 它解决什么
- **SoulSpec 的空档**：SoulSpec 标准化了「人格 DOC（静态）」但不跑运行时；Agent 上下文压缩（compaction）后人格态丢失 —— 即 compaction amnesia。
- **Stemem 的解法**：人格态常驻本地 JSON（非 prompt），每轮由 `snapshot` 重注入 → 压缩免疫、子 agent 共享单一真相源。
- **会演化**：人格随 `event`/`tick` 缓慢演化（非冻结、非堆叠），`overwrite` 语义 + 性格锁防 OOC（Out-Of-Character）。

## 1. 启用（接入 WorkBuddy MCP）
本 Skill 是 Stemem 的 WorkBuddy 入口；真正能力在 MCP server。把下面条目合并进 `~/.workbuddy/mcp.json` 的 `mcpServers`：

- 写完后到「连接器管理」里对 `stemem` 点「信任」启用（stdio 本地进程，无网络）。
- 首跑 `snapshot` 会主动提示新手任务；也可手动跑 `npm run demo:onboarding`（选性格→触发情绪看变声→可跳过），这是普通用户最易被勾住的入口。
- **宿主自动注入**：不想手维护契约段？`host-hooks/` 提供 Claude Code `UserPromptSubmit` 钩子 + 一次性命令行 `src/snapshot-cli.js`，让宿主每轮自动把身份态塞回模型。详见 `host-hooks/README.md`。

```json
{
  "mcpServers": {
    "stemem": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_YOUR_STEMEM_CLONE>/src/server.js"],
      "env": {}
    }
  }
}
```

> 把上面的 `<ABSOLUTE_PATH_TO_YOUR_STEMEM_CLONE>` 换成你 clone 本仓库后的绝对路径（例如 `/home/you/Stemem`）。

- 写完后到「连接器管理」里对 `stemem` 点「信任」启用（stdio 本地进程，无网络）。
- 引擎桥已 **vendored 进 `engine/`**，`SEELE_BRIDGE` / `NESHAMA_ENGINE` 默认指向 vendored 副本，无需手动设 env（见仓库 `README` / `NOTICE`）。
- 状态默认落 `~/.stemem/<agent-id>/seele_state.json`；可用 `STEMEM_STATE_DIR` / `STEMEM_AGENT_ID` 环境变量覆盖（多 Agent 互不污染）。

## 2. 运行时契约（接入后，每轮 loop）
system prompt 只放「契约指令」，人格态每轮从 `snapshot` 注入（**不要把人格写死进 prompt**）：
- **每轮开始**：调 `snapshot` → 把返回的 `inject_prompt` 贴到本轮 system prompt 末尾（抗压缩失忆）。
- **人格相关交互**（情绪 / 关系 / 价值观 / 自我 / 回忆 / JOJO 等）：调 `event`（可带 `tags` / `drive_deltas`）驱动演化。
- **空闲 / 心跳**：调 `tick` 推进时间，驱力自然紧迫、人格漂移。
- **人格目标被满足**：`satisfy`；要自主行为：`autostep`；手动纠偏：`intervene`。
- **首次装配**：`init`（可传 OCEAN 预设，不传则随机 baseline）。

## 3. 工具表（9）
| 工具 | 作用 |
|---|---|
| `init` | 初始化人格态（OCEAN 预设可选） |
| `event` | 喂事件 → 人格/情绪演化，返回 `voiceHint`/`logicHint` |
| `tick` | 时间心跳 → 驱力紧迫 + 漂移衰减 |
| `satisfy` | 满足某驱力（闭环） |
| `snapshot` | 紧凑身份态 + 可注入 prompt 片段（**每轮用**） |
| `autostep` | 自主行为推进（玩家不干预也活） |
| `intervene` | 人工干预（顺/逆驱力塑造） |
| `status` | 完整状态检视（调试） |
| `generate_soul` | 导出 SoulSpec v0.4 包（soul.json + SOUL.md + IDENTITY.md）进 ClawSouls |

## 4. 与 SoulSpec 的关系
Stemem 做「动态运行时」，SoulSpec 做「静态 DOC 标准」——**互补不竞争**。`generate_soul` 把当前运行时态编译成 SoulSpec v0.4 包，可被 `soul-spec-mcp` 读入、进 ClawSouls 注册表免费分发。注意：静态包是**快照**，长期人格活性仍靠运行时。

## 5. 诚实边界
- 人格态是**计算模拟**，不是真实情感；不得向用户宣称 Agent 有真实感情。
- **本地优先零出站**：人格记忆不外传，既隐私合规，也是 vs 云厂（Mem0/Letta/Zep）的护城河。

## 6. 分发形态（发布节奏）
- 主力 = 开源 MCP 工具集（GitHub，跨框架 + 橱窗 + 本地优先）。
- 次级 = 本 Skill（保 WorkBuddy 已装资产触达）。
- 三级 = Adam persona 发 SoulSpec 包进 ClawSouls（`clawsouls/adam/`）。
- ✅ 银行合规：JOJO 所在银行鼓励科技研发，**无偿 OSS 对外活动无需申报**（JOJO 本人已确认；Adam 非律师，最终以所在行规为准）。
