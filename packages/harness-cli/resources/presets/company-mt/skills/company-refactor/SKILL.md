---
name: company-refactor
description: >
  company-mt overlay of harness-refactor. Java 企业级重构，额外要求 baseline 包含
  单元测试覆盖率 ≥ 70% + 关键 API 的 MyBatis SQL fixture 比对。
  触发命令：（无公开触发词）
---

# company-refactor — Java 企业重构（v1 overlay）

> 基于 `harness-refactor`，叠加 Java-specific baseline 要求。

## Phase 1 (Baseline) 额外要求

- `mvn test -pl <module>` 全通过（或 `./mvnw test -pl <module>`）
- JaCoCo / Cobertura 覆盖率 ≥ 70% — 未达标 **硬 abort**：先补测试
- 关键 API 的 **SQL fixture**：
  - MyBatis Mapper 的所有 `<select>` / `<update>` 的 SQL 输出（带参数）
  - 保存在 `.harness/refactor-baseline-<timestamp>/sql-fixtures.json`
- 关键接口的 **JSON response fixture**（用 integration test 录）

## Phase 3 (执行) 额外硬约束

- 不允许跨 Spring `@Configuration` / `@ComponentScan` 边界的重构（风险太大）
- 不允许改 MyBatis SQL 的语义（只允许格式化 / 重命名变量）
- 任何包结构 rename 必须用 IDE 的 "Refactor → Rename package"，不允许 sed

## Phase 4 (Final Comparison) 额外比对

- SQL fixture 比对：所有 Mapper 输出 SQL **必须完全相同**（包含参数位置）
- Performance 退化阈值：企业场景降到 **3%**（比个人场景的 5% 严）
- 响应时间 P95 不允许退化 > 5ms

## 其他

承接 `harness-refactor` 的四阶段（baseline / plan / 执行 / final comparison）。

## 参考

- 基础：`harness-refactor/skill.md`
- Spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md` §7.4
