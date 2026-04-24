---
name: harness-refactor
description: >
  重构专用流程：baseline capture → 增量 plan → 持续验证 → 对比 baseline。
  **不对外公开触发词** —— 由 profile-entry 的 `--refactor` flag 路由到此。
  使用场景：代码结构调整、提取公共、改命名、Split/Merge 模块等不改 behavior 的任务。
  触发命令：（无公开触发词）
---

# harness-refactor — 重构专用流程（v1）

> 由 `profile-entry` 的 `--refactor` flag 或自动识别路由。
> Source: 原 `harness-workflow/archive/pre-reshape-backup.md` 的重构相关 Stage 组合。

## 核心原则

重构 ≠ 新功能。**behavior 必须完全保持**。任何行为变化 → 升级到 harness-feature 或 harness-bugfix。

## 四阶段流程

### Phase 1：Baseline Capture

在写任何代码前：

1. 跑全量测试 → 记录通过数 + 覆盖率 → 写 `.harness/refactor-baseline-<timestamp>.json`
2. 如果当前覆盖率 < 70% → **硬 abort**：重构前必须先补测试（否则无法验证 behavior 不变）
3. 记录关键 API 的输入输出 fixture（用于后续对比）

### Phase 2：Incremental Plan

写 `docs/superpowers/plans/refactor-<slug>.md`，包含：

- **小步骤**：每步 ≤ 50 行 diff，独立可通过测试
- **每步后跑测试**：任一步骤 FAIL → revert 该步，重新分析
- **rename/move**：用 IDE 的 "rename symbol" / "move file" 重构工具（避免手 sed）
- **提取函数**：先建新函数 + 写测试，再替换调用方，再删老实现

Plan 必须通过 `Skill(strict-reviewer)` 审稿（`stage: "spec"`）。

### Phase 3：执行

按 plan 一步一步来。每步：

1. 做 diff
2. 跑全量测试 → 必须 PASS
3. 对比 baseline fixture → 输入输出一致
4. commit（conventional：`refactor: <描述>`）

FAIL → **立即 revert 该步**，回到 plan，重新拆更小。

## Phase 4：Final Comparison

重构完成后：

- 全量测试 → 与 baseline 通过数一致（或更高）
- 覆盖率 → ≥ baseline
- API fixture → 完全相同
- 性能（若 baseline 含）→ 不劣化 > 5%

任一退化 → 升级用户决策（"重构引入了性能退化 X%，是否继续？"）。

## 硬限制

- 无 baseline 不允许开始（avoid flying blind）
- 单步 > 50 行 → 拆分；违反 → strict-reviewer FAIL
- API fixture 对比不通过 → 必须回滚或改 plan
- 重构过程中发现 bug → 不在 refactor 里修，另起 harness-bugfix Round

## 与 harness-feature 的区别

| 维度 | harness-refactor | harness-feature |
|------|-----------------|----------------|
| 目标 | 不改 behavior | 改 behavior |
| 需求 | 无 PRD（用代码当规范） | 必须 PRD（Stage 0） |
| 架构 | 无新架构决策 | 可能有（Stage 1 ADR） |
| 测试 | baseline 对比 | 新测试 + 回归 |
| 覆盖率 | 不允许下降 | 允许短期下降（后续补） |

## 参考

- 原重构模式：`harness-workflow/archive/pre-reshape-backup.md`
- strict-reviewer 审稿模板：`strict-reviewer/SKILL.md`
