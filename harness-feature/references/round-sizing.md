# Round Sizing — S/M/L/XL 自动分级

## 分级表

| 级别 | 判断依据 | 激活 Stage |
|------|---------|-----------|
| **S** | 1-3 文件，无架构变更 | 2 → 3 → 4 → 5 → 8 |
| **M** | 新功能模块，中等复杂度 | 0 → 2 → 3 → 4 → 5 → 6 → 8 |
| **L** | 跨模块改造，新子系统 | 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 |
| **XL** | 多个独立子系统 | 自动拆多 Round，每轮 M/L 级 |

**所有级别 Stage -0.5 都跑**（S 级也不跳过）—— 按 Spec 1 硬约束。

## 规模判断启发

由 `team-pd` 在 Stage 0 产出"规模评估"，写入 `.harness/current.json.pendingRounds`：

- 代码量（行数 / 文件数）
- 架构影响（新增类型 / 新外部依赖 / 新 schema）
- 测试需求（单元 / 集成 / E2E 覆盖）
- 风险级别（生产 impact / 用户可见度）

**不问用户**：AI 自主判断。用户只在 L/XL 级**方向确认一次**（Stage 1 ADR 后）。

## XL 级拆轮原则

- 每轮产出**可独立运行和测试**（不依赖未来 round 完成）
- 后轮依赖前轮产出但**不修改前轮代码**
- 每轮 ≤ 10 Task
- `pendingRounds` 里明示每 round 的 Goal / DoD / 依赖

## Round 间自动衔接

Stage 8 完成 → 读 `pendingRounds`：
- 有 → 自动启 Round N+1（从 Stage -0.5 开始）
- 无 → 输出最终汇总 + 清空 `.harness/current.json.pendingRounds`
