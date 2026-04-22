# cases/

Each bug that clears the `errors_collection.min_criteria` threshold gets one file:
`harness_YYYY-MM-DD_<slug>.md` (harness-owned) or `<your-slug>.md` (human-owned, read-only for harness).

See the spec for full frontmatter schema — required keys: `id`, `date`, `module`,
`status`, `applies_to`, `criteria_met`, `freshness`, `next_time_signal`. Body must
include `## Negative Patterns` heading (content may be `(none)`).

Reference: `harness-workflow/specs/2026-04-22-memory-reviewer-upgrade.md` §Error Case 文件格式
