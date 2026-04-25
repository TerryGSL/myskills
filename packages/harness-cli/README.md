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
| **`harness install [--doctor] [--json]`** | User-global setup: profiles 目录 + ymls + settings.json hook 注册 + skills symlink。默认 `check + auto-fix`；`--doctor` 仅检查；`--json` 机器可读。 |
| **`harness profile-bootstrap [slug]`** | 派生 company profile：从 `git rev-parse --show-toplevel` + `git remote -v` 自动算 path_glob + git_remote_regex；写 `~/.claude/profiles/company-<slug>.yml` + repo `.harness-profile` marker + `.gitignore`。 |
| **`harness push-check [--hard-floor=<flags>]`** | Risk-based push 决策。三档 HIGH/MEDIUM/LOW（exit 2/1/0）；公司 `hard_floor` 含 `auto_push` 永远 HIGH。`--hard-floor=auto_push,...` 显式传入。 |

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

## Source of Truth

所有 enum / type / risk level 来自 `src/types/constants.ts`：

- `MATCHER_TYPES`: path_glob | git_remote_regex | file_exists
- `HARD_FLOOR_FLAGS`: auto_push | force_push | destructive_ops | auto_merge | rewrite_history | network_install
- `TASK_TYPES`: quick | bugfix | feature | refactor
- `PUSH_RISK_LEVELS`: low | medium | high
- `AGGRESSION_MODES`: conservative | standard | aggressive

JSON Schema 由 `scripts/regen-schema.ts` 从 constants 自动生成。CI workflow `.github/workflows/schema-drift.yml` 守门：每次改 constants 必须本地跑 `npm run regen:schema` 后 commit；diff 不空 CI fail。

## Build & Test

```bash
npm install
npm run build
npm test
```

107 个 jest test，覆盖 18 个 suite。

## License

MIT
