---
name: company-feature
description: >
  company-mt overlay of harness-feature. Java 企业级 8-Stage 新功能流程，叠加
  Stage 1 前强制 invoke java-standards（或 meituan-java-standards）；
  Stage 3 涉及新 i18n 文本时强制 invoke java-backend-i18n-refactor；
  Stage 7 安全审查 company-mt profile 强制启用；
  Stage 8 严格禁止所有 hard_floor 动作。
  触发命令：（无公开触发词）
---

# company-feature — Java 企业 8-Stage 新功能 overlay

> 基于 `harness-feature`，叠加 Java 编码规范 + i18n + compliance 约束。

## 差异点（相对 harness-feature）

### Stage 1 前置：Java 编码规范（新增）

team-architect invoke **之前**，额外调用：

```
Skill(java-standards) → 若无 → Skill(meituan-java-standards) → 都无 → degraded Strategy B
```

Strategy B：读 `docs/harness/knowledge/style-and-structure/manifest.md`（init 时从
`../../references/java-rules.md` seed 投放的 5 条基础 rule）作保底。

**Degraded 明示**：在回复第一段输出："company-mt degraded: Java 深度约定不可用"。

完整 fallback 协议 → [../../references/degraded-fallback.md](../../references/degraded-fallback.md)

### Stage 3 触发：i18n 检测

若 diff 涉及任何新增 "中文字符串字面量" 或 Controller 响应字段 label：

```
Skill(java-backend-i18n-refactor) with diff
```

若 repo 命中 `costasset-*` matcher 且 java-backend-i18n-refactor 已跑 → 追加
`Skill(costasset-i18n-phase2)` 做阶段 2 细化。

两个都缺 → degraded Strategy C（跳过 + 高优先级 learnings）。

### Stage 7 强制启用

team-security 在 `personal` profile 是**可选**的，company-mt 是**强制**的（由
`profile.compliance_hooks.required_checks` 规定）。不可跳过，不可 degraded（无
team-security skill → Round abort，不继续 Stage 8）。

### Stage 8 Hard-Floor 严格执法

company-mt 的 `hard_floor` 默认含全部 6 种：
`auto_push` / `force_push` / `destructive_ops` / `auto_merge` / `rewrite_history` / `network_install`

这些动作在 Stage 8：
- 禁止自动执行（即使 `/yolo` 也不行，profile-entry 已剔除）
- Stage 8 独立再验一次（纵深防御）
- 违反 → `harness doctor` 立即 BLOCKED，要求人工接管

## 共用 harness-feature 的完整结构

Stage -0.5 / Stage 0-7 的具体 invoke 细节与 harness-feature 相同。详见：

- 8-Stage 详解：`harness-feature/references/stages.md`
- Knowledge scanner 集成：`harness-feature/references/knowledge-integration.md`
- Hard-floor 执法机制：`harness-feature/references/hard-floor-enforcement.md`
- Round 规模分级：`harness-feature/references/round-sizing.md`
- Stage prompt 模板：`harness-feature/prompts/*-prompt.md`

## 额外警戒区

Stage 3 实现 + Stage 4 strict-reviewer 审查时，Java 警戒区代码要特别关注
（transaction / ThreadLocal / async / 审批流等）：

详见 [../../references/java-gates.md](../../references/java-gates.md) Category 2 / Category 3。

## 引用

- 基础 skill：`harness-feature/SKILL.md`
- Java 企业硬规则：[../../references/java-gates.md](../../references/java-gates.md)
- Degraded fallback：[../../references/degraded-fallback.md](../../references/degraded-fallback.md)
- Java seed（init 投放）：[../../references/java-rules.md](../../references/java-rules.md)
- Enterprise SDK seed：[../../references/enterprise-sdk.md](../../references/enterprise-sdk.md)
- i18n seed：[../../references/i18n.md](../../references/i18n.md)
- 审批流 constraint seed：[../../references/approval-flow.md](../../references/approval-flow.md)
