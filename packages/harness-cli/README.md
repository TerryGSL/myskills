# harness-workflow-cli

CLI for the harness workflow of [myskills](https://github.com/TerryGSL/myskills).
Provides deterministic file scaffolding and routing (init / adopt / maintain / doctor / scan / install / profile-bootstrap / profile-resolve / route / memory / push-check) so the Claude Code skills can focus on intelligence instead of hand-writing files.

> 仓库整体定位：一套核心规则 + 两种使用方式（npm CLI 工程化 / 直接 markdown 接入）+ 跨工具兼容。
> 直接 markdown 接入（无 npm 环境）见仓库顶层 [`harness/README.md`](../../harness/README.md)。

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
| `harness scan [--json] [--apply-answers] [--budget <min>] [--domain <name>] [<path>]` | Knowledge scan entry point: emits 5-domain pipeline plan; AI pipeline runs via harness-workflow skill. `--json` for machine-readable output. |
| `harness install [--doctor] [--json]` | User-global setup: profiles 目录 + ymls + settings.json hook 注册 + skills symlink。默认 `check + auto-fix`；`--doctor` 仅检查；`--json` 机器可读。 |
| `harness profile-bootstrap [slug]` | 派生 company profile：从 `git rev-parse --show-toplevel` + `git remote -v` 自动算 path_glob + git_remote_regex；写 `~/.claude/profiles/company-<slug>.yml` + repo `.harness-profile` marker + `.gitignore`。 |
| **`harness profile-resolve [--json] [<path>]`** | 解析当前项目 profile：读 marker / 跑 matchers / 应用 precedence；输出探测公告（marker 命中 / matcher tie-break / 默认兜底） |
| **`harness route [--json] [--task-description=...] [--flag=...]`** | 统一路由：profile × task_type × aggression → 唯一 leaf skill 名。覆盖 5 条独立路径（marker / tie-break / yolo-vs-hard-floor / bugfix / refactor）。 |
| **`harness memory check [--json] [<path>]`** | memory 三层写入权限检查：`docs/memory/*.md`（必需）+ `.harness-status.json`（必需）+ claude-mem cross-session（optional acceleration） |
| `harness push-check [--hard-floor=<flags>]` | Risk-based push 决策。三档 HIGH/MEDIUM/LOW（exit 2/1/0）；公司 `hard_floor` 含 `auto_push` 永远 HIGH。`--hard-floor=auto_push,...` 显式传入。 |

## Typical flow

1. In a brand-new project: `harness init`
2. Open the project in Claude Code — the `harness-init` bootstrap skill detects the CLI
   via `harness doctor --json` and routes subsequent requests through `harness route`.
3. Weekly: `harness maintain` to surface stale learnings and managed-file drift.
4. Before a big feature: `harness scan` to refresh `docs/harness/knowledge/`.

## Routing CLI

`harness route` 是统一路由命令，派发到唯一 leaf skill：

```bash
harness route --json --task-description="修一下登录接口的 500"
# → { "leaf_skill": "harness-bugfix", "profile": "...", "task_type": "bugfix", ... }
```

5 条独立路径（`tests/fixtures/golden/routing-*.yml` 守门）：

1. `.harness-profile` marker 显式解析（marker 命中 → 跳 fallback matchers）
2. matcher tie-break（同 priority 下用具体度决胜）
3. `/yolo` flag vs 公司 hard_floor 冲突（hard_floor 必胜）
4. bugfix 路由（task_description 含修 bug 触发词 → harness-bugfix）
5. refactor 路由（含 `/refactor` flag → harness-refactor）

## Agent-type

Currently only Claude Code (`--agent-type claude`, default) is supported.
跨工具 wrapper（Codex / Cursor / Aider / Copilot）通过 `wrappers/` 下 AGENTS.md 与本 CLI 共享同一份 contract。

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

12 份 schema 全套：`profile / marker / task-type / knowledge / knowledgeCheck / hard-floor / memory / drift / reviewer-gates / doctor-protocol / route-output` + 1 份内部 status。

## Contracts

`harness-common/contracts/` 下 14 份 narrative contract 是规则的 source-of-truth narrative 副本。每份 contract 顶部都标注其代码 / schema 来源（`packages/harness-cli/src/types/constants.ts` + `resources/schemas/*.schema.json`）。

## Build & Test

```bash
npm install
npm run build
npm test
```

跑 jest 全套（含 5 类 × 3 + 5 routing = 20 golden fixtures + 各 command unit/integration test）。

## License

MIT
