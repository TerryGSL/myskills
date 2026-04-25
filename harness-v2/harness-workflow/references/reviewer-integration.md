# harness-workflow ↔ strict-reviewer 集成

> Stage 4/5/6/7 正确调用 `strict-reviewer` 的调用方侧协议。
> Spec 参考：`specs/2026-04-22-memory-reviewer-upgrade.md` §Invocation Protocol

## 角色

- **strict-reviewer skill** —— 无状态审查器（见 `strict-reviewer/SKILL.md`）
- **Caller** —— harness-workflow 主 agent，扮演 Stage 4/5/6/7 协调者
- **评分卡** —— `docs/memory/harness_reviewer_scorecard.yml`，由调用方持有并持久化

## 协议

### 1. 构造 `review_target`

调用方从当前 round 状态收集输入：

| 字段 | 来源 |
|-------|-------|
| `changed_files` | `git diff --name-only <.harness-status.json.baseSha>..HEAD` |
| `diff_summary` | `git log --oneline <baseSha>..HEAD` + `git diff --stat` |
| `stage` | 当前 Stage：Stage 6 为 `"qa"`、Stage 7 为 `"security"`、Stage 4 为 `"spec"`、Stage 5 为 `"quality"` |
| `claims_to_verify` | Stage 相关：Stage 4 = spec 验收标准；Stage 5 = plan 的测试清单；Stage 6 = PRD 验收标准；Stage 7 = 安全需求 |
| `memory_cases` | 从 `.harness-status.json.memoryCheck.matches` 读取 |
| `prior_verdict` | 如为 FAIL 后的复审，传入上一轮输出；否则为 null |

### 2. 调用

```
Skill(skill="strict-reviewer", args=<serialized review_target YAML>)
```

调用方等待 YAML 格式的响应。

### 3. 解析响应

响应为 YAML，匹配 `strict-reviewer/SKILL.md` 的 Output schema。调用方必须：

- 按 YAML 解析（Python `yaml.safe_load` 或等价实现）
- 若解析失败 → 用同样的 `review_target` 重试一次
- 若第二次仍失败 → 视为 `verdict: BLOCKED`，原因 `"reviewer output malformed"`

### 4. 根据 verdict 路由

| verdict | 调用方动作 |
|---------|-----------|
| `PASS` | 进入下一个 Stage。将 `scorecard_delta` 追加到评分卡（见步骤 5）。 |
| `FAIL` | 进入该 Stage 的自动修复循环：Stage 4 ≤ 3 轮 / Stage 5 ≤ 3 轮 / Stage 6/7 按 P0 bug 规则。每次重试构造新的 `review_target` 并填入 `prior_verdict`。 |
| `BLOCKED` | **升级给用户**。禁止自动重试，禁止继续。`BLOCKED` 意味着系统状态不完整（输入畸形、覆盖不可能等），而不是代码有问题。 |

### 5. Scorecard 持久化（调用方持有，strict-reviewer 无状态）

每次调用（PASS / FAIL / BLOCKED），调用方都向 `docs/memory/harness_reviewer_scorecard.yml` 追加：

```yaml
reviews:
  - review_id: "r-<date>-<N>"            # generate monotonic id per round
    stage: "<stage>"
    timestamp: "<ISO>"
    changed_files: [...]
    verdict: "<verdict>"
    findings_count: <from output>
    linked_error_case: null              # set later if false-pass correction fires
```

并更新 `totals`：

```yaml
totals:
  total_reviews: +1
  <verdict lower>_count: +1
```

随后检查轮转：若 `len(reviews) > 500` → 将较早条目移动到 `docs/memory/archive/harness_reviewer_scorecard_<year>.yml`（保留最近 100 条）。

## strict-reviewer 不可用（降级模式）

若 `Skill(skill="strict-reviewer", ...)` 失败（skill 缺失、工具错误、超时）：

| 场景 | 动作 |
|------|------|
| harness 模式（存在 docs/STATE.json） | **BLOCKED**，升级。禁止回退到旧版 prompt。 |
| 独立使用（无 STATE.json） | 回退到旧版 qa-prompt / security-prompt；记录 knownIssue |
| 用户显式批准一次性降级 | 仅本次调用使用旧版 prompt；追加 knownIssue 并说明原因 |
| `autonomous_mode` | 永远 BLOCKED，等待用户。禁止静默降级。 |

理由：strict-reviewer 的全部价值就是硬门槛。恰恰是在强制执行的基础设施消失时，最需要这些门槛，而不是最不需要。

## 关联误放行事件

当后续 bug 与先前 PASS 审查相矛盾（正是让评分卡有意义的反馈闭环）：

1. 若符合 `errors_collection.min_criteria`，在 `docs/memory/cases/harness_<date>_<slug>.md` 新开一个错误案例
2. 向评分卡的 `false_pass_incidents` 追加：
   ```yaml
   false_pass_incidents:
     - incident_id: "fpi-<date>-<N>"
       original_review_id: "r-<date>-<N>"   # the review that missed this
       bug_case: "cases/harness_<date>_<slug>.md#<id>"
       detected_at: "<ISO>"
       action_taken: "..."
   ```
3. `--maintain` 周期性扫描 `false_pass_incidents`，用于喂给 reviewer-prompt 示例（未来工作）

## 各 Stage 的 claims 验证指引

调用方应为各 Stage 选择合适的 `claims_to_verify`：

- **Stage 4（spec review）**：plan / spec 中的每条验收标准 —— 代码是否满足？
- **Stage 5（quality / codex 交叉审查）**：核心架构断言 —— 单一职责、无分层越界、无废弃分支
- **Stage 6（QA）**：plan 测试清单中的每个测试用例 —— 代码 + 测试组合能否产生预期行为？
- **Stage 7（security）**：OWASP 风格的威胁陈述 —— 代码能否防御 <某具体类别的攻击>？

允许 `claims_to_verify` 为空，但强烈不推荐 —— 这会让 strict-reviewer 只能依赖对抗性搜索，降低信号密度。
