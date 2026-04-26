# cases/

每个越过 `errors_collection.min_criteria` 阈值的 bug 会生成一个文件：
`harness_YYYY-MM-DD_<slug>.md`（harness 专属）或 `<your-slug>.md`（人类专属，对 harness 只读）。

完整 frontmatter schema 见 spec —— 必填键：`id`、`date`、`module`、
`status`、`applies_to`、`criteria_met`、`freshness`、`next_time_signal`。正文必须
包含 `## Negative Patterns` 标题（内容可为 `(none)`）。

参考：`docs/superpowers/specs/2026-04-22-memory-reviewer-upgrade.md` §Error Case 文件格式
