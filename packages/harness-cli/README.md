# harness-workflow-cli

CLI for the [harness-workflow](https://github.com/TerryGSL/myskills) skill ecosystem.
Provides determistic file scaffolding (init / adopt / maintain / doctor / scan) so the
Claude Code skills can focus on intelligence instead of hand-writing files.

## Install

```bash
# public registry
npm install -g harness-workflow-cli

# or via npx (no global install)
npx harness-workflow-cli doctor
```

## Commands

| Command | Purpose |
|---------|---------|
| `harness init [--preset personal\|company-mt] [<path>]` | Initialize a new project (scaffold `.harness-profile`, `docs/memory/`, `docs/harness/knowledge/`, bundled skills, etc.) |
| `harness adopt [--preset ...] [<path>]` | Adopt harness into an existing project. Respects user-modified files (four-state policy). |
| `harness doctor [--json] [<path>]` | Health check: managed-files git status, schema version, profile, memory tree. |
| `harness maintain [--upgrade] [<path>]` | Drift report + promotable-learnings reminder. `--upgrade` re-applies bundled templates. |
| `harness scan [--apply-answers] [--budget <min>] [--domain <name>] [<path>]` | Request knowledge scan; actual 5-domain AI pipeline runs via harness-workflow skill. |

## Typical flow

1. In a brand-new project: `harness init`
2. Open the project in Claude Code — the `team-init` bootstrap skill detects the CLI
   via `harness doctor --json` and routes subsequent requests through `profile-entry`.
3. Weekly: `harness maintain` to surface stale learnings and managed-file drift.
4. Before a big feature: `harness scan` to refresh `docs/harness/knowledge/`.

## Agent-type

Currently only Claude Code (`--agent-type claude`, default) is supported.
Codex support is reserved for future work.

## Profiles

Profiles live in `~/.claude/profiles/*.yml` and declare matchers, task-type routing,
aggression mode, and hard-floor policies. See the bundled `personal` and `company-mt`
presets for reference.

## License

MIT
