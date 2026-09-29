# Stemem · 项目路线图

> JOJO&Adam 集团产品线 · Agent 身份层运行时（人格+驱力动态运行时，本地优先，SoulSpec 兼容，开源 MCP）。
> 项目名 Stemem（JOJO&Adam 集团身份层运行时产品；引擎技术层 = NeshamaEngine，沿用 Neshama 引擎 IP）。独立目录 `/Users/jojo/AI_Projects/Stemem`。与原 Neshama 人生模拟器（neshama.cn）不同产品线，仅复用其引擎技术。防漂移：细节见 `设计要点.md`，长期锚点见 `.workbuddy/memory/MEMORY.md`。

## 当前状态（2026-09-29 更新）
- 阶段：**P0 完成，P2 本地工件已建（待银行申报门槛后发 GitHub / ClawSouls）**。
- 已定：楔＝A（人格记忆运行时）；分发＝MCP 主力 + Skill 次级 + SoulSpec 包三级；技术＝引用 Seele / NeshamaEngine 已测引擎（引用不复制）。

## 决策日志
- **2026-09-29**：
  - 定主楔＝人格记忆运行时（SoulSpec＝静态 DOC 标准，我们做动态运行时层）。
  - 定分发＝MCP 工具集主力 + WorkBuddy Skill 次级 + SoulSpec 包三级。
  - 定技术路线＝引用 Seele P1+P2 引擎（seele_drive.js + seele_bridge.js，selftests 全过），不 vendored（经 NESHAMA_ENGINE/SEELE_BRIDGE 指本机真源）。
  - 定约束＝OSS 非商资产积累 + 本地优先零出站 + 3 万/月门槛前不 monetize + 发 GitHub 前核实银行无偿对外活动申报 + 发布前查商标/域名/应用商店。
  - 定项目名＝Stemem（初名 Anima 因重名弃用、过渡名 NeshamaEngine；最终定 Stemem。独立目录 /Users/jojo/AI_Projects/Stemem，属 JOJO&Adam 集团产品线，不挂原 Neshama 消费品牌、仅复用 NeshamaEngine 引擎技术）。
  - **P0 落地（09-29）**：hand-roll 零依赖 stdio server + 9 工具 + 冒烟 9/9 + 零出站 + 引擎引用不复制 + README/LICENSE/NOTICE。
  - **P2 本地工件（09-29 续建）**：WorkBuddy Skill（`.workbuddy/skills/stemem/SKILL.md`）+ Adam persona SoulSpec 包（`clawsouls/adam/`，OCEAN=Adam 基线，走真实 MCP server 生成）+ 本地 `~/.workbuddy/mcp.json` 注册 stemem（待「信任」启用）。

## 路线图
- **P0**：MCP server 设计要点 → 引用 Seele / NeshamaEngine 引擎 → 本地可跑（stdio + event/tick/satisfy/snapshot + generate_soul）。**✅ 完成（2026-09-29）**：hand-roll 零依赖 stdio server + 9 工具 + 冒烟全过 + 零出站 + 引擎引用不复制。
- **P1**：SoulSpec 兼容生成器（✅ 已实现 generate_soul）+ GitHub 仓库（查名 / 商标 / 域名冲突 — **✅ Stemem 已 3 路证伪通过**）。**GitHub 发布受银行申报门槛硬约束，暂缓**。
- **P2**：ClawSouls 包（Adam persona）+ WorkBuddy Skill 同发。**本地工件已建（09-29）；对外发布同受银行门槛约束**。
- **P3**：生态打磨（文档 / 示例 / star 增长 / 漏斗＝装 → 关注 JOJO&Adam）。

## 待办（与全局待办区同步）
- [ ] 核实银行「无偿 OSS 对外活动」申报规则。**（发 GitHub / ClawSouls 硬前置，按所在行规 — JOJO 本人确认）**
- [x] GitHub 仓库名 / 商标 / 域名 / 应用商店冲突排查。**（Stemem 3 路证伪通过）**
- [x] MCP server 工具契约设计 + 9 工具落地。**（见 设计要点.md §10，冒烟 9/9）**
- [x] WorkBuddy Skill 封装。**（.workbuddy/skills/stemem/SKILL.md，含 mcp.json 片段 + 运行时契约）**
- [x] Adam persona SoulSpec 包。**（clawsouls/adam/，OCEAN=Adam 基线，走真实 MCP server 生成）**
- [x] 本地 mcp.json 注册 stemem。**（待 WorkBuddy「连接器管理」点信任启用）**
