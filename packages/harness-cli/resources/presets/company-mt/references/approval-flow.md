# Approval Flow Constraint Seed（for docs/memory/constraints/ init）

投放到 target repo 的 `docs/memory/constraints/harness_approval_flow.md`，
`init --preset company-mt` 自动 materialize。

---

```yaml
---
id: constraint-approval-flow
status: active
source: external_policy
owner: platform-team
applies_to:
  paths:
    - "src/main/java/**/approval/**"
    - "src/main/java/**/*ApprovalFlow*.java"
    - "src/main/resources/mapper/bpm_*.xml"
  modules:
    - approval-flow
    - bpm
last_verified: {{today}}
expiry_after_days: 365
---
```

## Constraint

企业审批流基于 `bpm_flow_node` 表驱动；权限判断**必须基于 `ruleCode`**，
不使用 `taskCode` 或 `taskName`（两者用于展示，不作权限 ground-truth）。

## Why It Exists

历史遗留：`taskCode` 在 2023 年前是权限判断字段；之后迁移到 `ruleCode` 以支持
多租户审批规则。旧代码如果还用 `taskCode` 会在多租户场景误判。

## Allowed Workaround

无。任何新代码必须读 `ruleCode`。如果遗留代码仍用 `taskCode`，优先级：
- 新功能 → 必须用 ruleCode
- bug fix → 修 bug 时顺手迁移到 ruleCode（加一条 ADR 到 docs/memory/decisions/）
- 重构 → 必须一起迁（属于 refactor scope）

## Violation Cost

- 短期：生产环境多租户审批错判（用户 A 可以通过 B 的审批）→ 安全事件
- 长期：老旧 `taskCode` 使用进一步扩散 → 迁移成本线性增长

## Removal Trigger

当 `bpm_flow_node.taskCode` 字段从 DB schema 移除时才能撤销本约束。
