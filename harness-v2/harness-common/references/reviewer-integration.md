# Reviewer Integration — harness-common 与 strict-reviewer 调用协议

> **本文档权威路径**：`harness-v2/harness-common/references/reviewer-integration.md`
> **关联设计 spec**：
> - `harness-workflow/specs/2026-04-23-project-knowledge-scanner-design.md`
> - `docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md`
> **关联 references**：`memory-contract.md`（memory 单独通道）、`knowledge-retrieval.md`（Stage -0.5 产出字段）

---

## 概述

本文档规范所有 harness-* 子 skill（quick / bugfix / feature / refactor）在调用 `strict-reviewer` 时必须遵守的完整协议，包括：

1. `review_target` 完整 schema（含 5 个 knowledge 字段）
2. Coordinator 职责与字段来源映射
3. Verdict 决定规则（含第 4 硬门 Knowledge Compliance Check）
4. Invocation Protocol 5 步骤
5. strict-reviewer 不可用时的降级约定（关键契约，禁绕过硬门）

任何 caller 在构造 `review_target` 前**必须**完整阅读本文档。

---

## 1. `review_target` 完整 Schema

`review_target` 是传递给 `strict-reviewer` 的唯一结构化输入，YAML 格式。所有字段均为必填（允许 null）。

```yaml
review_target:
  # === 基础字段（每轮必填）===

  # 本轮变更文件列表（相对 repo 根的路径）
  changed_files: []

  # git diff 内容摘要（300 词以内；大 diff 截取关键段）
  diff_summary: "..."

  # 本轮 review 的阶段标识
  # 取值：qa | security | spec | quality
  stage: "qa | security | spec | quality"

  # 本轮需要 reviewer 主动验证的断言列表
  # 由 coordinator 从任务描述 / PRD 提取
  claims_to_verify: []

  # 从 docs/memory/ERRORS.md 检索到的相关历史错误案例
  # 见 memory-contract.md §Runtime 查询协议
  memory_cases: []

  # 上一轮 review 的 verdict（若存在）；初轮为 null
  prior_verdict: null   # 或 {verdict: "FAIL", findings: [...], scorecard_ref: "..."}

  # === Knowledge 字段（Stage -0.5 填，从 .harness-status.json.knowledgeCheck 复制）===
  # 若 effective_index_status == "disabled" 或 Stage -0.5 未跑，以下 5 字段全 null

  # Stage -0.5 生成的 snapshot_id（来自 INDEX.md）
  knowledge_snapshot_id: null    # 或 "scan-YYYY-MM-DDTHH:MMZ"

  # 本轮命中的 manifest 文件路径列表（严格限制为 docs/harness/knowledge/**/manifest.md）
  relevant_knowledge_files: null  # 或 ["docs/harness/knowledge/internal-components/manifest.md", ...]

  # 本轮需要 reviewer 验证的 knowledge rules（只含 Status: active 的 rule）
  # 每条 rule 结构：{rule_id, manifest_file, applies_to, requirement_text, violation_test, <violation_test 配套字段>}
  knowledge_requirements: null
  # 示例：
  # knowledge_requirements:
  #   - rule_id: "internal-components/rule-1"
  #     manifest_file: "docs/harness/knowledge/internal-components/manifest.md"
  #     applies_to: ["src/main/java/com/acme/core/service/**"]
  #     requirement_text: "业务层 service 必须返回 Result<T>，禁止抛 BusinessException"
  #     violation_test: "must_use_wrapper"
  #     wrapper_type: "Result"
  #   - rule_id: "exception-and-error-contracts/rule-3"
  #     manifest_file: "docs/harness/knowledge/exception-and-error-contracts/manifest.md"
  #     applies_to: ["src/main/java/**"]
  #     requirement_text: "不得直接 throw RuntimeException 裸类型"
  #     violation_test: "must_not_throw_raw_exception"
  #     exception_types: ["RuntimeException", "Exception"]

  # Stage -0.5 的 retrieval 结果标记
  # 取值：success | coordinator_miss | all_candidates_filtered
  retrieval_outcome: null

  # drifted / superseded / filtered_manifest 等已知问题（诊断用，不影响 verdict 方向）
  # 由 coordinator 从 knowledgeCheck.known_issues 复制
  known_issues: null
  # 示例：
  # known_issues:
  #   - source: "drifted_rule"
  #     id: "internal-components/rule-5"
  #     domain: "internal-components"
  #     reason: "violation rate 40%"
  #   - source: "filtered_manifest"
  #     id: "docs/harness/knowledge/i18n/manifest.md"
  #     domain: "i18n"
  #     reason: "no renderable active rules"
```

---

## 2. Coordinator 职责：Knowledge 字段来源映射

每个 caller（coordinator 角色，即调用 `strict-reviewer` 的 harness sub-skill）必须在构造 `review_target` 前完成 knowledge 字段的填充。

**字段来源一览表**：

| `review_target` 字段 | 来源字段（`.harness-status.json.knowledgeCheck`） |
|---|---|
| `knowledge_snapshot_id` | `knowledgeCheck.snapshot_id` |
| `relevant_knowledge_files` | `knowledgeCheck.relevant_knowledge_files` |
| `knowledge_requirements` | `knowledgeCheck.knowledge_requirements` |
| `retrieval_outcome` | `knowledgeCheck.retrieval_outcome` |
| `known_issues` | `knowledgeCheck.known_issues` |

**禁止 null 绕过的情形**（以下情形必须真实填充，而非用 null 敷衍）：

- `effective_index_status` 为 `active` / `stale` / `drifted`，且 Stage -0.5 已正常完成 → 5 字段均需复制
- Stage 4 Late Recovery 完成后 → 5 字段全部刷新（参见 knowledge-retrieval.md §Late Recovery）

**合法 null 情形**（以下情形 5 字段全 null）：

- `effective_index_status == "disabled"`（CLAUDE.md 内含 `harness-knowledge: disabled`）
- `docs/harness/knowledge/INDEX.md` 不存在（项目未接入 knowledge）
- Stage -0.5 因某种原因未跑（此时 coordinator 还需在 scorecard 记录 skip reason）

---

## 3. Verdict 决定规则

### 3.1 三硬门（原有）

| 硬门名称 | 触发条件 | Verdict |
|---|---|---|
| **Grounding** | 任一 claim 无 diff / 代码根据 | FAIL |
| **Reproduction** | 缺陷未被测试覆盖（security / qa stage）| FAIL |
| **Coverage** | 变更范围超出声明范围 | FAIL |

### 3.2 第 4 硬门：Knowledge Compliance Check（新增）

第 4 硬门与原三硬门平级，违反则 FAIL，不可绕过。

**触发前置条件**：`knowledge_requirements` 非 null 且非空列表。

**Review 步骤**：

对 `knowledge_requirements` 中每条 rule：
1. 读对应 `manifest_file` 确认 Rule 存在且 `Status: active`
2. 读 `diff_summary` + `changed_files` 内容，验证变更是否遵循 `requirement_text`
3. 按 `violation_test` 类型做针对性检查（见下表）
4. 发现违反 → `finding: {severity: "high", message: "violated knowledge rule: <rule_id>", evidence: "<file:line>"}`

**`violation_test` 检查方式**：

| `violation_test` 值 | 检查方式 |
|---|---|
| `must_use_wrapper` | diff 中返回类型是否含 `wrapper_type` |
| `must_call_component` | diff 中是否调用 `component` 类路径 |
| `must_not_throw_raw_exception` | diff 中是否抛出 `exception_types` 中的裸异常 |
| `must_use_package` | diff 中是否 import/调用 `package` 前缀 |
| `must_not_use_pattern` | diff 中是否出现 `pattern` 正则匹配 |
| `must_annotate_with` | diff 中新增类/方法是否带 `annotation` |
| `free_form_review` | 由 LLM 判断，参照 `requirement_text` + `manual_review_reason` |

### 3.3 Retrieval Outcome 路由规则

| 条件 | Verdict 影响 |
|---|---|
| 任一 `knowledge_requirement` 被违反 | **FAIL**（第 4 硬门） |
| `retrieval_outcome == "coordinator_miss"` | **BLOCKED**（coordinator 未跑 Stage -0.5 或状态丢失，系统错误） |
| `retrieval_outcome == "all_candidates_filtered"` | **不 BLOCK**；继续走三硬门 + adversarial；scorecard 记 `knownIssue: all_candidates_filtered`；warn "所有相关 manifest 不含可渲染 active rule，建议 `--partial-rescan`" |
| `retrieval_outcome == "success"` 且 `relevant_knowledge_files == []` | 正常进三硬门（本轮 changed_files 不命中任何 domain，无 knowledge 约束） |
| `knowledge_requirements` 为 null 或空 | 跳过第 4 硬门，走原三硬门流程 |

### 3.4 `known_issues` 处理

`known_issues` 是诊断信息，**不直接影响 verdict 方向**，但：
- 全部写入 scorecard（`knownIssue` 字段）
- reviewer 输出摘要段落，列出 drifted / superseded / filtered 条目
- 若 `known_issues` 非空，reviewer 最终输出必须包含：`"Known issues noted: <count> items logged to scorecard"`

---

## 4. Invocation Protocol（5 步）

所有 harness-* sub-skill 在 Stage 4 / review 阶段调用 strict-reviewer 时，严格按以下 5 步执行：

### Step 1：构造 review_target

```yaml
# 伪代码（coordinator 执行）
review_target:
  changed_files: <git diff --name-only 结果>
  diff_summary: <git diff 截取，≤300 词>
  stage: <"qa" | "security" | "spec" | "quality">
  claims_to_verify: <从任务描述 / PRD 提取>
  memory_cases: <从 docs/memory/ERRORS.md 按 changed_files glob 检索>
  prior_verdict: <上轮 scorecard 中的 verdict，或 null>
  # Knowledge 字段从 .harness-status.json.knowledgeCheck 复制
  knowledge_snapshot_id: <knowledgeCheck.snapshot_id>
  relevant_knowledge_files: <knowledgeCheck.relevant_knowledge_files>
  knowledge_requirements: <knowledgeCheck.knowledge_requirements>
  retrieval_outcome: <knowledgeCheck.retrieval_outcome>
  known_issues: <knowledgeCheck.known_issues>
```

若 `effective_index_status == "disabled"` 或 INDEX.md 不存在 → 5 个 knowledge 字段全设 null。

### Step 2：调用 strict-reviewer

```
Skill(strict-reviewer)
  输入：上方 YAML review_target
```

调用前检查：
- `.harness-status.json` 存在（harness 模式标志）
- `review_target` schema 无空缺必填字段（null 是合法值，缺失字段不合法）

### Step 3：YAML 解析 verdict

strict-reviewer 输出为 YAML 块，coordinator 解析：

```yaml
verdict: PASS | FAIL | BLOCKED
findings: []        # 每条 {severity, message, evidence}
scorecard_delta: {} # 增量更新字段
known_issues_logged: <count>
```

若输出非合法 YAML，coordinator 重试一次；第二次仍失败 → 记 verdict=BLOCKED，原因="reviewer_output_parse_error"。

### Step 4：Verdict 路由

| Verdict | 动作 |
|---|---|
| **PASS** | 继续 Stage 5（质量）/ Stage 6（QA）/ 后续流程 |
| **FAIL** | 返回 Stage 3 修复（同一 Round 最多 2 次 retry；第 3 次 FAIL → BLOCKED，升级用户）|
| **BLOCKED** | 立即暂停，输出 BLOCKED 原因，等待用户指示；禁止自动降级 |

### Step 5：Scorecard Persist

无论 verdict 如何，均写入 scorecard：

```bash
# 写入 docs/memory/harness_reviewer_scorecard.yml
# 字段：timestamp、stage、verdict、findings_count、known_issues_count、
#        knowledge_snapshot_id（若非 null）、retrieval_outcome（若非 null）
```

见 `memory-contract.md` §scorecard 结构 了解完整写入格式。

---

## 5. strict-reviewer 不可用时的降级约定

> **关键契约：禁绕过硬门。** 以下规则不可因任何便利理由更改。

### 5.1 场景与动作表

| 场景 | 动作 |
|---|---|
| **harness 模式**（`.harness-status.json` 存在）| `verdict: BLOCKED`；**禁止降级到传统 prompt**；输出原因"strict-reviewer unavailable in harness mode" |
| **独立使用**（无 `.harness-status.json`，用户手动调用）| 可回退 `qa-prompt` / `security-prompt`；scorecard 记 `knownIssue: strict_reviewer_unavailable_fallback` |
| **用户明示一次性降级**（显式指令本次使用旧 prompt）| 仅本次使用旧 prompt；scorecard 记同上 knownIssue；下次恢复走 strict-reviewer |
| **autonomous_mode**（任何形式的自治模式）| 永远 `BLOCKED`；禁止降级；禁止自动重试替代方案 |

### 5.2 BLOCKED 输出格式

当 strict-reviewer 不可用且场景为 harness 模式或 autonomous_mode：

```
[BLOCKED] strict-reviewer 不可用
  场景：harness 模式（.harness-status.json 存在）
  原因：<具体原因，如 Skill 调用失败 / 超时 / 返回异常>
  禁止：降级到传统 QA/security prompt
  等待：用户指示（修复 strict-reviewer 后重试，或明示本次一次性降级）
```

### 5.3 harness 模式检测方法

```bash
# coordinator 在调用 strict-reviewer 前执行
if [ -f ".harness-status.json" ]; then
  HARNESS_MODE=true
else
  HARNESS_MODE=false
fi
```

`HARNESS_MODE=true` 时，任何 strict-reviewer 不可用情形一律 BLOCKED。

---

## 6. 字段与错误边界速查

### 6.1 常见错误与处理

| 错误 | 处理 |
|---|---|
| `knowledge_snapshot_id` 有值但 `relevant_knowledge_files` 为 null | 判 coordinator_miss → BLOCKED；不应发生 |
| `knowledge_requirements` 有规则但 `violation_test` 字段缺失 | 当作 `free_form_review` 处理，reviewer 以 LLM 判断 |
| `known_issues` 字段类型错误（非 list）| YAML parse 阶段捕获 → verdict=BLOCKED，原因=schema_error |
| `retrieval_outcome` 值不在枚举范围 | 当作 `coordinator_miss` 处理（保守策略）|
| `stage` 值不在枚举范围 | BLOCKED，原因=invalid_stage |

### 6.2 字段合法性速查

| 字段 | 类型 | null 合法 | 空列表合法 |
|---|---|---|---|
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

---

## 7. 与其他 references 的关系

| 本文档关注 | 相关 reference |
|---|---|
| Stage -0.5 如何产出 knowledge 字段 | `knowledge-retrieval.md` §Stage -0.5 Protocol |
| memory_cases 如何检索 | `memory-contract.md` §Runtime 查询协议 |
| Scorecard 写入格式 | `memory-contract.md` §scorecard 结构 |
| Stage 4 入口门 knowledge 检查 | `knowledge-retrieval.md` §Stage 4 入口门 |
| `--maintain` knowledge audit | `maintenance.md` §Knowledge Audit |
| strict-reviewer 内部 Step 5 实现 | `strict-reviewer/SKILL.md` §Required Steps |
