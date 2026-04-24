---
name: harness-bugfix
description: >
  Bug 修复专用流程（M 级）。五步 TDD：investigate → reproduce → fix → regression test → commit。
  Step 1 通过 Skill(investigate) 复用系统调试方法论，不重写。
  Step 5 按 errors_collection 阈值决定是否写 docs/memory/cases/。
  **不对外公开触发词** —— 由 profile-entry 的 `--fix` flag 或 bug 语义识别路由到此。
  使用场景：bug 报告、回归、诊断类任务。
  触发命令：（无公开触发词；profile-entry 路由）
---

# harness-bugfix — Bug 修复五步 TDD

> 由 profile-entry 路由（显式 `--fix` flag 或 bug 语义识别）。
> Source: 原 harness-workflow v0 的 M 级 Stage 集 + investigate skill 方法论。

## 输入契约（来自 profile-entry）

`resolved_profile` / `resolved_mode` / `task_description` / `hard_floor`。

## 五步流程

1. **Investigate** — `Skill(investigate)` 调试方法论（含 company-mt Java profile_hints）
2. **Reproduce** — 写失败测试（**硬要求**：必须 FAIL 才进 Step 3）
3. **Fix** — 最小侵入，只让 Step 2 测试 PASS
4. **Regression** — 全量测试 + `harness doctor`，都 PASS 才算 fix
5. **Commit + Case entry**（满足 errors_collection.min_criteria 阈值才写 case）

**每步详细契约 + degraded fallback + 升级条件** → [references/five-step-tdd.md](references/five-step-tdd.md)

## 连续失败升级

- Step 2 测试 PASS 但 Step 4 全量 FAIL → 回 Step 3 最多 2 轮
- 连续 3 次 Step 3 让全量更糟 → **升级到 harness-feature**（整体重新设计，本 bugfix Round 废弃）

## 硬边界

- Step 2 测试必须 FAIL 才能进 Step 3（TDD 顺序不可颠倒）
- Step 3 修复范围 ≤ Step 2 测试覆盖的代码路径（不重构、不扩展）
- 不自己写调试方法论（Step 1 必须 invoke `Skill(investigate)`，缺失时显式 degraded）
- 不写 manifest（docs/harness/knowledge/* 只有 harness scan 能写）
- 不自作主张写 case（errors_collection 阈值未达成只写 learnings）

## 与其他 skill 的关系

- `investigate` — Step 1 复用（独立 skill，非本 skill 嵌入）
- `strict-reviewer` — Step 4 fix diff 过一次 `stage: "quality"` 审稿
- `harness-common` — 读 `.harness/current.json` / 写 `.harness/learnings/`
- `harness-feature` — Round 升级（连续失败时）

## 引用

- Case frontmatter schema：`harness-common/references/memory-layers.md`
- errors_collection 阈值配置：`docs/memory/.harness-memory.yml`
- 原 M 级 Stage 定义：`harness-workflow/archive/pre-reshape-backup.md`
