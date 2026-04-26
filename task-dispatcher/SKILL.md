---
name: task-dispatcher
description: >
  通用任务编排器。自动评估每条用户消息的并行化机会，派发 sub-agent 处理独立子任务，协调汇总结果。
  不限于代码开发 — 适用于调研、运维、配置、问答、调试及混合工作负载。
  在每条用户消息上使用以提升吞吐量。
  触发条件：任何包含 2+ 独立子任务的用户消息自动激活。
---

# Task Dispatcher — 通用任务编排

> **核心原则：默认并行，只在依赖强制时串行。**

通用任务编排器，覆盖代码开发、调研、运维、配置、问答、调试以及混合工作负载。每条用户消息到达时，先做分解评估，识别独立子任务并最大化并行执行；仅在存在硬依赖时串行。task-dispatcher 只负责**外层分解**（用户消息有几件事要做、能否并行），不负责代码任务的内部路由（那是 `profile-entry` 的职责）。

> **Skill() 加载触发分层（重要）：** L0 评估每条消息都做，但**隐式**（AI 脑内判断 1 / ≥2 子任务）。**只有 ≥2 独立子任务时才显式 `Skill(task-dispatcher)` 加载本协议**，单任务直接进 L1 入口分发。原因：本 SKILL.md 含完整派发模板（agent prompt / 不重叠边界 / 输出预期等 7 份 references），单任务不需要这些细节加载，浪费 token。详见 [docs/ARCHITECTURE.md §3 任务执行流](../docs/ARCHITECTURE.md#3-任务执行流用户说话--执行)。

---

## 触发条件

每条用户消息到达时，先做**分解评估**，再动手：

1. 消息里有多少**独立子任务**？（1 个 → 直接做；2+ → 评估并行）
2. 任意两个子任务之间：B 是否依赖 A 的输出？不依赖 → 并行。依赖 → A 先，B 后
3. 每个子任务：是否明确到可以派发 sub-agent，还是需要主 agent 判断？

---

## 主流程

```
1. 分解：拆出独立子任务清单
2. 分类：每个子任务匹配派发规则（见 references/scale-heuristics.md）
3. 依赖分析：独立 → 并行；依赖 → 串行
4. 派发：按协议构造 prompt（见 references/dispatch-protocol.md）
5. 汇报：立即告知用户启动了什么（见 references/progress-reporting.md）
6. 协调：收集结果 + 验收 + 合成回复（见 references/coordination-rules.md）
```

---

## References — 按需查阅

做以下事情时，读对应的 reference 文件：

- **判断「这个子任务该不该派发 / 派给哪种 agent」** → 读 `references/scale-heuristics.md`（派发规则表 + 规模直觉 + 批次划分原则）
- **构造派发 prompt / agent briefing** → 读 `references/dispatch-protocol.md`（4 条派发要求 + Agent Prompt 模板）
- **多 agent 并发结果汇总 / 验收 / 失败回退** → 读 `references/coordination-rules.md`（协调原则 + 质量保障 + 验收标准 + 回退协议）
- **拿不准要不要并行 / 是否串行化** → 读 `references/decision-flow.md`（什么时候不并行 + 串行化红旗 + 决策流程图）
- **看具体派发样例 / 学分解套路** → 读 `references/examples.md`（混合工作负载 / 多文件变更 / 不可并行 三个示例）
- **代码任务派发到下游 leaf skill** → 读 `references/profile-entry-integration.md`（与 profile-entry 的两层职责划分）
- **怎么向用户汇报进度 / 单 agent 完成 / 全部完成** → 读 `references/progress-reporting.md`（汇报时机 + 表格模板）

---

## 关键约束（不读 references 也必须遵守）

- **零上下文原则**：sub-agent 没有本次对话上下文，prompt 必须自包含
- **不重叠边界**：绝不让两个 agent 编辑同一个文件，冲突 → 串行
- **Background 执行**：所有派发 agent 用 `run_in_background: true`
- **失败处理**：agent 失败 → 主 agent 接手，不重试超过 1 次
- **代码任务交给 profile-entry**：task-dispatcher 不直接决定 quick/bugfix/feature/refactor，派发给 `profile-entry` 由它路由
