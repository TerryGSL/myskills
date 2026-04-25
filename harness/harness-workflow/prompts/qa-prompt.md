# Stage 6: QA Prompt (via strict-reviewer)

> 本文件是 Stage 6 QA coordinator 的**域上下文模板**。实际审稿由 `strict-reviewer` skill 执行（见 `references/reviewer-integration.md`）。
>
> **不要直接用本文件作为 role prompt** — 它的内容作为 `review_target.claims_to_verify` 或 `diff_summary` 的一部分传给 strict-reviewer。

## 调用方式

Stage 6 coordinator 构造 `review_target`：

```yaml
review_target:
  stage: "qa"
  changed_files:     # from: git diff --name-only <baseSha>..HEAD
    - "<file>"
  diff_summary: |
    # 本轮摘要（一句话）
    ...
  claims_to_verify:  # 每条都来自 PRD 或 plan
    - "新函数 X 覆盖边界情况 Y（empty, max length, concurrent call）"
    - "新 endpoint Z 返回错误码 ABC 按 spec"
    - "集成场景 M→N→O 正确流转"
  memory_cases:      # from .harness-status.json.memoryCheck.matches
    - <case refs>
  prior_verdict: null  # or prior output if retry
```

然后：

```
Skill(skill="strict-reviewer", args=<review_target YAML>)
```

## QA 特定的 claims 选择指引

- **单元测试**：对每个修改的函数，claim = "函数 X 的行为满足 <条件>"（行为描述，不是 "有测试"）
- **集成测试**：对每个跨模块调用链，claim = "模块 A → B → C 的数据流在 <场景> 下正确"
- **E2E**（仅前端有 UI 时）：claim = "用户流 <路径> 在 <浏览器> 下完成 <目标>"

## 覆盖率底线（从 .harness-context.json）

- 新增单元测试覆盖率 ≥ `context.testCoverageThreshold`（默认 60%）
- P0 bug 必须修复（strict-reviewer 会 FAIL）
- P1 bug 进入 knownIssues

## 失败处理

strict-reviewer 返回 FAIL → Stage 6 coordinator：
1. 对每个 `findings[].reproduction`，写 failing test
2. 跑 test，确认 FAIL
3. 修 code
4. 跑 test，确认 PASS
5. 重新 invoke strict-reviewer（同一 `review_target` + `prior_verdict=<上轮 output>`）
6. 最多 3 轮。3 轮仍 FAIL → 升级用户，knownIssues 记录

strict-reviewer 返回 BLOCKED（非 FAIL）→ 停止 Stage 6，上报用户。BLOCKED 意味着输入或 coverage 有问题，不是代码问题。

## 历史上下文

旧版 qa-prompt.md（v0.x，persona-driven）已完全替换。新流程下 role prompt 的"人格"表达完全由 strict-reviewer 的 default-FAIL 立场负责。
