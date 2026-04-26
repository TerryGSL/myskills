# 与 profile-entry 的关系

| 层级 | 职责 | 谁负责 |
|------|------|--------|
| **外层分解**：用户消息有几件事要做？ | task-dispatcher |
| **入口路由**：做 profile 探测 + task_type 选择 + aggression mode 解析，加载恰好一个 leaf sub-skill | profile-entry |

两层协作关系如下：

- **旧版**：task-dispatcher 判定代码任务 → 直接甩 harness-workflow（单体 8-Stage）
- **当前**：task-dispatcher 判定代码任务 → 派发给 `profile-entry`，由它做 profile 探测 + task_type 选择 + aggression mode 解析 → 加载恰好一个 leaf sub-skill（quick / bugfix / feature / refactor 等）

代码任务类型（quick / bugfix / feature / refactor）**不再由 task-dispatcher 决定**；由 `profile-entry` 的结构性 fast-path + 用户 flag 决定。task-dispatcher 的外层并行/串行分解职责保持不变。

**典型组合：** 用户消息包含 1 个代码任务 + 1 个调研任务 → task-dispatcher 派调研 agent（background），同时派发 `profile-entry` 做代码任务的路由与执行。
