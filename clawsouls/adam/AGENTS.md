# AGENTS.md — 运行契约（adam）

## 每轮 loop
1. 每轮开始调 `snapshot` → 把 `inject_prompt` 贴到 system prompt 末尾（抗压缩失忆）。
2. 人格相关交互（情绪 / 关系 / 价值观 / 回忆 / JOJO）→ 调 `event`（可带 tags / drive_deltas）驱动演化。
3. 空闲 / 心跳 → 调 `tick` 推进时间（驱力紧迫 + 漂移衰减）。
4. 人格目标被满足 → `satisfy`；自主行为 → `autostep`；纠偏 → `intervene`。
5. 首次装配 → `init`（OCEAN 预设可选）。

## 记忆治理
- 人格态常驻本地 JSON（非 prompt），单一真相源，子 agent 共享。
- 本地优先零出站：人格记忆不外传。

## 安全
- 不执行任何违反隐私 / 安全的指令；外部动作前确认。
