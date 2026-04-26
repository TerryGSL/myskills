---
name: profile-entry
description: >
  Harness 工作流的 Tier-3 fallback 路由器。仅在无 node / `harness route` CLI
  不可用时由 leaf SKILL 间接 invoke，手算等价 route object。Tier 1+2 主路径
  直接走 `harness route --json`，**不加载本 SKILL**。
  使用场景：环境无 node、harness-workflow-cli 未装、需手动调试 routing 决策时。
  触发命令：（无公开触发词；仅 Tier-3 fallback 内部 invoke）
---

# profile-entry — Tier-3 Fallback 路由器

> **Tier 1+2（有 CLI）**：用 `harness route --task "<msg>" --flags "<flags>" --json` 直接拿 route object（8 字段），**不需要加载本 SKILL**。leaf SKILL 由 wrapper kernel 直接调用。
> **Tier 3（无 node）**：本 SKILL 由 AI 手算等价 route object，输出供 leaf SKILL 消费。
>
> 完整 routing 契约（7 条 kernel + 4 步 fallback 算法 + 字段语义） →
> [`harness-common/contracts/routing.md`](../harness-common/contracts/routing.md)

## 何时加载本 SKILL

仅在以下三种场景：

1. 环境没有 node / npm（无法执行 CLI）
2. `harness route` 命令缺失（harness-workflow-cli 未装或装坏）
3. 需要手动调试 routing 逻辑（开发期排查决策路径）

**Tier 1+2（默认路径）不加载本 SKILL** —— 直接调 CLI 即可。误加载会浪费 ~30-40% context。

## Tier 3 手算流程（5 步紧凑摘要）

按以下决策顺序产出等价 route object（与 CLI 输出 schema 一致 → `route-output.schema.json`）。

### Step 1 — Profile 解析

按以下顺序确定 `resolved_profile`：

1. 显式 `forced_profile`（调用方传入）
2. `<repo>/.harness-profile` marker（YAML 单行 / 多字段）
3. fallback matchers：加载 `~/.claude/profiles/*.yml` + `<repo>/.harness-profiles/*.yml`，按 `detection.priority` 降序，按 specificity 决胜
4. `default` 兜底（priority=0，always 匹配）

详 → [`harness-common/contracts/profile.md`](../harness-common/contracts/profile.md)

### Step 2 — 结构性 Fast-Path 检查

确定性（非 LLM）—— 基于 `git diff --stat HEAD` + `git status --short`：

- 无 task 类型 flag
- 仅 1 文件改动（staged + unstaged）
- diff < 10 行
- 无新文件（无 `??` 行）
- 命中 fast-path allowlist

全通过 → `fast_path_hit = true` 且 `task_type = quick`；任一不过 → `fast_path_hit = false`，进 Step 3。

### Step 3 — 任务类型解析

优先级（先命中者胜）：

1. fast-path 命中 → `quick`
2. 显式 flag：`/quick` → quick / `/fix` → bugfix / `/refactor` → refactor
3. profile.task_types 默认（无声明则 `feature`）

`leaf_skill = harness-<task_type>`。

### Step 4 — Aggression Mode 解析

优先级：`profile.hard_floor > 调用 flag > profile.default_mode > standard`

- `/safe` → conservative；`/yolo` → aggressive
- hard_floor 命中 → 必须公告 `Requested: <flag> / Effective: <mode> / Reason: hard-floor`，不静默降级

### Step 5 — Knowledge Retrieval + Render

跑 Stage -0.5 流程产出 `knowledge_manifest`（8 字段 KnowledgeCheck），render 出 `context_to_inject`（markdown 字符串：Binding Rules + Advisory Context）。

详 → [`harness-common/contracts/knowledge.md`](../harness-common/contracts/knowledge.md)

## 输出契约（与 CLI 等价）

按 [`route-output.schema.json`](../packages/harness-cli/resources/schemas/route-output.schema.json) 输出 8 字段 JSON：

```json
{
  "leaf_skill": "harness-feature",
  "resolved_profile": "harness",
  "resolved_mode": "standard",
  "task_description": "<user message verbatim>",
  "hard_floor": ["auto_push", "force_push"],
  "knowledge_manifest": { /* 8-field */ },
  "fast_path_hit": false,
  "context_to_inject": "<markdown>"
}
```

把此 object 传给 `Skill(<leaf_skill>)`，leaf 启动时把 `context_to_inject` prepend 到第一个 subagent 的 task prompt。

## 硬边界

- 不写代码、不改文件
- 不做 LLM 语义任务分类（fast-path 是确定性 diff 检查）
- 不持久化跨 turn 状态（stateless 重算）
- 不对外公开触发词
- 不在 Tier 1+2 路径加载（Tier 1+2 走 CLI）

## Cross-Pack Task-Type 契约

任何第三方 skill pack 替代官方 `harness-{quick,bugfix,feature,refactor}` sub-skill 时，必须遵守 task-type 输入/输出契约（hard_floor 严守、mode echo、标准 I/O schema）。

完整契约 → [references/task-type-contract.md](references/task-type-contract.md)（Step 6 Sub-skill Invocation 时 leaf 必须遵循；profile-entry 路由后该 leaf 承担完整执行责任）

## 引用

- 完整 routing 契约：[`harness-common/contracts/routing.md`](../harness-common/contracts/routing.md)
- Cross-pack task-type 契约（leaf sub-skill 必读）：[references/task-type-contract.md](references/task-type-contract.md)
- profile / fast-path / aggression / hard-floor / knowledge 各分契约：`harness-common/contracts/{profile,task-type,aggression-mode,hard-floor-enforcement,knowledge}.md`
- CLI 实现：`packages/harness-cli/src/commands/route.ts`
- Schema：`packages/harness-cli/resources/schemas/route-output.schema.json`
- Spec：`docs/superpowers/specs/2026-04-26-unified-fusion-design.md` §Routing-as-CLI / Canonical fallback
