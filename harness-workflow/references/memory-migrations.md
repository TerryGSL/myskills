# `.harness-memory.yml` Schema Migrations

> Declarative migration steps per major version bump. Harness reads this file on
> `--init/--adopt/--maintain` when it detects a contract whose `schema_version`
> is older than the current release.
>
> Reference: `specs/2026-04-22-memory-reviewer-upgrade.md` §版本演化

## Format

Each migration is a section keyed by semver range. Steps are declarative (natural
language + YAML diffs), not executable code. Harness's job is to read, explain the
change to the user, and apply only after explicit confirmation.

## Current Version

`1.0.0` — Initial release (this commit).

No prior versions exist, so no migration steps are defined yet.

## Future: 1.0.0 → 2.0.0 (placeholder for next major bump)

When schema_version 2.0.0 is released, a section like this will be appended:

```
### 1.0.0 → 2.0.0

**Scope of change:**
- <describe what changed in ownership / field names / behavior>

**Breaking:**
- <list breaking changes>

**Migration steps:**
1. Back up current `.harness-memory.yml` to `archive/harness-memory-v1.yml`
2. Rename fields: <old> → <new>
3. Re-validate with new schema
4. Update schema_version to "2.0.0"

**User action required:**
- Confirm YES/NO after harness shows diff preview
```

## Rules

- **Patch (x.y.z bump)**: no migration needed
- **Minor (x.Y.z bump)**: optional; harness reads new fields with defaults
- **Major (X.y.z bump)**: migration section REQUIRED in this file before release
- **No migration for downgrades** — harness refuses to operate on newer-major contract in read-only mode
