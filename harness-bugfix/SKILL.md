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
> 核心方法论：Skill(investigate) 复用调试方法论 + TDD 五步纪律。

## 输入契约

本 SKILL 由 `harness route --json` 输出的 route object 驱动。route object 8 字段（spec §Routing-as-CLI）：

- `leaf_skill`: 必为 `harness-bugfix`
- `resolved_profile`: string
- `resolved_mode`: conservative | standard | aggressive
- `task_description`: string（原用户请求 verbatim）
- `hard_floor`: HARD_FLOOR_FLAGS 子集
- `knowledge_manifest`: KnowledgeCheck 8-field state object
- `fast_path_hit`: boolean
- `context_to_inject`: markdown 字符串（Binding Rules + Advisory Context；prepend 到第一个 subagent task prompt）

**Tier 1+2（默认）**：调用方通过 `harness route --json` 拿到 route object 直接 invoke 本 SKILL。
**Tier 3（无 node）**：CLI 不可用 → 由 `profile-entry` SKILL 手算等价 route object。

完整契约 → [`harness-common/contracts/routing.md`](../harness-common/contracts/routing.md)

## 五步流程

1. **Investigate** — `Skill(investigate)` 调试方法论（含 company-mt Java profile_hints）
2. **Reproduce** — 写失败测试（**硬要求**：必须 FAIL 才进 Step 3）
3. **Fix** — 最小侵入，只让 Step 2 测试 PASS
4. **Regression** — 全量测试 + `harness doctor`，都 PASS 才算 fix
5. **Commit + Case entry + Push 评估**（满足 errors_collection.min_criteria 阈值才写 case）
   commit 后调用 `harness push-check`；不可用时按 `harness-common/contracts/push-decision.md` 规则手算。
   Tier 3 fallback rules: see harness-init/SKILL.md#第二步

**每步详细契约 + degraded fallback + 升级条件** → [references/five-step-tdd.md](references/five-step-tdd.md)

## 连续失败升级

- Step 2 测试 PASS 但 Step 4 全量 FAIL → 回 Step 3 最多 2 轮
- 连续 3 次 Step 3 让全量更糟 → **升级到 harness-feature**（整体重新设计，本 bugfix Round 废弃）

## 失败回退闭环（rollback contract）

任何 Step 失败且 3 次内无法修复 → 强制走以下闭环：

1. `git diff --stat` 列出本 Step 改了哪些文件
2. `git checkout -- <files-this-step>` 回退本 Step 的修改（保留前面 Step 成果）
3. 写一条 `docs/memory/cases/<incident-bugfix-<date>>.md`：失败上下文 + 尝试方案 + 给后续 Round 的提示
4. 询问用户：是 spec 不准 / 还是改方案 / 还是放弃

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

## 引用（rule expansion 不在本 skill 内嵌）

### Cross-skill canonical contracts

- [`harness-common/contracts/memory.md`](../harness-common/contracts/memory.md) — case frontmatter schema + 三层权限
- [`harness-common/contracts/push-decision.md`](../harness-common/contracts/push-decision.md) — Step 5 push 决策
- [`harness-common/contracts/hard-floor-enforcement.md`](../harness-common/contracts/hard-floor-enforcement.md) — hard_floor 6 flags
- [`harness-common/contracts/reviewer-gates.md`](../harness-common/contracts/reviewer-gates.md) — Step 4 strict-reviewer 4 硬门
- [`harness-common/contracts/knowledge.md`](../harness-common/contracts/knowledge.md) — manifest 只读约束

### 其他

- errors_collection 阈值配置：`docs/memory/.harness-memory.yml`
- Workflow 详细契约：`harness-workflow/references/workflow.md`
