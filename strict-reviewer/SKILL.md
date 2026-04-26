---
name: strict-reviewer
description: 反谄媚审稿 skill — 默认 FAIL 立场 + 三硬门（Grounding / Reproduction / Coverage）+ Minimum adversarial search。Schema-driven 薄 wrapper，stateless。用于 PR 审查、QA、安全审查、spec 审查等任何需要严格证据链的审稿场景。harness-workflow Stage 4/5/6/7 自动调用。手动调用：/strict-reviewer <review_target YAML>。Triggers：(1) "严格审稿 / strict review" (2) harness-workflow reviewer 阶段 (3) 用户直接调 /strict-reviewer
---

# strict-reviewer — 反谄媚审稿 Skill

> 薄 wrapper。**不是** persona skill。Schema driven。Stateless。
>
> 设计参考：`/Users/twelve/Music/myskills/docs/superpowers/specs/2026-04-22-memory-reviewer-upgrade.md` §`strict-reviewer` Skill — IO Contract

## 默认立场（硬编码在 prompt 前置）

```
DEFAULT = FAIL. Hesitation counts as FAIL.
You are not here to be kind. You are here to find what will break.
PASS is a privilege that requires all three gates + three adversarial mode
analyses to pass cleanly.
If coverage is incomplete, verdict is BLOCKED — not PASS.
```

这不是自我激励辞，是**契约**。违反任一硬门的 PASS 等同于误放行，未来会被 false-pass-correction 机制追溯。

## Input（caller 必须传入的 YAML 字符串；R10 新增 knowledge 字段）

完整 schema 真源：`packages/harness-cli/resources/schemas/review-target.schema.json`（JSON Schema draft 2020-12）。

```yaml
review_target:
  # ── 审稿目标核心字段 ──
  changed_files:          # required, array of strings
    - "src/auth/session.ts"
  diff_summary: "..."     # required, string
  stage: "quality"        # required, enum: qa | security | spec | quality
  claims_to_verify: [...] # optional
  memory_cases: [...]     # optional
  prior_verdict: null     # optional

  # ── R10 新增：Spec 1 Stage -0.5 知识注入 ──
  relevant_knowledge_files:
    - "docs/harness/knowledge/style-and-structure/manifest.md"
  knowledge_snapshot_id: "scan-2026-04-24T10:00Z"
  retrieval_outcome: "success"  # success | coordinator_miss | all_candidates_filtered
  known_issues:                 # drifted/superseded/filtered，不 binding 但要透传
    - source: "drifted_rule"
      id: "internal-components/rule-5"
      domain: "internal-components"
      reason: "violation rate 40%"
  knowledge_requirements:       # Stage 4 Step 5 必须逐条检查
    - rule_id: "style-and-structure/rule-1"
      manifest_file: "docs/harness/knowledge/style-and-structure/manifest.md"
      applies_to: ["src/**"]
      requirement_text: "services return Result<T>"
      violation_test: "must_use_wrapper"
  stage: "qa"             # required, enum: qa | security | spec | quality
  claims_to_verify:       # optional, array of strings
    - "code handles expired refresh cookie"
  memory_cases: []        # optional, array — from Stage 3 .harness-status.json.memoryCheck.matches
  prior_verdict: null     # optional — if this is a re-review after FAIL
```

若 caller 未提供 required 字段 → 立即返回 `verdict: BLOCKED` 原因 `missing required input field: <field>`。

## Required Steps（严格执行，不跳）

1. **读取每个变更文件（Read every changed file）** — 用 Read tool 读每个 `changed_files` 文件。不能读的 → 加入 `coverage.skipped_files` 并说明原因
2. **核验每条声明（Verify every claim）** — 对 `claims_to_verify` 的每一条，对着 file:line / 命令输出 / repro 步骤逐条验证。没证据支持的 claim 算 finding（severity: high，grounded_by: 缺席）
3. **最小对抗性搜索（Minimum adversarial search）** — 列出 **3 个**可能失败模式（并发竞态 / 边界输入 / 鉴权绕过 / 数据损坏 / 资源泄漏 等）。对每一条，论证：
   - 当前代码是否处理了
   - 若未处理但 severity 低 → low finding
   - 若未处理且 severity 高 → high/critical finding
   不列够 3 个 = 审稿未完成，返回 BLOCKED
4. **应用三硬门（Apply three gates）**：
   - **Grounding 闸门**：每个 finding 必须带 `file:line` 或 `符号` 或 `命令输出` 或 `repro 步骤`。纯口头 finding 不计数
   - **Reproduction 闸门**：任何声称的 bug 必须有 repro steps / failing test / trace，或者 `reproduction: "not reproducible because <reason>"`
   - **Coverage 闸门**：`coverage.inspected_files` 必须包含所有 `changed_files` 里的关键文件（非测试文件、非 generated）。未读关键变更文件 → verdict 不得为 PASS，应为 BLOCKED

5. **Step 5 — Knowledge Compliance Check（Spec 1 第 4 硬门 / R10 落地）**：

   若 `review_target` 含 `knowledge_requirements`（Stage -0.5 注入），逐条验证 diff 是否违反：

   a. 读每条 `knowledge_requirement`：
      ```yaml
      rule_id: "style-and-structure/rule-1"
      manifest_file: "docs/harness/knowledge/style-and-structure/manifest.md"
      applies_to: ["src/**"]
      requirement_text: "services return Result<T>"
      violation_test: "must_use_wrapper"   # 或其他 6 种 + free_form_review
      ```

   b. 对 `applies_to` glob 命中的 diff 文件，按 `violation_test` 枚举检测：
      - `must_use_wrapper` / `must_call_component` / `must_use_package` / `must_annotate_with` → grep 调用/导入
      - `must_not_throw_raw_exception` / `must_not_use_pattern` → grep 禁用模式
      - `free_form_review` → LLM 判断 + 记 `manual_review_reason`

   c. 发现违反 → 追加 finding：
      ```yaml
      severity: "high"
      file: <违规文件:line>
      grounded_by: "read:file"
      message: "violated knowledge rule [<rule_id>]: <requirement_text>"
      knowledge_rule_id: <rule_id>
      ```

   d. 读 `review_target.retrieval_outcome` 校正 verdict（R10/T3 双向哨兵）：
      - `coordinator_miss`（Stage -0.5 本该跑但漏了）→ verdict=BLOCKED（系统错误，不是代码错）
      - `all_candidates_filtered`（所有 manifest 都 non-renderable）→ verdict 维持 + finding 记 knownIssue "考虑 --partial-rescan"
      - `success` 且 `knowledge_requirements` 全 PASS → 正常走 verdict 规则

   e. `review_target.known_issues` 里的 drifted/superseded 条目**不追加 finding**（它们 non-binding），但写入 `scorecard_delta` 的 `known_issues_seen` 字段供审计。

   **新增 verdict 规则**：
   - 任一 `knowledge_requirement` 被违反 → **FAIL**（不论其他硬门状态）
   - `retrieval_outcome = coordinator_miss` → **BLOCKED**

## Output（严格 YAML，供 caller 解析）

```yaml
verdict: "PASS" | "FAIL" | "BLOCKED"
reasons:
  - "adversarial search hit #2: expired token replay"
coverage:
  inspected_files:
    - "src/auth/session.ts"
  skipped_files:
    - path: "src/auth/types.ts"
      reason: "type-only, no runtime logic"
adversarial_search:
  failure_modes_checked:
    - "concurrent refresh race"
    - "expired token replay missing nonce check"
    - "CSRF via subdomain cookie leak"
  hits:
    - "#2 — expired token replay missing nonce check"
findings:
  - severity: "high"
    file: "src/auth/session.ts"
    line: 47
    grounded_by: "read:file"
    reproduction: "test/auth/session.spec.ts:expired-refresh-case"
    message: "refresh path does not invalidate old session token"
scorecard_delta:
  total_reviews: 1
  pass_count: 0
  fail_count: 1
  blocked_count: 0
```

### Verdict 决定规则（R10 扩展含 Step 5 知识合规）

| 条件 | verdict |
|------|---------|
| 至少一个 `critical` finding | **FAIL** |
| 至少一个 `high` finding 且 stage ∈ {qa, security, spec} | **FAIL** |
| `high` finding 仅出现在 stage=quality | **FAIL**（quality 阶段同样严格）|
| 仅 `medium` findings | **FAIL**（但 caller 可接受为 "merge-with-knownissues"）|
| **任一 `knowledge_requirement` 被违反**（Step 5 捕获） | **FAIL** |
| **`retrieval_outcome = coordinator_miss`**（Stage -0.5 漏跑 + 系统错误）| **BLOCKED** |
| `retrieval_outcome = all_candidates_filtered` | 正常走其他规则 + 记 knownIssue 警示 `--partial-rescan` |
| 仅 `low` findings + 三硬门全过 + adversarial 3 条全论证 + 知识合规全过 | **PASS** |
| 任何硬门失败 | **BLOCKED** |
| 输入格式错误 / 缺少 required 字段 | **BLOCKED** |

## Scorecard（caller 负责 persist）

`strict-reviewer` 自己 **完全 stateless**。`scorecard_delta` 是给 caller 的一次性 payload。

Caller（harness Stage 6/7 coordinator，或手动调用的用户）按 `docs/memory/harness_reviewer_scorecard.yml` 的 schema（见 spec §`harness_reviewer_scorecard.yml` Schema）做：
1. 追加一条 `reviews[]` entry
2. 更新 `totals` 各项计数
3. 若超过 500 条 → 归档到 `docs/memory/archive/harness_reviewer_scorecard_<year>.yml` 并保留最新 100 条

## 何时被调用

### 自动（harness-workflow 内部）

`harness-workflow/references/workflow.md` 定义 Stage 4/5/6/7 在各自工作完成后，由主 agent coordinator 构造 `review_target` 并调用 `strict-reviewer`。

详细协议 → `harness-workflow/references/reviewer-integration.md`

### 手动（用户直接用）

```
/strict-reviewer <review_target YAML>
```

独立模式下评分卡无处写入 → 输出的 `scorecard_delta` 返回给用户，由用户自行决定存放位置。

## 不该做什么（避免 persona 膨胀）

- ❌ 不写 "I am a brutal senior engineer..." 这类 persona 散文
- ❌ 不根据 stage 改变"人格"（qa 与 security 的领域不同，但硬门和对抗性搜索流程一致）
- ❌ 不自行读取 `docs/memory/` 或 `.harness-memory.yml`（caller 已通过 `memory_cases` 注入）
- ❌ 不跨 review 保留状态（stateless 铁律）
- ❌ 不降级到 "temporary relaxed mode"。若资源不够 → BLOCKED
