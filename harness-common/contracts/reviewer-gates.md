# Reviewer Gates — 4 硬门 + Strict Reviewer 调用协议

> **Source of truth**: `packages/harness-cli/resources/schemas/reviewer-gates.schema.json` + `review-target.schema.json`。如本文档与代码不一致，以代码为准。

定义所有 leaf skill（quick / bugfix / feature / refactor）调用 strict-reviewer 的 4 硬门 + 完整调用协议。**任何 caller 在构造 `review_target` 前必须读完本契约。**

## 4 硬门（违反 → FAIL）

每条都是一票否决，不可绕过。

| # | 硬门 | 触发条件 | Verdict |
|---|------|---------|---------|
| 1 | **Grounding** | 任一 claim 无 diff / 代码根据 | FAIL |
| 2 | **Reproduction** | 缺陷未被测试覆盖（security / qa stage） | FAIL |
| 3 | **Coverage** | 变更范围超出声明范围 | FAIL |
| 4 | **Knowledge Compliance** | 任一 `knowledge_requirements` 被违反 | FAIL |

## `review_target` Schema（必填）

```yaml
review_target:
  # === 基础字段（每轮必填）===
  changed_files: []                           # list[str]
  diff_summary: "..."                         # str，≤300 词
  stage: "qa | security | spec | quality"     # enum
  claims_to_verify: []                        # list（从 PRD/任务描述提取）
  memory_cases: []                            # list（从 docs/memory/ERRORS.md 检索）
  prior_verdict: null                         # 上轮 verdict 或 null

  # === Knowledge 字段（Stage -0.5 填，从 .harness-status.json.knowledgeCheck 复制）===
  # disabled 或 INDEX.md 不存在 → 5 字段全 null

  knowledge_snapshot_id: null                 # str | null
  relevant_knowledge_files: null              # list | null
  knowledge_requirements: null                # list | null
  retrieval_outcome: null                     # success|coordinator_miss|all_candidates_filtered | null
  known_issues: null                          # list | null
```

详见 [knowledge.md](knowledge.md) 第 8 字段 knowledgeCheck。

### Coordinator 字段映射

caller 在构造 `review_target` 时必须填充 Knowledge 字段（来自 `.harness-status.json.knowledgeCheck`）：

| `review_target` 字段 | 来源 |
|----------------------|-----|
| `knowledge_snapshot_id` | `knowledgeCheck.snapshot_id` |
| `relevant_knowledge_files` | `knowledgeCheck.relevant_knowledge_files` |
| `knowledge_requirements` | `knowledgeCheck.knowledge_requirements` |
| `retrieval_outcome` | `knowledgeCheck.retrieval_outcome` |
| `known_issues` | `knowledgeCheck.known_issues` |

### 合法 null 情形

- `effective_index_status == "disabled"`
- INDEX.md 不存在
- Stage -0.5 因故未跑（额外要在 scorecard 记 skip reason）

### 禁止 null 绕过

- INDEX.md 存在 + status active/stale/drifted 且 Stage -0.5 已正常跑 → 5 字段必须全填
- Late Recovery 完成后 → 全部刷新

## Knowledge Compliance Check 检查方式

第 4 硬门触发条件：`knowledge_requirements` 非 null 且非空。对每条 rule：

1. 读对应 `manifest_file`，确认 Rule 存在且 `Status: active`
2. 读 `diff_summary` + `changed_files`，验证是否遵循 `requirement_text`
3. 按 `violation_test` 类型检查：

| `violation_test` | 检查方式 |
|------------------|---------|
| `must_use_wrapper` | 返回类型是否含 `wrapper_type` |
| `must_call_component` | 是否调用 `component` 类路径 |
| `must_not_throw_raw_exception` | 是否抛 `exception_types` 中的裸异常 |
| `must_use_package` | 是否 import/调用 `package` 前缀 |
| `must_not_use_pattern` | 是否出现 `pattern` 正则匹配 |
| `must_annotate_with` | 是否带 `annotation` |
| `free_form_review` | LLM 判断 + `manual_review_reason` |

4. 违反 → finding `{severity: high, message: "violated knowledge rule: <rule_id>", evidence: "<file:line>"}`

## Retrieval Outcome 路由表

| 条件 | Verdict |
|------|---------|
| 任一 `knowledge_requirement` 被违反 | **FAIL**（第 4 硬门） |
| `retrieval_outcome == "coordinator_miss"` | **BLOCKED** |
| `retrieval_outcome == "all_candidates_filtered"` | 不 BLOCK；走三硬门；scorecard 记 known_issue；warn `--partial-rescan` |
| `retrieval_outcome == "success"` 且 `relevant_knowledge_files == []` | 正常进三硬门 |
| `knowledge_requirements` null/空 | 跳过第 4 硬门 |

## Invocation Protocol（5 步）

### Step 1: 构造 review_target

由 coordinator（leaf skill）从 git diff、PRD、`.harness-status.json` 等收集字段。

### Step 2: 调用 strict-reviewer

```
Skill(strict-reviewer) 输入：YAML review_target
```

调用前检查：`.harness-status.json` 存在 + `review_target` schema 无空缺必填字段。

### Step 3: YAML 解析 verdict

输出格式：

```yaml
verdict: PASS | FAIL | BLOCKED
findings: []                       # 每条 {severity, message, evidence}
scorecard_delta: {}
known_issues_logged: <count>
```

非合法 YAML → 重试一次；二次失败 → BLOCKED，原因 `reviewer_output_parse_error`。

### Step 4: Verdict 路由

| Verdict | 动作 |
|---------|------|
| **PASS** | 继续后续 stage |
| **FAIL** | 返回 Stage 3 修复（同一 round 最多 2 retry；第 3 次 FAIL → BLOCKED 升级用户）|
| **BLOCKED** | 立即暂停，输出原因，等待用户；禁止自动降级 |

aggression mode 倍数见 [aggression-mode.md](aggression-mode.md)。

### Step 5: Scorecard Persist

无论 verdict 如何，写入 `docs/memory/harness_reviewer_scorecard.yml`：

```yaml
- timestamp: <ISO>
  stage: <stage>
  verdict: <verdict>
  findings_count: <int>
  known_issues_count: <int>
  knowledge_snapshot_id: <id> | null
  retrieval_outcome: <enum> | null
```

## strict-reviewer 不可用时的降级

**关键契约：禁绕过硬门**。

| 场景 | 动作 |
|------|------|
| **harness 模式**（`.harness-status.json` 存在）| `verdict: BLOCKED`；**禁止降级到传统 prompt** |
| **独立使用**（无 `.harness-status.json`）| 可回退到 stage-specific prompt；记 `strict_reviewer_unavailable_fallback` |
| **用户明示一次性降级** | 仅本次降级；scorecard 记 known_issue |
| **autonomous_mode** | 永远 BLOCKED；禁止降级；禁止自动重试 |

### BLOCKED 输出格式

```
[BLOCKED] strict-reviewer 不可用
  场景：harness 模式（.harness-status.json 存在）
  原因：<具体原因>
  禁止：降级到传统 QA/security prompt
  等待：用户指示
```

## known_issues 处理

`known_issues` 是诊断信息，**不直接影响 verdict 方向**：

- 全部写入 scorecard（`knownIssue` 字段）
- reviewer 输出摘要，列出 drifted / superseded / filtered 条目
- 若非空 → reviewer 最终输出包含：`"Known issues noted: <count> items logged to scorecard"`

## 字段合法性速查

| 字段 | 类型 | null 合法 | 空列表合法 |
|------|------|----------|----------|
| `changed_files` | list[str] | 否 | 是（no-op round）|
| `diff_summary` | str | 否 | 否 |
| `stage` | enum | 否 | — |
| `claims_to_verify` | list | 否 | 是 |
| `memory_cases` | list | 否 | 是 |
| `prior_verdict` | object\|null | 是 | — |
| `knowledge_snapshot_id` | str\|null | 是 | — |
| `relevant_knowledge_files` | list\|null | 是 | 是 |
| `knowledge_requirements` | list\|null | 是 | 是 |
| `retrieval_outcome` | enum\|null | 是 | — |
| `known_issues` | list\|null | 是 | 是 |

## 常见错误处理

| 错误 | 处理 |
|------|------|
| `knowledge_snapshot_id` 有值但 `relevant_knowledge_files` null | coordinator_miss → BLOCKED |
| `violation_test` 字段缺失 | 当作 `free_form_review` 处理 |
| `known_issues` 非 list | YAML parse 阶段 → BLOCKED schema_error |
| `retrieval_outcome` 不在枚举范围 | 当作 `coordinator_miss`（保守）|
| `stage` 不在枚举范围 | BLOCKED invalid_stage |

## 实现位置

- Schema：`packages/harness-cli/resources/schemas/reviewer-gates.schema.json` + `review-target.schema.json`
- strict-reviewer SKILL：`strict-reviewer/SKILL.md`（共享）
- Stage -0.5 字段产出：见 [knowledge.md](knowledge.md)
- memory_cases 检索协议：见 [memory.md](memory.md) Runtime 查询
