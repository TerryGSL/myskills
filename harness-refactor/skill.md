---
name: harness-refactor
description: >
  重构专用流程：baseline capture → 增量 plan → 持续验证 → 对比 baseline。
  核心原则：**behavior 必须完全保持**；任何行为变化 → 升级到 harness-feature 或 harness-bugfix。
  **不对外公开触发词** —— 由 profile-entry 的 `--refactor` flag 路由到此。
  使用场景：代码结构调整、提取公共、改命名、split/merge 模块等不改 behavior 的任务。
  触发命令：（无公开触发词；profile-entry 路由）
---

# harness-refactor — 重构专用流程

> 由 profile-entry 的 `--refactor` flag 或自动识别路由。
> Source: 原 harness-workflow v0 的重构相关 Stage 组合。

## 核心原则

**重构 ≠ 新功能**。behavior 必须完全保持。任何行为变化 → 升级到 `harness-feature`（新功能）或 `harness-bugfix`（修 bug）。

## 四阶段流程

### Phase 1：Baseline Capture

捕获 4 类基线数据（测试 / 覆盖率 / API fixture / company-mt 额外 SQL fixture），
**无 baseline 硬 abort**。

**完整 baseline 四件套契约 + personal/company-mt 差异** → [references/baseline-contract.md](references/baseline-contract.md)

### Phase 2：Incremental Plan

写 `docs/superpowers/plans/refactor-<slug>.md`：
- 每步 ≤ 50 行 diff，独立过测试
- 用 IDE 工具做 rename / move（不用 sed）
- Plan 必须通过 `Skill(strict-reviewer)` 审稿（`stage: "spec"`）

### Phase 3：执行

按 plan 一步一步走：
1. 做 diff
2. 跑全量测试 → 必须 PASS
3. 对比 baseline fixture → 输入输出一致
4. commit（`refactor: <描述>`）

FAIL → **立即 revert 该步**（`git reset --hard HEAD~1`），回到 plan 重新拆更小。

**完整 step 纪律 + revert 策略 + 允许/禁止模式** → [references/step-discipline.md](references/step-discipline.md)

### Phase 4：Final Comparison

与 baseline 对比：

| 对比项 | personal | company-mt |
|--------|---------|-----------|
| 测试通过数 | ≥ baseline | ≥ baseline |
| 覆盖率 | ≥ baseline | ≥ baseline |
| API fixture | 完全一致 | 完全一致 |
| SQL fixture | N/A | 完全一致 |
| P95 退化 | ≤ 5% | ≤ 3% |

任一退化 → 升级用户决策（继续 / 回滚 / 接受退化）。

## 硬边界

- 无 baseline 不允许开始（avoid flying blind）
- 单步 > 50 行 → strict-reviewer 审 plan 时 FAIL
- 跨 Spring `@Configuration` / `@ComponentScan` 边界 → 禁止
- MyBatis SQL 语义变化 → 禁止（属于 feature scope）
- 重构中发现 bug → 不在本 Round 修，起独立 `harness-bugfix` Round

## 与 harness-feature 的区别

| 维度 | harness-refactor | harness-feature |
|------|-----------------|----------------|
| 目标 | 不改 behavior | 改 behavior |
| 需求 | 无 PRD（用代码当规范） | 必须 PRD（Stage 0） |
| 架构 | 无新架构决策 | 可能有（Stage 1 ADR） |
| 测试 | baseline 对比 | 新测试 + 回归 |
| 覆盖率 | 不允许下降 | 允许短期下降（后续补） |

## 引用

- Baseline 四件套：[references/baseline-contract.md](references/baseline-contract.md)
- Step 纪律：[references/step-discipline.md](references/step-discipline.md)
- 原重构模式：`harness-workflow/archive/pre-reshape-backup.md`
- strict-reviewer 审稿模板：`strict-reviewer/SKILL.md`
