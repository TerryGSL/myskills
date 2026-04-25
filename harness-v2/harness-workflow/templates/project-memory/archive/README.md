# archive/

冷存储：用于被取代（superseded）、被显式归档（archived）、或
`archive_policy.archive_after_days_unused` 天（默认 180）未被使用的记忆。

harness 专属：`harness_*.md` 和 `harness_*.yml`（评分卡轮转）。`archive/` 下的
用户文件对 harness 为只读。

不要把归档内容当作被遗忘 —— 归档后又被再次引用的案例会被重新升级为 active
（freshness.state → active，last_used 更新）。
