# Memory — 三层写入权限矩阵 + 项目级文件契约

> **Source of truth**: `packages/harness-cli/src/types/constants.ts` + `resources/schemas/memory.schema.json`。如本文档与代码不一致，以代码为准。

合并自 A 套 `memory-layers.md` + `memory-contract.md`。本契约定义"项目长期记忆"在 harness 体系中的物理形态、写入权限、retention 与归档规则。

## 三类记忆分工

harness 管"项目长期记忆"（跟随 repo / git 追踪 / 团队共享）；其它两类由各工具 wrapper 自行处理：

| 记忆类型 | 范围 | 跟随什么 | 角色 |
|---------|------|---------|------|
| **工具自带 cross-session memory（claude-mem / codex resume / cursor history）** | 用户级 | 工具账户 | **Layer 0：本会话首次接活前必读** |
| **`docs/memory/*`（本契约）** | 项目级 | repo（git tracked）| Layer 1：跨工具共享真相源 |
| 用户偏好 / 工作流规则 | 用户级 | 工具账户 | Layer 0.5：长期偏好 |

### Layer 0 强制（claude-mem 本会话必读）

`docs/memory/*` 是 git 跟踪的**长期**真相源；但**短期 / 单工具 / 跨会话**的实际决策、踩坑、用户纠正 90% 沉淀在 claude-mem observation 数据库（用户级、跨会话、向量检索）。**任何叶子 skill（quick / bugfix / feature / refactor）在本会话首次接活前必须**：

1. `mcp__plugin_claude-mem_mcp-search__search(query=<task 关键词>, project=<本仓库名>, limit=20)` — 拿索引
2. 命中 ≥1 条相关 observation → `get_observations([IDs])` 取详情
3. 在 task 实施前输出一行 `Mem-check: hits=<n>, ids=[...]`（无命中输出 `Mem-check: 0 hits`）

**违反 → strict-reviewer FAIL**（grounded by "skipped Layer 0 cross-session memory"）。

不跨工具可见的事实保留：claude-mem 数据库不进 git、Codex/Cursor 看不见；所以**Layer 0 命中后若是项目长期共享知识**，必须升格到 Layer 1（`docs/memory/cases/` 或 `docs/memory/decisions/`），否则下次换工具协作仍然失忆。

## 三层结构概览

```
代码验证过程
    ↓
.harness/learnings/*                  ← 原始采集层（rolling inbox，未证实）
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
| `docs/harness/knowledge/<domain>/manifest.md` | **只** `harness scan` / `scan --apply-answers` | 扫描 pipeline 完成 | manifest schema（见 [knowledge.md](knowledge.md)） |
| `docs/harness/knowledge/<domain>/evidence.md` | **只** `harness scan` | 同上 | evidence schema |
| `docs/harness/knowledge/<domain>/gaps.md` | `harness scan` / `scan --apply-answers` | TODO 解析时 | gap schema |

**违反 → strict-reviewer 立即 FAIL**（grounded by "wrote to wrong memory layer"）。

## `.harness-memory.yml` Contract

项目级机器锚点（必须存在，由 `harness init` 或 `harness adopt` 创建）：

```yaml
schema_version: "1.0.0"             # required, semver

project:
  name: "<project-name>"
  type: "<framework>"
  root_fingerprint: "<file>:<key>=<value>"

owned_paths:                        # required — harness 可读写
  - "docs/memory/.harness-memory.yml"
  - "docs/memory/harness_reviewer_scorecard.yml"
  - "docs/memory/MEMORY.md"
  - "docs/memory/ERRORS.md"
  - "docs/memory/harness_*.md"
  - "docs/memory/cases/harness_*.md"
  - "docs/memory/decisions/harness_*.md"
  - "docs/memory/constraints/harness_*.md"
  - "docs/memory/archive/harness_*.md"
  - "docs/memory/archive/harness_*.yml"

forbidden_paths:                    # required — 绝对黑名单，胜过 owned_paths
  - "docs/memory/private/**"
  - "docs/memory/team-written/**"

errors_collection:                  # required
  min_criteria: 2
  criteria:
    - "diagnosis_over_30m"
    - "cross_module"
    - "repeated"
    - "platform_specific"
    - "user_visible"
    - "invalidated_assumption"

archive_policy:                     # required
  hot_index_max_lines: 200
  archive_after_days_unused: 180
  archive_if_status: ["superseded", "archived"]
  cold_dir: "docs/memory/archive"

reviewer:                           # required
  scorecard_path: "docs/memory/harness_reviewer_scorecard.yml"
```

### 硬约束

- `forbidden_paths` 必填，不能为空
- **禁止 broad unscoped 模式**：`owned_paths` 内任何不带 `harness_` 前缀且非显式文件的通配（如 `docs/memory/**`、`docs/memory/*.md`）→ BLOCKED
- 允许：具体文件 / `harness_` 前缀通配 / 显式 `harness/` 子目录
- **逃生门**：`allow_broad_owned_paths: true`（极少见，须人工确认；autonomous mode 拒绝加载）

## `docs/memory/` 物理形态

```
docs/memory/
├── .harness-memory.yml             ← contract（机器锚点）
├── MEMORY.md                       ← 人类导航主索引
├── ERRORS.md                       ← 错误案例总索引
├── harness_project_stack.md        ← 技术栈快照（harness 托管）
├── harness_reviewer_scorecard.yml  ← strict-reviewer 评分板
├── cases/
│   └── harness_<date>_<slug>.md   ← 每个 bug 一个 dated 文件
├── decisions/
│   └── harness_<date>_<slug>.md   ← 架构决策（Stage 2 产出）
├── constraints/
│   └── harness_<slug>.md          ← 遗留约束 / 业务限制
└── archive/
    └── harness_<date>_<slug>.md   ← superseded / 冷存档
```

### 前缀规则

- `harness_*` 前缀 = harness 托管，可覆盖更新
- 无前缀 = 用户手写，harness **只读**
- `archive/` 只存 superseded 或 >180 天未引用

### HTML Marker 协议

`MEMORY.md` 和 `ERRORS.md` 是人类主笔 + harness 补充的**共享**文件：

```markdown
<!-- harness-memory:start id="project-stack" schema="1.0.0" -->
- [Project Stack](harness_project_stack.md) — Next.js 15 + TypeScript + pnpm
<!-- harness-memory:end id="project-stack" -->
```

规则：`id` 必填且文件内唯一；不嵌套；用户在块内编辑 → 保留并记入 `audits.conflicts`；同 ID 块重复 → 保留第一个。

## Entry Schemas

### Layer C（learnings rolling inbox）

```md
## [LRN|ERR|FEAT-YYYYMMDD-XXX] category
**Logged**: <ISO-8601>
**Priority**: low | medium | high | critical
**Status**: pending | in_progress | resolved | wont_fix | promoted
**Area**: product | frontend | backend | infra | tests | docs | config | workflow
### Summary
### Details | Error | Requested Capability
### Suggested Action | Suggested Fix | Suggested Implementation
### Metadata
- Source: ...
- Stage: ...
- Related Files: <paths>
- Tags: <comma-separated>
- Pattern-Key: <optional, 用于去重 + 升格检测>
```

### Layer B：cases/ frontmatter

```yaml
---
id: <slug>
date: YYYY-MM-DD
module: <module-name>
status: active | suspect | archived | superseded
applies_to:
  paths: ["src/..."]
  symbols: ["ClassName", "functionName"]
  deps: [{ name: "pkg", range: "1.2.x" }]
criteria_met: [...]                 # 至少 2 项
freshness:
  state: active | suspect
  last_verified: YYYY-MM-DD
  last_used: YYYY-MM-DD
  suspect_since: YYYY-MM-DD | null
superseded_by: <other-case-id> | null
next_time_signal: [...]             # 未来 runtime 查询的 grep 关键词
---
## Symptom
## Root Cause
## Fix
## Negative Patterns                 ← 必须存在（内容可"（无）"）
## Future Check
```

`superseded_by` 必须 `relative/path.md#id` 格式，禁止自由文本。

### Layer B：decisions/ frontmatter

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

### Layer B：constraints/ frontmatter

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

## Runtime 查询协议（Stage 3 前置）

```
Stage 3 agent 修改任何文件前 MUST:
1. 读 docs/memory/ERRORS.md 索引
2. 按变更路径 token 查询 cases/（完整路径 / 模块名 / basename / 已知导出符号）
3. 加载 ≤ 5 个匹配 case 或 ≤ 3,000 tokens
4. 输出（强制）一行 "Memory check: ..."
```

**硬门**：没输出 "Memory check" 行 → BLOCKED 重做一次；二次缺失 → 升级用户。

## 实施后 diff 扫描（Stage 3 完成 → Stage 4 入口前）

防止 subagent 动了 plan 没预见到的文件：

- `git diff --name-only <baseSha>..HEAD`
- 对比 `.harness-status.json.memoryCheck.queriedFiles`
- 新增文件 → 重跑 ERRORS query；strong relevance 命中 → 生成 remediation task
- Stage 4 入口门：`queriedFiles` 必须包含最终 diff 里所有改动文件

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
- 连续 2 轮引用同 Pattern-Key 的 entry

**不自动升格** —— 需要人工判断 bug/ADR/constraint 类别。

## 归档与 last_used

- `freshness.last_used` 仅对 `harness_*` 前缀的 case 自动刷新（runtime query 命中时）
- 用户手写 case 命中事实记入 `.harness-status.json.memoryCheck.userCaseHits`，原文件不回写
- 归档触发：`archive_after_days_unused: 180` / `archive_if_status: [superseded, archived]` / `hot_index_max_lines: 200`

## 失败处理

| 场景 | 动作 |
|------|------|
| Contract 缺失 | `harness init` / `adopt` 时创建 |
| Schema 过老 | 运行 migration；否则 BLOCKED |
| Schema 过新 | **只读模式**，harness 不写任何 memory |
| YAML malformed | BLOCKED。**拒绝 auto-fix**（数据丢失陷阱） |
| Contract 与磁盘矛盾 | 只补齐 harness 托管的缺失文件；**绝不删除未知文件** |

## 实现位置

- Schema：`packages/harness-cli/resources/schemas/memory.schema.json`
- Memory tree 检查：`packages/harness-cli/src/utils/memory.ts`
- Learnings 实现：`packages/harness-cli/src/utils/learnings.ts`
- Runtime 查询协议接 reviewer：见 [reviewer-gates.md](reviewer-gates.md)
