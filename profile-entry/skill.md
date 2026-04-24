---
name: profile-entry
description: >
  内部路由器。ONE Skill 加载，内部决策逻辑完成 profile 解析 / fast-path / 优先级，
  然后加载 exactly ONE 叶子 skill。**不对外公开触发词**，仅由 harness-workflow 和
  team-init 作为内部组件 invoke。
  使用场景：harness-workflow 转发代码任务到此；team-init 初始化后交棒到此。
  触发命令：（无公开触发词；仅通过 Skill(profile-entry) 内部调用）
---

# profile-entry — 内部路由器（v1）

> 这是 **内部 only** skill。用户不应该直接触发 `/profile-entry` —
> 所有入口通过 `harness-workflow` 公开触发词。

## 输入契约

调用方（`harness-workflow` 或 `team-init`）传入：

- `forced_profile`（optional）：若设，跳过 detection，直接用该 profile
- `public_entrypoint`：调用方名（仅用于日志）
- `requested_flags`：解析后的 flag 数组（如 `["--yolo"]`、`["--safe"]`、`["--quick"]`）
- `cwd`：当前项目路径

## 决策逻辑（按顺序）

### Step 1：Profile 解析

1. **`forced_profile` 存在** → 直接用
2. 读 `<cwd>/.harness-profile` marker（`harness-workflow-cli` 写的）→ 用 marker.profile
3. 都没有 → fallback matcher：读 `~/.claude/profiles/*.yml`，按 priority > specificity tie-break 选最高分
4. tie 或全 miss → 用 `default` profile（always-match, priority=0）

**校验**：resolved profile 必须在 `~/.claude/profiles/<name>.yml` 存在并通过 schema（harness-workflow-cli 的 profile.schema.json）。不在 → 硬 abort + 提示。

### Step 2：结构化 fast-path 检查（确定性，非 LLM 猜）

跑 `git diff --stat` 看本次任务涉及的 diff。若：

- 无 explicit task-type flag（`--quick` / `--fix` / `--refactor` 之一）**且**
- `git diff --stat` 显示 1 文件变动 **且**
- diff 行数 < 10 **且**
- 未新建文件 **且**
- target 文件匹配 fast-path allowlist：
  - 扩展名 ∈ `{.md, .txt, .json, .yml, .yaml}` **或**
  - source 文件 且 diff 不涉及：exported 符号、函数签名、类型定义、SQL schema、migration 文件、`package.json` / `go.mod` / `pyproject.toml` / `Cargo.toml` 依赖段

→ **silent route to `harness-quick`**（无显式提示，无需用户确认）。

否则 → 走 Step 3。

### Step 3：任务类型解析

按优先级：

1. fast-path 命中 → quick
2. `--quick` / `--fix` / `--refactor` 显式 flag
3. profile default（若 profile 无 default，用 `feature`）

→ 对应叶子 skill：`<profile>.task_types[type]`（personal = `harness-feature`，company-mt = `company-feature`，等等）

### Step 4：激进模式（Aggression Mode）解析

优先级硬规则：

```
profile hard_floor policy  >  per-invocation flag  >  profile default  >  built-in conservative
```

- `profile.hard_floor` 列出的动作 **永远禁止**，无法被 `/yolo` 绕过
  - 例：company-mt 的 `auto_push` 在 hard_floor 里 → `/yolo` 也不能让它自动 push
- 无冲突时：`/yolo` → aggressive；`/safe` → conservative；其他 → profile default

**Mode echo**：只在以下时机输出一次 mode：
- profile detection 首次
- flag override 生效
- fast-path 自动降级到 quick
- hard_floor 和 flag 冲突（显式报告 "Requested /yolo; Effective: company-safe; Reason: hard_floor auto_push"）

### Step 5：加载 exactly ONE 叶子 skill

用 `Skill(<resolved_task_skill>)` 调用，传入：
- `resolved_profile`
- `resolved_mode`
- `task_description`（原用户请求）
- `hard_floor`（profile 的禁止动作清单）

**硬约束**：必须 invoke 恰好一个叶子 skill。不得并行多个，不得跳过。

## 不做的事

- 不自己写代码
- 不做 LLM 语义任务分类（fast-path 是确定性 diff 检查，不是 LLM 猜）
- 不持久化会话状态（纯 stateless，每次调用独立）
- 不对外公开触发词
- 不在 myskills README 宣传

## 会话 schema 版本哨兵（与 harness-workflow 同步）

Step 1 前读 `<cwd>/.harness/current.json.workflow_schema_version`：
- 缺失 → 触发一次性 migration（写入 "1.0.0"）
- `> 1.0.0` → 硬 abort 提示升级 CLI（AD4 双向）

## 参考

- 上游 spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md` §6.5 + 附录 C
- Profile schema 真源：`harness-workflow-cli/resources/schemas/profile.schema.json`
- Fast-path 规则来源：spec 2026-04-24-profile-based-dispatch-redesign-design.md:91-111
