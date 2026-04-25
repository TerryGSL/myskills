# 三层记忆写入权限矩阵

> **Source of truth**: `packages/harness-cli/src/types/constants.ts`（或对应 `memory.schema.json`）。如本文档与代码不一致，以代码为准。

Single source of truth for who writes what memory file, at what stage, with what schema.

## 三层概览

```
代码验证过程
    ↓
.harness/learnings/*                  ← 原始采集层（rolling inbox, 未证实）
    ├── 一次性噪音 → 留 retention 过期
    └── 跨轮稳定 & 有价值
            ├── bug/反模式       → docs/memory/cases/
            ├── 架构取舍         → docs/memory/decisions/
            └── 长期边界/制度限制 → docs/memory/constraints/
                    ↓
                代码 idiom / SDK / i18n → docs/harness/knowledge/*
                （不从 memory 自动升，手工 harness scan 触发）
```

## 写入权限矩阵

| 层 | 写入权限 | 时机 | Schema 约束 |
|----|---------|------|------------|
| `.harness/learnings/LEARNINGS.md` | 任何 skill / Stage | 任何时候追加 entry | entry schema 见下 |
| `.harness/learnings/ERRORS.md` | 任何 skill / Stage | 发现错误后追加 | entry schema 见下 |
| `.harness/learnings/FEATURE_REQUESTS.md` | 任何 skill / Stage | 发现 gap 后追加 | entry schema 见下 |
| `docs/memory/cases/` | Stage 8（收尾）/ `harness maintain` | Round 结束 + errors_collection 阈值满足 | case frontmatter |
| `docs/memory/decisions/` | Stage 2（写 plan 时） | 每 ADR 一条 | decision frontmatter |
| `docs/memory/constraints/` | **人工** / doc-sync skill | 新增业务边界（不自动） | constraint frontmatter |
| `docs/memory/archive/` | `harness maintain --upgrade` | status=superseded/archived 或超 180d 未用 | 同源 frontmatter |
| `docs/harness/knowledge/<domain>/manifest.md` | **只** `harness scan` / `scan --apply-answers` | 扫描 pipeline 完成 | manifest schema（Spec 1） |
| `docs/harness/knowledge/<domain>/evidence.md` | **只** `harness scan` | 同上 | evidence schema（file:line 硬约束） |
| `docs/harness/knowledge/<domain>/gaps.md` | `harness scan` / `harness scan --apply-answers` | TODO 解析时 | gap schema |

**违反 → strict-reviewer Step 5 立即 FAIL**（grounded by "wrote to wrong memory layer"）。

## Entry Schemas

### Layer C：learnings rolling inbox

三文件共用大骨架（出自 spec §6.2）：

```md
## [LRN|ERR|FEAT-YYYYMMDD-XXX] category
**Logged**: <ISO-8601>
**Priority**: low | medium | high | critical
**Status**: pending | in_progress | resolved | wont_fix | promoted
**Area**: product | frontend | backend | infra | tests | docs | config | workflow
### Summary
（一句话）
### Details | Error | Requested Capability
（具体描述）
### Suggested Action | Suggested Fix | Suggested Implementation
### Metadata
- Source: user_feedback | implementation | verification | docs | command
- Stage: requirement-analysis | plan-generation | feature-execution | verification | doc-sync | direct-task
- Related Files: <paths>
- Tags: <comma-separated>
- Pattern-Key: <optional, 用于去重 + 升格检测>
```

### Layer B：docs/memory/cases/ frontmatter

```yaml
---
id: <slug>
date: YYYY-MM-DD
module: <module-name>
status: active | suspect | archived | superseded
applies_to:
  paths: ["src/..."]
  symbols: ["ClassName", "functionName"]
  deps: [{ name: "mvn-groupId:artifactId", range: "1.2.x" }]
criteria_met:
  - diagnosis_over_30m
  - cross_module
  - repeated
  - platform_specific
  - user_visible
  - invalidated_assumption
freshness:
  state: active | suspect
  last_verified: YYYY-MM-DD
  last_used: YYYY-MM-DD
  suspect_since: YYYY-MM-DD | null
superseded_by: <other-case-id> | null
next_time_signal:
  - <hint for future catch>
---
## Symptom
## Root Cause
## Fix
## Negative Patterns
## Future Check
```

### Layer B：docs/memory/decisions/ frontmatter

```yaml
---
id: <slug>
date: YYYY-MM-DD
status: active | superseded | archived
scope: architecture | data | integration | workflow
decided_by: [<name>]
applies_to:
  paths: [...]
  modules: [...]
superseded_by: <other-decision-id> | null
---
## Decision
## Context
## Why This Won
## Rejected Options
## Revisit Trigger
```

### Layer B：docs/memory/constraints/ frontmatter

```yaml
---
id: <slug>
status: active | lifted | archived
source: external_policy | legacy_contract | platform_limit | business_rule
owner: <team-or-person>
applies_to:
  paths: [...]
  modules: [...]
last_verified: YYYY-MM-DD
expiry_after_days: <int> | null
---
## Constraint
## Why It Exists
## Allowed Workaround
## Violation Cost
## Removal Trigger
```

## Retention 规则（Layer C）

| 状态 | 保留策略 |
|------|---------|
| `pending` / `in_progress` | 永久保留 |
| `resolved` / `wont_fix` / `promoted` 超 90 天 | 折叠正文（保留 Summary + Metadata + Resolution 摘要） |
| `promoted` + Layer B 有 canonical target 超 180 天 | 删正文，只留 entry 头 + Metadata + `see: <memory_path>` stub |

**只有 `harness maintain` 做 retention 压缩**。叶子 skill 不做。

## Promotion 提醒

`harness maintain` 输出"可升格 learnings 待人工分类"：

- 超 30 天未 triage 的 `pending` entries
- "连续 2 轮引用同 Pattern-Key" 的 entry（跨轮稳定，值得升格）

**不自动升格** —— 需要人工判断 bug/ADR/constraint 类别。

## 实现位置

- Canonical schema 真源：`packages/harness-cli/src/types/*.ts` + `resources/schemas/*.json`
- learnings 读取实现：`packages/harness-cli/src/utils/learnings.ts` (`parseLearnings` / `detectPromotables`)
- memory 树检查：`packages/harness-cli/src/utils/memory.ts` (`memoryTreeIntact`)
- 原 contract 来源：`harness-workflow/references/memory.md`（保持详细论证，本文只是摘要索引）
