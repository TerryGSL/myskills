# archive/

Cold storage for memory that is superseded, archived explicitly, or unused for
`archive_policy.archive_after_days_unused` days (default 180).

harness-owned: `harness_*.md` and `harness_*.yml` (scorecard rollover). User files
in `archive/` are read-only for harness.

Do not treat archived content as forgotten — a case referenced again after archival
gets re-promoted to active (freshness.state → active, last_used updated).
