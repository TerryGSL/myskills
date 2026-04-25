---
name: profile-entry
description: >
  Harness 工作流的内部路由器。Single-Skill load 完成 profile 解析 + 结构化 fast-path +
  优先级裁决 + 加载 exactly ONE 叶子 skill（harness-{quick,bugfix,feature,refactor} 或
  company-{quick,bugfix,feature,refactor}）。**不对外公开触发词**，仅由 harness-workflow
  公开入口或 team-init 初始化后作为内部组件 invoke。
  使用场景：用户通过 /harness-workflow 触发代码任务时被自动调用；team-init 完成项目初始化后交棒。
  触发命令：（无公开触发词；仅通过 Skill(profile-entry) 内部 invoke）
---

# profile-entry — 内部路由器

> 内部 only skill。用户不应直接触发 `/profile-entry`；所有入口通过公开的 `/harness-workflow`。

## 输入契约

调用方（`harness-workflow` 或 `team-init`）传入：

| 字段 | 必填 | 说明 |
|------|------|------|
| `forced_profile` | 否 | 若设，跳过 profile detection 直接用 |
| `public_entrypoint` | 是 | 调用方名（日志用） |
| `requested_flags` | 是 | 解析后的 flag 数组（`["--yolo"]` / `["--quick"]` 等） |
| `cwd` | 是 | 当前项目路径 |
| `task_description` | 是 | 原用户请求文本 |

## 决策流程（5 步顺序，不可跳）

### Step 1：Profile 解析

按 `forced_profile` → `.harness-profile` marker → fallback matcher → `default` 兜底顺序。

**详细算法** → [references/profile-resolution.md](references/profile-resolution.md)

### Step 2：结构化 Fast-Path 检查（确定性，非 LLM 猜）

基于 `git diff --stat` + 文件 pattern 判断是否静默路由到 `harness-quick`。

全通过 → silent route（无提示、无用户确认）。
任一不过 → 走 Step 3。

**完整 allowlist + 排除规则** → [references/fast-path.md](references/fast-path.md)

### Step 3：任务类型解析

按优先级：

1. Fast-path 命中 → `quick`
2. 显式 flag（`--quick` / `--fix` / `--refactor`）
3. profile default（若 profile 无声明则默认 `feature`）

对应叶子 skill：`<profile>.task_types[<type>]`

| profile | quick | bugfix | feature | refactor |
|---------|-------|--------|---------|----------|
| personal（harness）| harness-quick | harness-bugfix | harness-feature | harness-refactor |
| company-mt | company-quick | company-bugfix | company-feature | company-refactor |

### Step 4：Aggression Mode 解析

优先级：`hard_floor > per-flag > profile default > conservative`

**完整契约 + hard-floor vs flag 冲突处理** → [references/precedence.md](references/precedence.md)

### Step 5：加载 exactly ONE 叶子 skill

```
Skill(<resolved_task_skill>) with:
  resolved_profile: <profile-object>
  resolved_mode: conservative | standard | aggressive
  task_description: <原用户请求>
  hard_floor: <profile 禁止动作清单>
```

**硬约束**：必须 invoke **恰好一个**叶子 skill。不得并行多个、不得跳过。

## Mode Echo Discipline

只在以下 4 种 transition 时 echo 一次 mode，其他保持静默：

1. Profile detection 首次
2. Flag override 生效
3. Fast-path 自动降级到 quick
4. Hard-floor vs flag 冲突（必须 echo，详见 precedence.md）

## 会话 schema 版本哨兵（AD4）

Step 1 前读 `<cwd>/.harness/current.json.workflow_schema_version`：

- 缺失 → 触发一次性 migration（写入 `"1.0.0"`）
- `> 1.0.0`（未来版本）→ 硬 abort + 提示 `npm install -g harness-workflow-cli@latest`

## 硬边界（Not In Scope）

以下**不是**本 skill 的职责，不要自己做：

- 不写任何代码
- 不做 LLM 语义任务分类（fast-path 是确定性 diff 检查）
- 不持久化会话状态（纯 stateless，每次调用独立）
- 不对外公开触发词
- 不在 myskills README 宣传

## 引用

- Profile schema 真源：`packages/harness-cli/src/types/profile.ts` + `resources/schemas/profile.schema.json`
- 实际 matcher 实现：`packages/harness-cli/src/utils/profile.ts` (`matchProfile`)
- 上游 spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md` §5.1 §6.5 附录 C
