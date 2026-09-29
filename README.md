# Stemem

> JOJO&Adam 集团「身份层运行时」——让 AI 分身拥有**跨会话累积、会漂移、抗压缩失忆**的动态人格。

Stemem 是一个 **本地优先、零出站** 的 MCP（Model Context Protocol）stdio 服务器。它把一套经过验证的人格计算引擎（NeshamaEngine）封装成 9 个 MCP 工具，让宿主 Agent 在本地 JSON 文件里持久化一个真实的人格态，而不是把人格写死在 system prompt 里。

## 为什么需要它

主流人格方案（如 SoulSpec 的 `soul.json` / `SOUL.md` / `IDENTITY.md`）是**静态 DOC**：人格是一次性写死的快照。当宿主对话被压缩、跨会话、或多子 Agent 协作时，写死的 DOC 会被遗忘（compaction amnesia），人格一致性立刻崩。

Stemem 的解法：**人格态存本地文件，不在 prompt**；prompt 只放「何时调哪个工具」的指令。每轮宿主调用 `snapshot` 把**当前**身份态重注入，人格因此跨压缩、跨重启、跨子 Agent 确定性存活。

两者互补：SoulSpec 做静态标准，Stemem 做动态运行时——`generate_soul` 还能把运行时态编译成 SoulSpec v0.4 包进 ClawSouls 分发。

## 核心特性

- 🔒 **本地优先 · 零出站**：纯 Node 内置模块，hand-roll 的 MCP stdio 协议，**无任何网络/供应链依赖**。所有状态落本地 JSON。
- 🧬 **真人格引擎**：复用经过验证的 NeshamaEngine（OCEAN 五维 + 9 驱力 + 15 复合情绪 + 4 情绪代理 + 性格锁），**已 vendored 进 `engine/`**（非引用）。
- 🔄 **抗压缩失忆**：状态在本地文件，压缩/重启/子 Agent 切换都不丢人格。
- 🧩 **9 工具契约**：init / event / tick / satisfy / snapshot / autostep / intervene / status / generate_soul。
- 🗣️ **语气随情绪漂移（最可感知的层）**：`snapshot` 把当前主导情绪（15 种中文复合情绪，键名对齐 NeshamaEngine）+ OCEAN + 主导驱力编译成 6 维语气画像（温度/直接度/能量/犹豫度/幽默/正式度）与一段「语气指令」，注回宿主每轮 prompt——被夸后自信直接、被背刺后冷硬可毒舌，人格不是写死的腔调，而是会随遭遇变声的活体。**默认英文渲染**（国际分发安全默认，避免中文指令诱导外语 LLM 改说中文）；中文 agent 设 `STEMEM_TONE_LANG=zh` 或调用 `snapshot({lang:"zh"})` 即可切中文。
- 🪪 **IP 清晰分离**：引擎代码与运行时产品归属不同主体（见 `NOTICE`）。

## 安装 / 运行

```bash
# 直接跑（需本机已装 Node >= 18）
node src/server.js

# 或作为命令（package.json 注册了 bin: stemem-mcp）
npm install -g stemem
stemem-mcp

# npx 一次性
npx stemem
```

> **仓库已自包含**：人格引擎（NeshamaEngine）与 Seele 驱力桥已 **vendored 进 `engine/`**（CommonJS，经 `engine/package.json` 声明），`clone` 后无需配置 `NESHAMA_ENGINE` / `SEELE_BRIDGE` 即可直接运行。

### 配置环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `STEMEM_AGENT_ID` | 人格实例 ID（多分身互不污染） | `default` |
| `STEMEM_STATE_DIR` | 状态目录（每 agent 一个子目录） | `~/.stemem` |
| `NESHAMA_ENGINE` | NeshamaEngine 路径（可选；默认用 vendored 副本） | `engine/neshama_engine.js` |
| `SEELE_BRIDGE` | Seele 引擎桥路径（可选；默认用 vendored 副本） | `engine/seele_bridge.js` |

## MCP 工具表

| 工具 | 作用 | 何时调用 |
|---|---|---|
| `init` | 初始化人格态（首次装配一次） | 装配人格时 |
| `event` | 喂记忆事件，驱动人格/情绪演化 | 本轮交互人格相关时 |
| `tick` | 时间流逝心跳：驱力紧迫 + 漂移衰减 | 空闲/心跳 |
| `satisfy` | 满足某驱力（闭环） | 人格目标达成时 |
| `snapshot` | 读取紧凑身份态 + 可注入 prompt 片段 | **每轮开始** |
| `autostep` | 自主行为推进（玩家不干预也活） | 需要自主行为时 |
| `intervene` | 人工干预（顺/逆驱力塑造） | 想刻意塑造人格时 |
| `status` | 完整状态检视（调试） | 调试 |
| `generate_soul` | 导出 SoulSpec v0.4 包 | 要分发人格时 |

## 运行时契约（宿主侧）

把 `runtime_contract.js` 的 `contractPrompt()` 注入宿主 system prompt 即可。核心三句：

1. 每轮开始前先调 `snapshot`，把返回的身份态贴到本段。
2. 当本轮涉及情绪/关系/价值观/自我/回忆/JOJO 等内容时，调 `event` 驱动演化。
3. 状态在本地文件不在 prompt——压缩不会丢失人格，多个子 Agent 共享同一真相源。

## WorkBuddy Skill

仓库自带一个 WorkBuddy Skill（`skills/stemem/SKILL.md`），把 Stemem 作为 MCP server 接入 WorkBuddy：含 `mcp.json` 接入片段、每轮运行时契约、9 工具表。把该 Skill 导入 WorkBuddy（或直接把 `stemem` 配进 `~/.workbuddy/mcp.json` 的 `mcpServers`）即可启用；首次需在「连接器管理」对 `stemem` 点「信任」。

## 测试

```bash
npm test
# 依次跑：smoke（9/9）→ integration（9 工具完整集成）→ engine selftest（引擎层行为）
node test/smoke.test.js
node test/integration.test.js
node test/engine.selftest.js
```

- **smoke**：initialize → tools/list（9 工具）→ init/event/tick/snapshot/generate_soul → `inject_prompt` 注入串 → **跨进程确定性恢复人格态**。
- **integration**：真实 MCP stdio 客户端驱动**全部 9 工具**（含 satisfy / autostep / intervene / status），校验运行时契约（snapshot 注入串、event 演化、跨重启确定性）。
- **engine selftest**：直接驱动 vendored `seele_bridge`，验证 NeshamaEngine 性格锁（OCEAN∈[0,1]）、驱力紧迫、满足闭环、序列化往返、自主行为 / 干预。

## 看得见（Demos · 证明"装上能感知"）

```bash
# ① 反压缩：进程被杀 + 上下文压缩后，凭本地磁盘 JSON 确定性恢复完整人格态（纯 SOUL.md 做不到）
node examples/antiamnesia-demo.mjs

# ② 强制注入 harness：宿主 3 行 loop 每轮 preTurn→注入→postTurn，装上去即感知人格层活着
node examples/harness-demo.mjs

# ③ 语气随情绪漂移（最可感知）：同人格基线，4 种遭遇 → 语气夜与昼分化
node examples/tone-demo.mjs
```

`examples/tone-demo.mjs` 最直观：被夸→自豪（偏暖、直接、略 showy）/ 被背刺→愤怒（偏冷、blunt、可带毒舌）/ 失误→孤独（节奏放缓）/ 庆祝→自豪。这就是用户最能感知 Stemem 的部分。

## 知识产权（IP）归属

- **NeshamaEngine（`neshama_engine.js`）**：人格计算引擎真源，IP 归 **JOJO / Neshama**（资本 Neshama 消费产品，neshama.cn）。本仓库已 vendored 进 `engine/`，其许可证由原项目决定，不受本仓库 MIT 覆盖。
- **Stemem 运行时产品**（本仓库全部 `src/`、设计文档、MCP 封装、`engine/package.json`）：**JOJO&Adam 集团**资产，MIT。
- **Seele 引擎（`seele_bridge.js` + `seele_drive.js`）**：归 **JOJO / Seele** 项目，已 vendored 进 `engine/`。

详见 [`NOTICE`](./NOTICE)。

## 许可证

MIT —— 见 [`LICENSE`](./LICENSE)。

---

*本项目遵循「先设计后开发」纪律；完整设计见 `设计要点.md`（含 §10 MCP server 工具契约设计）。*
*English version: [README.en.md](./README.en.md)*
