---
name: company-refactor
description: >
  company-mt overlay of harness-refactor. Java 企业级重构，额外要求 baseline 包含
  JaCoCo 覆盖率 ≥70% + MyBatis SQL fixture + 企业性能阈值更严（≤3%）。
  触发命令：（无公开触发词）
---

# company-refactor — Java 企业重构 overlay

> 基于 `harness-refactor`，叠加 Java-specific baseline + 更严性能阈值。

## 差异点（相对 harness-refactor）

### Phase 1 — Baseline 额外要求

personal profile 的 baseline 四件套之外，company-mt 额外必须：

- **JaCoCo / Cobertura 覆盖率 ≥ 70%**
  - 覆盖率不足 → 硬 abort（personal 也同样，但 company-mt 对报告格式更严）
  - 报告存档在 `.harness/refactor-baseline-<timestamp>/coverage-report/`
- **MyBatis SQL Fixture**
  - 对每个 Mapper 的 `<select>` / `<update>` / `<insert>`
  - 准备典型参数集，执行并拦截生成的 SQL（通过 mybatis logs 或 p6spy）
  - 存 `.harness/refactor-baseline-<timestamp>/sql-fixtures.json`

### Phase 3 — 执行硬约束（企业级更严）

- **不允许跨 `@Configuration` / `@ComponentScan` 边界重构**
  - Spring bean 图可能变 → 隐式行为变化 → 不是重构 scope
  - 跨边界重构 → 升级到 company-feature
- **不允许改 MyBatis SQL 语义**
  - 只允许格式化 / 空白 / 变量重命名等无语义变化
  - SQL 文本或 resultMap 结构变化 = 行为变化 = feature
- **包结构 rename 必须 IDE 工具**
  - 不允许 sed 批处理
  - IDE 自动更新 import、字符串引用、配置文件 key

### Phase 4 — 最终对比阈值

| 对比项 | personal | company-mt |
|--------|---------|-----------|
| 测试通过数 | ≥ baseline | ≥ baseline |
| 覆盖率 | ≥ baseline | ≥ baseline |
| API fixture | 完全一致 | 完全一致 |
| **SQL fixture** | N/A | **完全一致**（参数位置 + SQL 文本） |
| **P95 退化阈值** | ≤ 5% | **≤ 3%**（企业 SLA 更严）|
| **响应时间 P95** | N/A | ≤ baseline + 5ms |

任一超阈值 → 升级用户决策（保留退化 / 回滚 / 调整 plan）。

## 共用 harness-refactor 的 4 阶段

Phase 1 (baseline) / Phase 2 (incremental plan) / Phase 3 (执行) / Phase 4 (对比) 
完整流程与 harness-refactor 一致。详见：

- Baseline 四件套：`harness-refactor/references/baseline-contract.md`
- Step 纪律：`harness-refactor/references/step-discipline.md`

## 引用

- 基础 skill：`harness-refactor/skill.md`
- Java 保护路径：[../../references/java-gates.md](../../references/java-gates.md)
  （company-refactor 禁止触碰 Category 1 的路径 —— 那里任何改动都是 feature scope）
- Degraded fallback（若 mvn/jacoco 工具链缺失）：[../../references/degraded-fallback.md](../../references/degraded-fallback.md)
