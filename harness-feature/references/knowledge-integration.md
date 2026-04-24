# Knowledge Scanner Integration (Spec 1)

How harness-feature cooperates with the knowledge scanner pipeline defined in
`harness-workflow/specs/2026-04-23-project-knowledge-scanner-design.md`.

## 核心集成点：Stage -0.5

每个 Round 开始，在 Stage 0 之前。详细流程见 [references/stages.md](stages.md) Stage -0.5 章节。

## 注入给下游 Stage 的数据

Stage -0.5 产出 `.harness-status.json.knowledgeCheck`，含 8 个字段：

```json
{
  "effective_index_status": "active" | "stale" | "drifted" | "disabled",
  "snapshot_id": "scan-YYYY-MM-DDTHH:MMZ" | null,
  "retrieval_outcome": "success" | "coordinator_miss" | "all_candidates_filtered",
  "filtered_candidates": [...],
  "known_issues": [...],
  "relevant_knowledge_files": [...],
  "advisory_knowledge": [...],        // user_override + expired_rule
  "knowledge_requirements": [...]      // Stage 4 Step 5 逐条验证
}
```

Canonical schema：`packages/harness-cli/resources/schemas/knowledge.schema.json`。

## 两视图渲染（不把全文塞给 subagent）

Stage -0.5 在注入下游 Stage prompt 时，按 Rule Status 过滤，render 为两个视图：

### View 1：Binding Rules（Status=active）

```markdown
# Project Knowledge Context — Binding Rules（违反 → reviewer FAIL）

以下 rule 来自命中 manifest 的 `Status: active` rule：

## <domain> (from <manifest.md>)
- **[<rule_id>]** <规则描述一句话>
  适用: <path glob>
  violation_test: <enum>
```

### View 2：Advisory Context（Status=expired / user_override）

```markdown
# Advisory Context（非强制，仅作风格参考）

以下来自 INDEX 的 user_override / expired free_form_review：

- **[user_override: <gap_id>]** <override 摘要>
- **[expired_rule: <rule_id>]** <requirement_text> (last_verified 过期 N 天)
```

**不渲染** drifted / superseded 条目（non-binding 也不参考）—— 仅在 coordinator log 里记 `known_issues`。

## Late Recovery (Stage 4 兜底)

coordinator 漏跑 Stage -0.5 + Stage 4 发现 diff 涉及 knowledge manifest → Late Recovery：

1. 用 `git diff --name-only` 重跑 Stage -0.5 的路径匹配
2. 重算 **全 8 个字段**（Spec 1 Round 11 Gap 3 校正）
3. 更新 `.harness-status.json.knowledgeCheck`
4. 若发现新 `knowledge_requirements` → 先跑 remediation task（Stage 3 子循环）再进 reviewer
5. recovery 只跑 1 次，避免循环

详见 Spec 1 §Stage 4 Late Recovery。

## Disabled 模式

CLAUDE.md 含 `harness-knowledge: disabled` → Stage -0.5 跳过所有步骤，但写：

```json
{
  "effective_index_status": "disabled",
  "snapshot_id": null,
  "retrieval_outcome": "success",
  "filtered_candidates": [],
  "known_issues": [],
  "relevant_knowledge_files": [],
  "advisory_knowledge": [],
  "knowledge_requirements": []
}
```

Stage 4 识别 `effective_index_status: disabled` → 跳过 Step 5 知识合规检查。

## 扫描触发（非 harness-feature 责任）

本 skill **不直接触发 `harness scan`**。扫描由用户显式跑：

```bash
harness scan                       # 全量扫描
harness scan --domain <name>       # 单 domain
harness scan --apply-answers        # 处理 TODO.md 批答复
```

harness-feature 只**消费**扫描产出的 `docs/harness/knowledge/` 文件，不修改。

**写入权限**：`docs/harness/knowledge/*` 只有 `harness scan` / `harness maintain`（drift 自动改 Status）可写。harness-feature 任何 Stage 违反此约束 → strict-reviewer Step 5 立即 FAIL。
