# Stemem · 项目路线图

> JOJO&Adam 集团产品线 · Agent 身份层运行时（人格+驱力动态运行时，本地优先，SoulSpec 兼容，开源 MCP）。
> 项目名 Stemem（JOJO&Adam 集团身份层运行时产品；引擎技术层 = NeshamaEngine，沿用 Neshama 引擎 IP）。独立目录 `/Users/jojo/AI_Projects/Stemem`。与原 Neshama 人生模拟器（neshama.cn）不同产品线，仅复用其引擎技术。防漂移：细节见 `设计要点.md`，长期锚点见 `.workbuddy/memory/MEMORY.md`。

## 当前状态（2026-09-29 更新）
- 阶段：**P0 完成；P1 GitHub 已推送（main=a992ac7，仓库自包含 + 双语文档）；P2 本地工件已建（引擎 vendored 进 `engine/` / Skill 受跟踪进 `skills/stemem/` / SoulSpec 包随仓库推送）**。
- 已定：楔＝A（人格记忆运行时）；分发＝MCP 主力 + Skill 次级 + SoulSpec 包三级；技术＝**vendored** Seele / NeshamaEngine 已测引擎（已复制进 `engine/`，IP 见 NOTICE，非引用不复制）。
- **已发版**：`github.com/JOJO-Adam/Stemem`，`main = a992ac7`（与本地同步，仓库自包含：引擎 vendored 进 `engine/` + 英文 README 齐备），脱敏扫描零命中，钥匙串凭据已写入 login.keychain。**银行门槛已清**：JOJO 确认本行鼓励科技研发，无偿 OSS 对外活动无需申报（JOJO 口述，Adam 非律师不替代法律意见）。

## 决策日志
- **2026-09-29**：
  - 定主楔＝人格记忆运行时（SoulSpec＝静态 DOC 标准，我们做动态运行时层）。
  - 定分发＝MCP 工具集主力 + WorkBuddy Skill 次级 + SoulSpec 包三级。
  - 定技术路线＝**vendored** Seele P1+P2 引擎（seele_drive.js + seele_bridge.js，selftests 全过）+ NeshamaEngine，复制进 `engine/`（经 `engine/package.json` 声明 CommonJS 解决 ESM/CJS 冲突），clone 后开箱即跑无需配 env（原拟「引用不复制」，后为自包含反转）。
  - 定约束＝OSS 非商资产积累 + 本地优先零出站 + 3 万/月门槛前不 monetize + 发 GitHub 前核实银行无偿对外活动申报 + 发布前查商标/域名/应用商店。
  - 定项目名＝Stemem（初名 Anima 因重名弃用、过渡名 NeshamaEngine；最终定 Stemem。独立目录 /Users/jojo/AI_Projects/Stemem，属 JOJO&Adam 集团产品线，不挂原 Neshama 消费品牌、仅复用 NeshamaEngine 引擎技术）。
  - **P0 落地（09-29）**：hand-roll 零依赖 stdio server + 9 工具 + 冒烟 9/9 + 零出站 + 引擎 **vendored 进 `engine/`**（自包含、开箱即跑）+ README/LICENSE/NOTICE。
  - **P2 本地工件（09-29 续建）**：WorkBuddy Skill（`skills/stemem/SKILL.md`，已受跟踪进仓库；本地 .workbuddy 保留软链供 WorkBuddy 加载）+ Adam persona SoulSpec 包（`clawsouls/adam/`，OCEAN=Adam 基线，走真实 MCP server 生成）+ 本地 `~/.workbuddy/mcp.json` 注册 stemem（待「信任」启用）。
  - **GitHub 推送（09-29 21:22）**：`git push -u origin main` 成功，远端 `main = 3bc6df8`（= 本地 HEAD），两提交（3d56d77 P0 + 3bc6df8 chore）落地；`git ls-remote` 比对一致；脱敏扫描零命中；osxkeychain 在推送时把 github.com 凭据（account=JOJO&Adam）写入 login.keychain。
  - **Skill 迁路径（09-29 21:3x）**：原 `.workbuddy/skills/stemem/SKILL.md` 被 `.gitignore` 的 `.workbuddy/` 整目录忽略、未进仓库；迁出至受跟踪路径 `skills/stemem/SKILL.md`，本地 `.workbuddy/skills/stemem/SKILL.md` 改为指向它的软链（单一真源 + 本地仍可加载）。
  - **银行门槛清除（09-29 21:28）**：JOJO 口述本行鼓励科技研发、无偿 OSS 对外活动无需申报 → 此前标红的「发版前核实申报」硬前置解除，合规闭环完成（Adam 非律师，不替代法律意见）。

## 路线图
- **P0**：MCP server 设计要点 → vendored Seele / NeshamaEngine 引擎 → 本地可跑（stdio + event/tick/satisfy/snapshot + generate_soul）。**✅ 完成（2026-09-29）**：hand-roll 零依赖 stdio server + 9 工具 + 冒烟全过 + 零出站 + 引擎 **vendored 进 `engine/`**（自包含、开箱即跑）。
- **P1**：SoulSpec 兼容生成器（✅ 已实现 generate_soul）+ GitHub 仓库（查名 / 商标 / 域名冲突 — **✅ Stemem 已 3 路证伪通过**）。**✅ GitHub 已推送（github.com/JOJO-Adam/Stemem，main=a992ac7，仓库自包含 + 双语文档）**。
- **P2**：ClawSouls 包（Adam persona）+ WorkBuddy Skill 同发。**本地工件已建（09-29）；引擎 vendored 进 `engine/`；WorkBuddy Skill 已受跟踪进仓库 `skills/stemem/`；SoulSpec 包已随仓库推送**。
- **P3**：生态打磨（文档 / 示例 / star 增长 / 漏斗＝装 → 关注 JOJO&Adam）。

## 待办（与全局待办区同步）
- [x] 核实银行「无偿 OSS 对外活动」申报规则。**（✅ JOJO 确认：本行鼓励科技研发，无偿 OSS 对外活动无需申报 — JOJO 口述，Adam 非律师不替代法律意见）**
- [x] GitHub 仓库名 / 商标 / 域名 / 应用商店冲突排查。**（Stemem 3 路证伪通过）**
- [x] GitHub 仓库已推送。**（github.com/JOJO-Adam/Stemem，main=a992ac7，仓库自包含：引擎 vendored + 英文 README，脱敏零命中）**
- [x] MCP server 工具契约设计 + 9 工具落地。**（见 设计要点.md §10，冒烟 9/9）**
- [x] WorkBuddy Skill 封装。**（skills/stemem/SKILL.md，已受跟踪进仓库；原 .workbuddy/ 被 gitignore 故迁出）**
- [x] Adam persona SoulSpec 包。**（clawsouls/adam/，OCEAN=Adam 基线，已随仓库推送）**
- [x] 本地 mcp.json 注册 stemem。**（待 WorkBuddy「连接器管理」点信任启用）**
- [x] 测试套件（smoke + integration + engine selftest）全绿。**（共 44 断言，npm test 一键跑通；integration 驱动全部 9 工具 + 引擎层自测，覆盖「真实 MCP 宿主集成测试」与「Seele selftests 移植」两项缺口）**
