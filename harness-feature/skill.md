---
name: harness-feature
description: >
  L/XL 级新功能的完整 8-Stage 自治流程。承接原 harness-workflow v0 的 8-Stage 全文，
  显式调用 team-pd / team-architect / team-{senior,junior}-dev / team-qa / team-security
  + strict-reviewer 完成需求→架构→规划→实现→审查→QA→安全→收尾闭环。
  **不对外公开触发词** —— 由 profile-entry 的任务类型路由到此（默认所有非 quick/bugfix/refactor 都走这里）。
  使用场景：新功能、跨模块改造、新子系统。
  触发命令：（无公开触发词；profile-entry 路由）
---

# harness-feature — 8-Stage 自治新功能流程（v1）

> 由 `profile-entry` 路由。Source: 原 `harness-workflow/archive/pre-reshape-backup.md`
> 的 `8-Stage 自治工作流` 段（第 236-320 行），本 skill 等价抄录 + 适配 profile-entry 入口。

## 输入

由 profile-entry 传入：`resolved_profile` / `resolved_mode` / `task_description` / `hard_floor`。
company-mt profile 下 `hard_floor` 会禁止 `auto_push` 等，Stage 8 收尾时必须遵守。

## Stage -0.5：Project Context Retrieval（R10 知识注入）

进入 Stage 0 前：

1. 读 `.harness/current.json` 检 `workflow_schema_version`（双向哨兵）
2. 读 `docs/harness/knowledge/INDEX.md`（如存在）
3. 按 path glob / keyword / always-load 选 relevant_knowledge_files
4. render 两个视图：**Binding Rules**（Status=active）+ **Advisory Context**（expired / user_override）
5. 写 `.harness/status.json.knowledgeCheck` 供 Stage 4 strict-reviewer Step 5 核查

若 `CLAUDE.md` 含 `harness-knowledge: disabled` → 跳过本 Stage。

## Stage 0：需求分析（team-pd）

```
Skill(team-pd) with task_description, profile, resolved_mode
```

产出：`PRD.md`（用户故事 / 验收标准 / 边界情况）+ `DESIGN.md`（交互流程 / 数据流向）。

**degraded fallback**：`team-pd` 未装 → 警告"team-pd skill 不可用，使用通用需求总结"，继续。

## Stage 1：架构审查（team-architect）

```
Skill(team-architect) with PRD.md, DESIGN.md
```

产出：ADR（如果涉及架构决策）→ 写 `docs/memory/decisions/harness_<date>_<slug>.md`（frontmatter schema 见 spec §6.2）。

## Stage 2：规划（superpowers:writing-plans）

```
Skill(superpowers:writing-plans) with spec file
```

产出：`docs/superpowers/plans/round-N.md`（bite-sized step TDD）。

## Stage 3：实现（subagent-driven）

```
Skill(superpowers:subagent-driven-development) with plan file
```

- 核心模块 → `team-senior-dev` subagent
- CRUD 模块 → `team-junior-dev` subagent（可并行）

每 Task 走 TDD：写测试 → FAIL → 实现 → PASS → commit。

## Stage 4：Spec 审查（strict-reviewer，Step 5 知识合规）

```
Skill(strict-reviewer) with review_target = {
  changed_files, diff_summary,
  stage: "spec",
  relevant_knowledge_files,
  knowledge_snapshot_id,
  knowledge_requirements,
  retrieval_outcome,
  known_issues
}
```

FAIL → 自动修复最多 2 轮；连续 FAIL → 升级用户。

## Stage 5：质量审查（codex + code-reviewer）

跨模型审查（`codex:rescue` + `superpowers:receiving-code-review`）。CRITICAL 自动修复最多 3 轮。

## Stage 6：QA 测试（team-qa）

```
Skill(team-qa) with profile, changed_files
```

P0 bug 自动修复。前端任务自动调 `gstack` 浏览器自动化。

## Stage 7：安全审查（team-security）

```
Skill(team-security) with diff, profile
```

company-mt profile 强制启用。发现漏洞自动修复。

## Stage 8：收尾

- 更新 `.harness/current.json`（currentFeature → null，currentStage → null）
- 追加 `docs/memory/cases/` 若 errors_collection 阈值达成
- 写 learnings 三文件 observation
- `git commit`（按 profile hard_floor 决定是否 push）
- claude-mem observation 记录本 Round

## 硬限制

- Stage -0.5 若 `knowledge_requirements` 非空但 Stage 4 未核查 → FAIL
- Stage 8 `auto_push` 在 `hard_floor` 里 → 禁止自动 push（即使用户加 `/yolo`，profile-entry 已经剔除）
- 连续 10 Round 未 PASS Stage 4 → 停下反思（参照 2026-04-22 iteration-log 的 Round 节奏）

## 参考

- 原 8-Stage 全文 + prompt 模板：`harness-workflow/archive/pre-reshape-backup.md:236-320`
- prompts/: 原 `harness-workflow/prompts/` 下的 pd/architect/qa/security prompt 模板仍由本 skill 共用
- review_target schema：`harness-workflow-cli/resources/schemas/review-target.schema.json`
