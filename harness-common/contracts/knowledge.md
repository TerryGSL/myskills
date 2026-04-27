# Knowledge — 5-Domain Scanner + Stage -0.5 Retrieval

> **Source of truth**: `packages/harness-cli/resources/schemas/knowledge.schema.json` (manifest/evidence/gaps) + `resources/schemas/knowledgeCheck.schema.json` (8-field 状态对象)。如本文档与代码不一致，以代码为准。

合并自 A 套 `knowledge-retrieval.md` + `project-scanner.md`。本契约规范"知识如何产生（scanner）"和"知识如何注入运行时（retrieval）"两个互补侧。

## Knowledge vs Memory 分工

| 维度 | knowledge | memory |
|------|----------|--------|
| 时机 | 接入时一次性扫描 | 开发过程逐轮积累 |
| 内容 | 代码 idiom / 内部组件 / SDK 用法 | bug cases / 架构决策 / 遗留约束 |
| 位置 | `docs/harness/knowledge/<domain>/` | `docs/memory/{cases,decisions,constraints}/` |
| 写入 | 仅 `harness scan` / `harness scan --apply-answers` | 见 [memory.md](memory.md) 矩阵 |

两者**不混用**，不可合并注入通道。Stage -0.5 先读 knowledge（静态 inventory），Stage 3 再读 memory ERRORS（动态教训）。

## Scanner Pipeline（5 个 Phase）

`harness scan` / `harness scan --rescan` / `harness scan --partial-rescan <domain>` / `harness scan --apply-answers` 的 5-Phase Pipeline：

| Phase | 执行者 | 时间 | 产出 |
|-------|-------|------|------|
| 1. Scout | 主 coordinator 自跑 | 8 min | `.harness-status.json.scoutReport` |
| 2. Parallel Domain Scan | N subagent 并行（max 5） | 12 min | manifest-draft.md / evidence-draft.md |
| 3. Codex Contradiction Pass | Codex CLI 跨模型审查 | 5 min | codex-contradictions.md |
| 4. TODO Aggregation | 主 coordinator | 3 min | TODO.md（≤ 8 条） |
| 5. User Batch Answer | 用户异步 | — | INDEX.md / manifest.md / evidence.md / gaps.md |

**总耗时 ≤ 28 min**（不含 Phase 5 用户填写）。`--partial-rescan` ≤ 10 min，TODO 上限 3 条。

Phase 2 Parallel Domain Scan 派发 N 个 subagent 时使用的 5-domain prompt 模板（公共前缀 + 各 domain 专属段） → [`harness-feature/prompts/scanner-prompts.md`](../../harness-feature/prompts/scanner-prompts.md)

### Scan Budget 硬上限

| 约束项 | 上限 |
|--------|------|
| 总 wall-clock | 28 min |
| 每 domain full file read | 24 文件 |
| 用户 TODO 总数 | 8 条 |
| 单 manifest.md | 140 行 |
| 单 evidence.md | 220 行 |
| 最大激活 domain 数 | 5 个 |

manifest 超 140 行 → 按 confidence + 影响范围挤掉 low-priority rule。

## 5-Domain 模型

> **2026-04-28 更新**：spec 1 设计的 5-domain 模型仍是 scanner subagent 的内部
> 探测维度，但用户反馈"init 别预塞特定 domain placeholder"已落实：
>   - `harness init` **不再**预创建任何 domain 子目录（仅创建 `_example/` 通用骨架）
>   - `harness scan --json` 在 detector 无证据时**不再**返回空 domain placeholder
>   - 用户跑 scan 后 manifest 只含真实有 evidence 的 domain
>
> 下面表格描述的是 **scanner subagent 探测时的内部维度**（spec 1 设计），不是
> init 时预塞的目录列表。后续 spec 1 v2 可能重写为"动态 domain detection"。

| Domain | 触发激活 | 内容 |
|--------|---------|------|
| `style-and-structure` | **总是激活**（探测命名 / 模块）| 命名 / 模块组织 / 文件布局 |
| `internal-components` | **总是激活**（探测内部 wrapper）| 内部 wrapper / DI / helper |
| `exception-and-error-contracts` | 探测到异常体系 | 异常类型 / 错误码 / Result wrapper |
| `integrations-and-sdk-usage` | 探测到 SDK / HTTP client / Feign | timeout / retry / auth pattern |
| `i18n-and-text-boundaries` | 探测到 resource bundles | 文案外置 / locale 注入 |

固定激活 domain 不经 signal 探测；其余 3 个按 scout 信号决定。

> 注意：spec 1 这套 5-domain（business 维度）与 `packages/harness-cli/src/utils/
> knowledge-scanner.ts` 的 5 detector（`api / db / business-rules / config /
> deployment` 工程维度）**是两套不同的 5-domain**，spec 漂移待统一。

## Manifest / Evidence / Gaps 结构

```
docs/harness/knowledge/
├── INDEX.md                        ← 根索引（schema_version / snapshot_id / Domain Map / Routing Rules / User Overrides）
├── TODO.md                         ← 用户批量回答（≤ 8 条）
└── <domain>/
    ├── manifest.md   ≤ 140 行     ← 规则清单（rule block）
    ├── evidence.md   ≤ 220 行     ← file:line 证据
    └── gaps.md       条件生成      ← 用户 override + drift 标记
```

### Manifest Frontmatter（必填）

```yaml
---
domain: <name>
snapshot_id: "scan-YYYY-MM-DDTHH:MMZ"
applies_to:
  paths: ["glob/**"]
last_verified: YYYY-MM-DD
status: active | partial | drifted | superseded_by:<file>
---
```

### Manifest Rule Block（必填字段）

```markdown
**Rule ID**: <domain>/rule-<N>      # 必须，稳定 ID
**规则**: <描述>                      # 必须
**适用**: <path glob>                 # 必须
**Evidence**: evidence.md#<anchor>   # 必须，anchor 必须存在
**Confidence**: high                  # 必须（manifest 不收 medium / low）
**Status**: active | expired | drifted | superseded  # 必须
**violation_test**: <enum>            # 必须
```

`violation_test` 7 个枚举：`must_use_wrapper` / `must_call_component` / `must_not_throw_raw_exception` / `must_use_package` / `must_not_use_pattern` / `must_annotate_with` / `free_form_review`。前 6 个有结构化配套字段，`free_form_review` 必须带 `manual_review_reason` + `expiry_after_days`。

## Stage -0.5 Retrieval（运行时注入）

每个 round 的 Stage 0 之前，从目标项目 `docs/harness/knowledge/` 读取扫描产物。**所有级别的 round 都不跳过**，包括 S 级。

### Step 0: Disable Check

读 `CLAUDE.md` 的 `<!-- harness-knowledge:start --> ... <!-- harness-knowledge:end -->` 块。若含 `harness-knowledge: disabled` → 设 `effective_index_status = disabled`，写 `.harness-status.json.knowledgeCheck`，**跳过 Step 1-6**。

### Step 1: INDEX 存在性检查

`docs/harness/knowledge/INDEX.md` 不存在 → 跳过 Stage -0.5 全部步骤（项目未接入 knowledge）。

### Step 2: Routing 匹配

读 INDEX `## Retrieval Routing Rules`：

- 若 `changed_files` 已知 → path glob 匹配
- 若只有需求文本 → keyword 匹配
- always-load：`style-and-structure` + `internal-components`

### Step 3: 加载 Manifest

只读 manifest，不读 evidence（evidence 是 audit 用，不是运行时上下文）。解析每条 rule 的 ID / Status / violation_test / 描述 / applies_to。

### Step 4: Render Pipeline（不许 raw 注入）

按 per-rule Status 过滤：

| Status | 渲染到 | reviewer 行为 |
|--------|-------|--------------|
| `active` | Binding Rules view | 违反 → FAIL |
| `expired` | Advisory Context view | 不 FAIL |
| `drifted` / `superseded` | 不进任何 view，记 knownIssue | 不触发 |

### Step 4a: Advisory Knowledge

从 INDEX `## User Overrides` + `## Expired Free-Form Rules` 加载，写入 `knowledgeCheck.advisory_knowledge`。**不进 `knowledge_requirements`**（reviewer 不 FAIL 依据）。

### Step 5: 写 `.harness-status.json.knowledgeCheck`（8 字段）

```json
{
  "effective_index_status": "active|stale|drifted|disabled",
  "snapshot_id": "scan-YYYY-MM-DDTHH:MMZ" | null,
  "retrieval_outcome": "success|coordinator_miss|all_candidates_filtered",
  "filtered_candidates": [...],
  "known_issues": [...],
  "advisory_knowledge": [...],
  "knowledge_requirements": [...],
  "relevant_knowledge_files": ["docs/harness/knowledge/<domain>/manifest.md", ...]
}
```

`knowledge_requirements` 每条含：`rule_id` / `manifest_file` / `applies_to` / `requirement_text` / `violation_test` + 配套字段。

### Step 6: 注入 Task Prompt

把 Render Pipeline 的两个 view（Binding Rules + Advisory Context）prepend 到 Stage 2/3 subagent task prompt 开头。注入硬契约：

1. Binding Rules 必须严格遵循，违反 → reviewer FAIL
2. Advisory Context 作为风格参考
3. Binding Rule 与需求冲突 → 停下上报
4. echo 一行 "Knowledge check:" 证明消化
5. 对每条 Binding Rule 给出遵循证据（file:line / test:case）

## Stage 4 入口门 + Late Recovery

详见 [reviewer-gates.md](reviewer-gates.md) 第 4 硬门。Stage 4 发现实际 diff 涉及未召回的 manifest → 自动补救 1 次：用 `git diff` 重跑路径匹配，更新 `knowledge_requirements`，dispatch remediation task 给 Stage 3。

## Empty Retrieval 路由表

| effective_index_status | retrieval_outcome | 动作 |
|------------------------|-------------------|------|
| `disabled` | — | 跳过 knowledge gate |
| 其它 | `coordinator_miss` | BLOCKED（系统错误）|
| 其它 | `all_candidates_filtered` | 不 BLOCK；记 known_issue；warn `--partial-rescan` |
| 其它 | `success` 且 `relevant_knowledge_files = []` | 不 BLOCK（任务不命中任何 domain）|

## 反向反馈闭环

reviewer 发现"代码违反 manifest Rule" → 产 finding，**不自动更新 manifest**。manifest 更新必须走 scanner（`--partial-rescan <domain>`）。任何绕过 scanner 直接修改 manifest 的行为违反 evidence-first 契约。

## 实现位置

- Schema：`packages/harness-cli/resources/schemas/knowledge.schema.json` + `knowledgeCheck.schema.json`
- Scanner 实现：`packages/harness-cli/src/commands/scan.ts`（计划中）
- Retrieval 实现：integrated to `harness route --json`（route-output.knowledge_manifest 字段）
- 与 strict-reviewer 接口：见 [reviewer-gates.md](reviewer-gates.md) 第 4 硬门
