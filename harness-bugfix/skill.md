---
name: harness-bugfix
description: >
  Bug 修复专用流程（M 级）。五步 TDD：investigate → reproduce → fix → regression test → commit。
  Step 1 通过 `Skill(investigate)` 复用系统调试方法论，不重写。
  **不对外公开触发词** —— 由 profile-entry 根据任务类型 flag（/fix）或显式路由到此。
  使用场景：bug 报告、回归、诊断类任务。
  触发命令：（无公开触发词；通过 profile-entry 路由）
---

# harness-bugfix — Bug 修复五步流程（v1）

> 由 `profile-entry` 路由到这里（显式 `--fix` flag 或 bug 语义识别）。
> Source: 原 harness-workflow v0 的 M 级 Stage 集 + investigate skill 方法论。

## 输入

由 profile-entry 传入 `resolved_profile` / `resolved_mode` / `task_description` / `hard_floor`。

## 五步流程

### Step 1：Investigate（调 `Skill(investigate)`）

**不自己重写调试方法论** — `investigate` skill 已经定义了 4 阶段结构化调试（根因调查 → 模式分析 → 假设验证 → 实现修复）+ 3 次假设失败自动停止升级。

invoke it：
```
Skill(investigate) with:
  task_description: <bug 描述>
  profile_hints: <如果 resolved_profile=company-mt，加 Java/MyBatis 定位提示>
```

**degraded fallback**：`investigate` skill 未安装（用户只装了 team-init + CLI）→ 显式警告"investigate skill 不可用，走通用调试（grep + read + 日志）"，继续但标记"degraded"。

### Step 2：Reproduce

写一个 **失败的** 测试（unit / integration / 手工 curl 都行），重现问题。
**硬要求**：测试必须 FAIL 才能进 Step 3。否则说明还没找到问题。

### Step 3：Fix

最小侵入修复。不重构、不扩展功能。仅让 Step 2 的测试通过。

### Step 4：Regression test

- 跑 Step 2 的测试 → 现在应该 PASS
- 跑全量测试 → 确认没 regress 其他功能
- `harness doctor` 检查 managed-files / memory 树无漂移

### Step 5：Commit + case entry

Commit message: `fix: <根因描述>`。

写一条 `docs/memory/cases/harness_<date>_<slug>.md`（满足 errors_collection.min_criteria = 2 时）：
- symptom（用户看到什么）
- root_cause（为什么）
- fix（怎么修的，file:line）
- negative_patterns（以后遇到什么模式要警觉）
- future_check（下次改类似代码时 checklist）

若 knowledge manifest 里有相关 rule → 在 case 里写明 `applies_to_knowledge: <rule_id>`。

## 硬限制

- Step 2 必须 FAIL 才能进 Step 3（TDD 顺序不能颠倒）
- Step 4 全量测试 FAIL → 退回 Step 3，最多 2 轮
- 连续 3 次修复都让全量失败更糟 → 升级到 harness-feature（整体重新设计）

## 与其他 skill 的关系

- `investigate`：Step 1 复用
- `strict-reviewer`：Step 4 fix diff 过一次审稿（`review_target.stage = "quality"`）
- `harness-common`：读 `.harness/current.json` 状态；Step 5 后可能写 learnings

## 参考

- investigate skill 全文：`investigate/skill.md`（已独立存在）
- 原 M 级 Stage 定义 + ERRORS case schema：`harness-workflow/archive/pre-reshape-backup.md`
- case frontmatter schema：`harness-workflow/references/memory.md`
