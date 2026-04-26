# Profile-Based Dispatch Redesign Implementation Plan

> **⚠️ HISTORICAL ARCHIVE — paths refer to repo state at time of writing.**
> This is a historical plan recording an earlier redesign. File paths and contract names within (e.g. `harness-workflow/references/*`, `harness-common/references/*`) describe the repo state when this plan was authored, **not** the current source-of-truth layout. For current contracts see `harness-common/contracts/*` and `README.md` 16 能力清单.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic `harness-workflow` skill (363 LoC) with a layered profile-based dispatch framework: thin `profile-entry` router + 5 focused task-type sub-skills, supporting personal and (stubbed) company project profiles with orthogonal aggression mode.

**Architecture:** 2-layer dispatch — `task-dispatcher` (unchanged) → `profile-entry` (internal routing, single Skill load) → leaf sub-skill (`harness-quick` / `harness-bugfix` / `harness-feature` / `harness-refactor`). Profile registry at `~/.claude/profiles/`. Precedence: `profile hard-floor > invocation flag > profile default > conservative`. Structural git-diff-based fast-path replaces LLM task-type guessing.

**Tech Stack:** Markdown skills + YAML profiles + Bash validation script (no new runtime dependency). Lives in `/Users/twelve/Music/myskills/`.

**Design spec:** [docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md](../specs/2026-04-24-profile-based-dispatch-redesign-design.md)

---

## File Structure

**Created:**
- `profile-entry/skill.md` — entry-point routing logic
- `profile-entry/references/profiles.md` — registry schema + matcher rules
- `profile-entry/references/precedence.md` — precedence contract
- `profile-entry/references/fast-path.md` — structural fast-path allowlist + detection rules
- `profile-entry/references/task-type-contract.md` — cross-pack contract
- `harness-common/skill.md` — shared infra header
- `harness-common/references/memory-contract.md` — moved
- `harness-common/references/project-detection.md` — moved
- `harness-common/references/phase-init.md` — extracted from current Phase 1-4
- `harness-quick/skill.md` — 1-line/1-file path
- `harness-bugfix/skill.md` — investigate → fix → test
- `harness-feature/skill.md` — current 8-Stage body
- `harness-refactor/skill.md` — baseline → incremental → verify
- `~/.claude/profiles/default.yml` — fallback profile
- `~/.claude/profiles/harness.yml` — personal profile
- `~/.claude/profiles/company.yml.template` — company stub
- `tools/harness-pack-test` — contract validation bash script
- `tools/fixtures/pack-test/` — test fixtures

**Modified:**
- `harness-workflow/skill.md` — reshape to thin profile-declaration stub
- `task-dispatcher/skill.md:171-183` — update "与 harness-workflow 的关系" section
- `README.md` — document new framework entry points

**Moved (not deleted, symlink or plain move):**
- `harness-workflow/references/memory.md` → `harness-common/references/memory-contract.md`
- `harness-workflow/references/project-detection.md` → `harness-common/references/project-detection.md`
- `harness-workflow/references/templates.md` → `harness-common/references/templates.md` (remains referenced)
- `harness-workflow/references/workflow.md` → split: phase-init content to `harness-common/references/phase-init.md`, 8-Stage content stays accessible from `harness-feature/references/`

---

## Execution Order

Tasks 1–5 build the foundation (profile-entry + registry + pack-test). Tasks 6–9 extract shared common layer. Tasks 10–13 implement task-type sub-skills (can be parallelized by subagent-driven-development). Tasks 14–16 reshape legacy + validate + update docs.

---

### Task 1: Profile registry directory + default/harness YAML profiles

**Files:**
- Create: `~/.claude/profiles/default.yml`
- Create: `~/.claude/profiles/harness.yml`
- Create: `~/.claude/profiles/company.yml.template`

- [ ] **Step 1: Create registry directory**

```bash
mkdir -p ~/.claude/profiles
```

- [ ] **Step 2: Write default.yml**

File: `~/.claude/profiles/default.yml`

```yaml
name: default
description: Fallback profile. Always matches. Conservative defaults.

detection:
  priority: 0
  matchers:
    - type: always
      pattern: "*"

entry_skill: profile-entry

task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor

default_mode: conservative

hard_floor: []
```

- [ ] **Step 3: Write harness.yml**

File: `~/.claude/profiles/harness.yml`

```yaml
name: harness
description: Personal projects — Next.js / Go / Python.

detection:
  priority: 10
  matchers:
    - type: path_glob
      pattern: "~/Music/myskills/**"
    - type: path_glob
      pattern: "~/Music/hummv/**"
    - type: git_remote_regex
      pattern: "github\\.com[:/]TerryGSL/.*"

entry_skill: profile-entry

task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor

default_mode: standard

hard_floor: []
```

- [ ] **Step 4: Write company.yml.template**

File: `~/.claude/profiles/company.yml.template`

```yaml
# Company profile stub — rename to <company-name>.yml and fill in.
name: company-REPLACE_ME
description: Company projects — strict review required. Never auto-push.

detection:
  priority: 20
  matchers:
    # REPLACE with your company repo path glob
    - type: path_glob
      pattern: "REPLACE_ME"
    # REPLACE with your company git remote regex
    - type: git_remote_regex
      pattern: "REPLACE_ME"

entry_skill: profile-entry

task_types:
  # REPLACE with your company skill pack sub-skill names when the pack is ready.
  # Until then, point at harness-* for a working fallback.
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor

default_mode: conservative

hard_floor:
  - auto_push
  - force_push
  - destructive_ops
  - auto_merge
```

- [ ] **Step 5: Verify files written**

```bash
ls -la ~/.claude/profiles/
```

Expected: three files listed (default.yml, harness.yml, company.yml.template).

- [ ] **Step 6: Commit**

Profile files live in `~/.claude/profiles/` (user home), not the repo. No git commit for this task. Confirm by reading back:

```bash
cat ~/.claude/profiles/default.yml
```

Expected: YAML contents as written.

---

### Task 2: profile-entry skeleton + references scaffolding

**Files:**
- Create: `profile-entry/skill.md`
- Create: `profile-entry/references/profiles.md`
- Create: `profile-entry/references/precedence.md`
- Create: `profile-entry/references/fast-path.md`
- Create: `profile-entry/references/task-type-contract.md`

- [ ] **Step 1: Create directory**

```bash
mkdir -p /Users/twelve/Music/myskills/profile-entry/references
```

- [ ] **Step 2: Write profile-entry/references/profiles.md**

File: `/Users/twelve/Music/myskills/profile-entry/references/profiles.md`

```markdown
# Profile Registry Reference

Profiles live at `~/.claude/profiles/<name>.yml`.

## Schema

```yaml
name: string                   # unique profile identifier
description: string
detection:
  priority: integer            # higher wins when multiple profiles match
  matchers:                    # OR-joined: any matcher match = profile matches
    - type: path_glob | git_remote_regex | always
      pattern: string
entry_skill: profile-entry     # always profile-entry
task_types:
  quick: <skill-name>
  bugfix: <skill-name>
  feature: <skill-name>
  refactor: <skill-name>
default_mode: conservative | standard | aggressive
hard_floor:                    # list of forbidden operations that flags cannot lift
  - auto_push
  - force_push
  - destructive_ops
  - auto_merge
```

## Matcher types

- `path_glob`: tilde-expanded glob against current CWD. `**` matches recursively.
- `git_remote_regex`: regex against `git remote get-url origin` output.
- `always`: matches anything. Reserved for `default` profile.

## Selection algorithm

1. If `.harness-profile` exists at repo root and its content names a registered profile → use that profile. Validate (see marker-validation below).
2. Else: iterate all registered profiles, collect those whose matchers match. Sort by priority desc, then by specificity desc (longer path glob wins; git_remote_regex beats path_glob). Pick top.
3. Still tied → hard error asking user to create `.harness-profile`.
4. Nothing matched except `default` (priority 0) → use `default`.

## Marker validation

When `.harness-profile` is present:

1. Named profile must exist in registry. Missing → hard error.
2. Named profile's matcher rules must ALSO match current repo. If not (stale marker after copy/rename) → emit warning with best fallback suggestion; honor marker but flag in output.
```

- [ ] **Step 3: Write profile-entry/references/precedence.md**

File: `/Users/twelve/Music/myskills/profile-entry/references/precedence.md`

```markdown
# Precedence Contract

Single rule, always this order:

```
profile hard_floor policy
  > per-invocation flag (/yolo /safe /quick /fix /refactor)
  > profile default (default_mode, default task_type)
  > built-in conservative default
```

## Interpretation

- **profile hard_floor**: items in this list cannot be enabled by any flag. E.g., company profile with `hard_floor: [auto_push]` means `/yolo` cannot trigger auto-push in that profile.
- **per-invocation flag**: `/yolo` / `/safe` set aggression; `/quick` / `/fix` / `/refactor` set task type. Flags are one-shot — no session persistence.
- **profile default**: applies when no flag given.
- **built-in conservative**: hardcoded fallback when profile config omits a setting.

## Hard-floor conflict output

When a flag is downgraded by hard_floor, emit:

```
Requested: /yolo
Effective: <profile-name>-safe (profile policy: <floor-items>)
Reason: <profile-name> profile hard-floor
```

Print at turn start. Do not silently demote.
```

- [ ] **Step 4: Write profile-entry/references/fast-path.md**

File: `/Users/twelve/Music/myskills/profile-entry/references/fast-path.md`

```markdown
# Structural Fast-Path

Deterministic task-type downshift. Does NOT use LLM judgment. Runs only when user did NOT provide an explicit task-type flag.

## Entry condition (all must hold)

- No `/quick` / `/fix` / `/refactor` flag in user message
- `git diff --stat` shows exactly 1 file changed (or 0, treated as new single file)
- Total diff size (insertions + deletions) < 10 lines
- No new file created unless it matches documentation extensions
- Target file(s) match the fast-path allowlist below

## Fast-path allowlist

### Always allowed
- Extension in `{.md, .txt, .json, .yml, .yaml, .toml, .ini, .cfg}`

### Source files — allowed only if diff does NOT touch:
- Exported symbols: lines matching `^export `, `^public `, `func [A-Z]` (Go), `def [^_]` added/removed at module scope (Python)
- Type definitions: `interface`, `type`, `class`, `struct`, `enum` declarations
- Dependency sections: `"dependencies"` / `"devDependencies"` keys in `package.json`; `require` / `replace` blocks in `go.mod`; `[tool.poetry.dependencies]` in `pyproject.toml`; `[dependencies]` in `Cargo.toml`
- SQL schema: files under `migrations/`, `schema.sql`, `*.migration.*`
- API contract: files under `openapi/`, `proto/`, `*.proto`, `*.graphql`

## Detection mechanics

- `git diff -U0` over working tree + staged
- Simple regex rules per language — no AST parsing
- False negatives (missed valid fast-path) → degrade to feature-path (safe)
- False positives (structural change leaked through) → risk mitigated by narrow allowlist

## Output on fast-path trigger

```
Fast-path: harness-quick (1 file, <10 lines, docs/config only)
Use /feature to opt into full workflow if needed.
```
```

- [ ] **Step 5: Write profile-entry/references/task-type-contract.md**

File: `/Users/twelve/Music/myskills/profile-entry/references/task-type-contract.md`

```markdown
# Cross-Pack Task-Type Contract

Any skill pack implementing alternative task-type skills (e.g., `company-quick`, `company-feature`) MUST conform to this contract. Validated by `tools/harness-pack-test`.

## Required inputs each sub-skill accepts

- Current working directory (`pwd`)
- Subtask description (plain text from user)
- Resolved aggression mode (`conservative` | `standard` | `aggressive`)
- Resolved hard_floor list (subset of `[auto_push, force_push, destructive_ops, auto_merge]`)
- Optional `.harness-context.json` for tech-stack info

## Required outputs each sub-skill produces

- Git commit(s) on current branch
- Mode-respecting side effects: `conservative` never pushes; hard_floor items never performed
- Final summary (one paragraph) to the user

## Required behaviors

1. **Honor hard_floor strictly**: if `auto_push` in hard_floor, the sub-skill MUST NOT run `git push`. Even if the user asks. User can push manually after review.
2. **Mode echo discipline**: echo mode only on entry transition (first turn under this sub-skill); stay silent in subsequent turns until another transition.
3. **Memory observation**: write one `claude-mem` observation per task completion.
4. **No implicit state**: do not rely on session-persistent variables; re-read `.harness-context.json` and profile config each invocation.

## Validation via harness-pack-test

Run:
```bash
./tools/harness-pack-test ~/.claude/profiles/<name>.yml
```

The script exits non-zero if the pack's declared sub-skills violate any of the above.
```

- [ ] **Step 6: Write profile-entry/skill.md**

File: `/Users/twelve/Music/myskills/profile-entry/skill.md`

```markdown
---
name: profile-entry
description: >
  Entry point for code tasks. Reads .harness-profile marker or registered profile matchers,
  applies structural fast-path, resolves precedence (profile hard-floor > invocation flag >
  profile default > conservative), and loads exactly ONE leaf sub-skill. Does not execute
  code itself. Two-layer dispatch: task-dispatcher → profile-entry → leaf sub-skill.
  Triggered for any code development task after task-dispatcher decomposition.
---

# profile-entry — Code Task Router

Thin internal router. Never executes code; only resolves which sub-skill to load.

## Routing procedure (exact order)

1. **Profile resolution**
   - Check `<repo-root>/.harness-profile`. If present → read profile name → validate against registry (see `references/profiles.md`). On stale-marker detection → warn but honor.
   - Else: run matchers from `~/.claude/profiles/*.yml`. Pick highest priority; break ties by specificity. Disclose result in first response line:
     ```
     Detected profile: <name> (matched: <matcher-type> <pattern>, priority <n>)
     Override: /profile <name>
     ```
   - Nothing matched beyond `default` → use `default`.

2. **Fast-path check** (only if no explicit task-type flag in user message)
   See `references/fast-path.md`. If match → task_type = `quick`, emit fast-path notice.

3. **Task-type resolution**
   - Fast-path result wins if triggered
   - Else: explicit flag (`/quick` `/fix` `/refactor`) wins
   - Else: profile default task_type (`feature`)

4. **Mode resolution** (see `references/precedence.md`)
   - Start with profile `default_mode`
   - Apply invocation flag (`/yolo` → aggressive, `/safe` → conservative)
   - Intersect with profile `hard_floor` — any flag increase blocked by hard_floor → emit loud override message (format in `references/precedence.md`)

5. **Leaf skill load**
   - Look up `<profile>.task_types[<task_type>]` → name of leaf skill
   - Invoke `Skill(<leaf-skill>)` — that skill owns execution from here

## Disclosure discipline

Announcements emitted only on transitions:
- Profile detection (first turn in new profile / new session)
- Task-type override or fast-path downshift
- Mode override / hard-floor conflict

Subsequent turns in same profile + same mode: silent.

## What this skill does NOT do

- Write code
- Run tests
- Commit anything
- Invoke Skill for multiple candidate sub-skills
- Semantically classify tasks via LLM judgment

## References

- [profiles.md](references/profiles.md) — registry schema + matcher types
- [precedence.md](references/precedence.md) — single precedence rule
- [fast-path.md](references/fast-path.md) — structural fast-path allowlist
- [task-type-contract.md](references/task-type-contract.md) — cross-pack contract
```

- [ ] **Step 7: Verify structure**

```bash
ls /Users/twelve/Music/myskills/profile-entry/ /Users/twelve/Music/myskills/profile-entry/references/
wc -l /Users/twelve/Music/myskills/profile-entry/skill.md
```

Expected: skill.md ≤ 120 lines; 4 reference files in references/.

- [ ] **Step 8: Commit**

```bash
cd /Users/twelve/Music/myskills
git add profile-entry/
git commit -m "feat(profile-entry): add routing skill + references

Thin entry point: resolve profile → fast-path → task type → mode,
then load exactly one leaf sub-skill. Does not execute code."
```

---

### Task 3: harness-pack-test validation script

**Files:**
- Create: `tools/harness-pack-test`
- Create: `tools/fixtures/pack-test/README.md`

- [ ] **Step 1: Create tools directory**

```bash
mkdir -p /Users/twelve/Music/myskills/tools/fixtures/pack-test
```

- [ ] **Step 2: Write the failing test — prepare a malformed fixture**

File: `/Users/twelve/Music/myskills/tools/fixtures/pack-test/bad-profile.yml`

```yaml
# Intentionally malformed: missing task_types.feature
name: bad-profile
description: For testing harness-pack-test rejection
detection:
  priority: 5
  matchers:
    - type: always
      pattern: "*"
entry_skill: profile-entry
task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  # feature intentionally missing
  refactor: harness-refactor
default_mode: standard
hard_floor: []
```

File: `/Users/twelve/Music/myskills/tools/fixtures/pack-test/good-profile.yml`

```yaml
name: good-profile
description: Valid profile for harness-pack-test happy path
detection:
  priority: 5
  matchers:
    - type: always
      pattern: "*"
entry_skill: profile-entry
task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor
default_mode: standard
hard_floor: []
```

- [ ] **Step 3: Write harness-pack-test script**

File: `/Users/twelve/Music/myskills/tools/harness-pack-test`

```bash
#!/usr/bin/env bash
# harness-pack-test — validate a profile YAML against the task-type contract.
# Usage: harness-pack-test <profile-path>
# Exits 0 on pass, non-zero on failure. Prints findings to stderr.

set -euo pipefail

REQUIRED_TASK_TYPES=(quick bugfix feature refactor)
VALID_MODES=(conservative standard aggressive)
VALID_FLOOR=(auto_push force_push destructive_ops auto_merge)

if [ $# -ne 1 ]; then
  echo "usage: harness-pack-test <profile-yaml-path>" >&2
  exit 2
fi

profile="$1"
if [ ! -f "$profile" ]; then
  echo "error: profile file not found: $profile" >&2
  exit 2
fi

# Dependency check
if ! command -v yq >/dev/null 2>&1; then
  echo "error: yq required. Install via 'brew install yq' or equivalent." >&2
  exit 2
fi

fail=0
warn() { echo "WARN: $*" >&2; }
err()  { echo "FAIL: $*" >&2; fail=$((fail + 1)); }

# 1. Required top-level keys
for key in name description detection entry_skill task_types default_mode hard_floor; do
  if [ "$(yq -r ".$key // \"__MISSING__\"" "$profile")" = "__MISSING__" ]; then
    err "missing required key: $key"
  fi
done

# 2. task_types coverage
for tt in "${REQUIRED_TASK_TYPES[@]}"; do
  v="$(yq -r ".task_types.$tt // \"__MISSING__\"" "$profile")"
  if [ "$v" = "__MISSING__" ]; then
    err "task_types.$tt is required"
  fi
done

# 3. default_mode in allowed set
mode="$(yq -r '.default_mode' "$profile")"
ok=0
for m in "${VALID_MODES[@]}"; do
  [ "$mode" = "$m" ] && ok=1
done
[ "$ok" = 1 ] || err "default_mode '$mode' not in [${VALID_MODES[*]}]"

# 4. hard_floor entries all valid
floor_count="$(yq -r '.hard_floor | length' "$profile")"
i=0
while [ "$i" -lt "$floor_count" ]; do
  item="$(yq -r ".hard_floor[$i]" "$profile")"
  ok=0
  for f in "${VALID_FLOOR[@]}"; do
    [ "$item" = "$f" ] && ok=1
  done
  [ "$ok" = 1 ] || err "hard_floor[$i]='$item' not in [${VALID_FLOOR[*]}]"
  i=$((i + 1))
done

# 5. entry_skill must be 'profile-entry'
es="$(yq -r '.entry_skill' "$profile")"
[ "$es" = "profile-entry" ] || err "entry_skill must be 'profile-entry', got '$es'"

# 6. detection.priority is integer
pri="$(yq -r '.detection.priority' "$profile")"
case "$pri" in
  ''|*[!0-9]*) err "detection.priority must be non-negative integer, got '$pri'" ;;
esac

# 7. at least one matcher
m_count="$(yq -r '.detection.matchers | length' "$profile")"
[ "$m_count" -ge 1 ] || err "detection.matchers requires at least one entry"

if [ "$fail" -gt 0 ]; then
  echo "FAILED: $fail issue(s) in $profile" >&2
  exit 1
fi

echo "OK: $profile passed harness-pack-test"
exit 0
```

- [ ] **Step 4: Make executable and run against good fixture**

```bash
chmod +x /Users/twelve/Music/myskills/tools/harness-pack-test
/Users/twelve/Music/myskills/tools/harness-pack-test /Users/twelve/Music/myskills/tools/fixtures/pack-test/good-profile.yml
echo "Exit: $?"
```

Expected: `OK: .../good-profile.yml passed harness-pack-test` + `Exit: 0`

- [ ] **Step 5: Run against bad fixture, expect failure**

```bash
/Users/twelve/Music/myskills/tools/harness-pack-test /Users/twelve/Music/myskills/tools/fixtures/pack-test/bad-profile.yml
echo "Exit: $?"
```

Expected: `FAIL: task_types.feature is required` on stderr + `Exit: 1`

- [ ] **Step 6: Validate real profiles**

```bash
/Users/twelve/Music/myskills/tools/harness-pack-test ~/.claude/profiles/default.yml
/Users/twelve/Music/myskills/tools/harness-pack-test ~/.claude/profiles/harness.yml
/Users/twelve/Music/myskills/tools/harness-pack-test ~/.claude/profiles/company.yml.template
```

Expected: all three `OK:` exit 0. If `company.yml.template` fails, adjust template to be schema-valid (its REPLACE_ME placeholders must be valid strings, which they are).

- [ ] **Step 7: Write fixture README**

File: `/Users/twelve/Music/myskills/tools/fixtures/pack-test/README.md`

```markdown
# harness-pack-test fixtures

- `good-profile.yml` — valid profile; passes all checks
- `bad-profile.yml` — missing required `task_types.feature`; must fail

Add more fixtures as new contract rules are added to `harness-pack-test`.
```

- [ ] **Step 8: Commit**

```bash
cd /Users/twelve/Music/myskills
git add tools/
git commit -m "feat(tools): add harness-pack-test profile validator

Validates profile YAML against task-type contract: required keys,
task_types coverage, valid mode, valid hard_floor entries, entry_skill
pinned to profile-entry. Ships with good + bad fixtures."
```

---

### Task 4: Extract harness-common from existing harness-workflow

**Files:**
- Create: `harness-common/skill.md`
- Create: `harness-common/references/memory-contract.md`
- Create: `harness-common/references/project-detection.md`
- Create: `harness-common/references/templates.md`
- Create: `harness-common/references/phase-init.md`
- Create: `harness-common/references/hooks.md`

- [ ] **Step 1: Create directory and copy existing references**

```bash
cd /Users/twelve/Music/myskills
mkdir -p harness-common/references
cp harness-workflow/references/memory.md harness-common/references/memory-contract.md
cp harness-workflow/references/project-detection.md harness-common/references/project-detection.md
cp harness-workflow/references/templates.md harness-common/references/templates.md
cp harness-workflow/references/hooks.md harness-common/references/hooks.md
cp harness-workflow/references/memory-migrations.md harness-common/references/memory-migrations.md
cp harness-workflow/references/reviewer-integration.md harness-common/references/reviewer-integration.md
```

- [ ] **Step 2: Write phase-init.md by extracting Phase 1-4 from current harness-workflow/skill.md**

File: `/Users/twelve/Music/myskills/harness-common/references/phase-init.md`

```markdown
# Phase Initialization Reference

Extracted from `harness-workflow/skill.md` Phase 1-4. Invoked by `--init` / `--adopt` flows and referenced by all `harness-*` sub-skills for shared infra setup.

## Phase 1: Global Infrastructure (one-time per machine)

Multi-project shared. Skip if `~/.claude/hooks/` already populated.

### 1.1 Plugins (3 required)

| Plugin | Marketplace | Role |
|------|-------------|-----------|
| `claude-mem@thedotmack` | `thedotmack/claude-mem` | Per-task observation write; mem-search for recall |
| `codex@openai-codex` | `openai/codex-plugin-cc` | Cross-model code review (Stage 5 in harness-feature) |
| `superpowers@claude-plugins-official` | Anthropic official | Planning + review skills |

### 1.2 Hooks (7)

See [hooks.md](hooks.md) for full templates and settings.json wiring.

### 1.3 MCP

```json
{
  "mcpServers": {
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp@latest"] },
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest", "--browser", "chromium", "--headless"] }
  }
}
```

## Phase 2: Project-Level Config

1. Run project detection → write `.harness-context.json` (see [project-detection.md](project-detection.md))
2. Create persistent files:

```bash
mkdir -p docs/superpowers/{plans,specs}
```

| File | Purpose | Update timing |
|------|---------|---------------|
| `CLAUDE.md` | Project rules, ADRs, coding standards | Architecture changes |
| `docs/STATE.json` | Round progress, pendingRounds, features, knownIssues | End of every task |
| `docs/DESIGN.md` | VI system / API spec (project-type-dependent) | New patterns added |
| `docs/WALKTHROUGH.md` | Activity log | End of every task |

See [templates.md](templates.md) for starting content.

## Phase 3: Memory Contract Initialization

See [memory-contract.md](memory-contract.md) for `.harness-memory.yml` schema + `docs/memory/` scaffold.

## Phase 4: Validation + Initial Commit

```bash
ls CLAUDE.md docs/STATE.json docs/DESIGN.md docs/WALKTHROUGH.md docs/memory/.harness-memory.yml
echo ".harness-status.json" >> .gitignore
echo ".harness-context.json" >> .gitignore
git add CLAUDE.md docs/ .gitignore
git commit -m "chore: initialize harness engineering environment"
```

## --adopt mode

For each persistent file: exists → check missing sections → prompt to fill; absent → create from template. `docs/memory/` never overwritten; only missing markers appended.

## --maintain mode

Drift check only. Does NOT rerun Phase 1-3. See `harness-workflow/references/maintenance.md` for drift detection logic.
```

- [ ] **Step 3: Write harness-common/skill.md**

File: `/Users/twelve/Music/myskills/harness-common/skill.md`

```markdown
---
name: harness-common
description: >
  Shared infrastructure for harness-* sub-skills: Phase 1-4 initialization
  (global hooks, MCP, project detection, persistent files, memory contract).
  Not user-facing. Invoked by harness-quick/bugfix/feature/refactor via
  reference lookup, and directly by /harness-workflow --init / --adopt /
  --maintain passthroughs.
---

# harness-common — Shared Infrastructure

Not a standalone workflow. Sub-skills reference this module via `see references/<topic>.md` rather than duplicate init logic.

## When this skill is directly invoked

- `--init` passthrough from `harness-workflow`: run Phase 1 → Phase 2 → Phase 3 → Phase 4 in sequence
- `--adopt`: Phase 2 only, with existing-file protection
- `--maintain`: drift check only

## When referenced by sub-skills

All `harness-*` task-type skills inherit these behaviors by referencing this module:

- `.harness-context.json` presence and freshness
- `docs/STATE.json` format and update cadence
- `docs/memory/` layout and `claude-mem` observation schema
- `CLAUDE.md` / `WALKTHROUGH.md` update protocol

A sub-skill that finds `docs/STATE.json` missing MUST NOT invent format; it MUST delegate to `harness-common --adopt`.

## References

- [phase-init.md](references/phase-init.md) — Phase 1-4 detail
- [memory-contract.md](references/memory-contract.md) — `.harness-memory.yml` schema
- [project-detection.md](references/project-detection.md) — tech-stack detection rules
- [templates.md](references/templates.md) — CLAUDE.md / STATE.json / DESIGN.md / WALKTHROUGH.md starting templates
- [hooks.md](references/hooks.md) — 7 hook templates + settings.json
- [memory-migrations.md](references/memory-migrations.md) — schema migration strategy
- [reviewer-integration.md](references/reviewer-integration.md) — strict-reviewer calling protocol
```

- [ ] **Step 4: Verify**

```bash
ls /Users/twelve/Music/myskills/harness-common/ /Users/twelve/Music/myskills/harness-common/references/
wc -l /Users/twelve/Music/myskills/harness-common/skill.md
```

Expected: `skill.md` ≤ 80 lines; 7 reference files in references/.

- [ ] **Step 5: Commit**

```bash
cd /Users/twelve/Music/myskills
git add harness-common/
git commit -m "feat(harness-common): extract shared infrastructure layer

Phase 1-4 init + memory contract + project detection + templates + hooks
moved out of monolithic harness-workflow. Sub-skills reference this module
to inherit init protocols without duplication."
```

---

### Task 5: harness-quick sub-skill

**Files:**
- Create: `harness-quick/skill.md`

- [ ] **Step 1: Create directory**

```bash
mkdir -p /Users/twelve/Music/myskills/harness-quick
```

- [ ] **Step 2: Write skill.md**

File: `/Users/twelve/Music/myskills/harness-quick/skill.md`

```markdown
---
name: harness-quick
description: >
  1-file / <10-line quick-edit path. No PRD, no architect, no plan doc.
  Edit → verify → commit → write memory observation. Used when profile-entry's
  structural fast-path triggers, or when user explicitly flags /quick.
  Honors profile hard_floor strictly (e.g., no auto_push in company profile).
---

# harness-quick — Lightweight Edit Path

No ceremony. For typos, variable renames, single-line config tweaks, doc fixes.

## Preconditions

Invoked by `profile-entry` after it has resolved:

- Profile name
- Aggression mode (already intersected with hard_floor)
- Target task description

Assumes `.harness-context.json` exists. If missing → delegate to `harness-common --adopt` first, then resume.

## Procedure

1. **Read current state** of target file(s)
2. **Apply edit** directly (Edit tool)
3. **Verify**: if target is source, run type check from `.harness-context.json.typeCheckCommand`; if docs/config, skip
4. **Commit** with message format:
   ```
   <scope>: <one-line change>
   ```
   Scope: `docs` | `config` | `fix` | `chore` depending on file type.
5. **Write memory observation** via `claude-mem` — include: file changed, 1-line rationale, commit SHA
6. **Mode-respecting side effects**:
   - `conservative` / profile hard_floor includes `auto_push`: stop after commit. Tell user: "Committed locally. Push when ready."
   - `standard`: stop after commit. Push is a separate user action.
   - `aggressive`: push if hard_floor permits and remote tracks current branch.

## What this skill does NOT do

- Create plan docs
- Run full test suite (only type check if applicable)
- Invoke reviewer / QA / security sub-skills
- Edit multiple files (>1 file → bounce back to profile-entry with downgrade prompt: "Multi-file change detected — run with /fix or no flag?")
- Touch architecture / schema / interface (caught by fast-path allowlist; if invoked anyway, refuse and prompt for feature path)

## References

- [../harness-common/references/phase-init.md](../harness-common/references/phase-init.md)
- [../harness-common/references/memory-contract.md](../harness-common/references/memory-contract.md)
- [../profile-entry/references/task-type-contract.md](../profile-entry/references/task-type-contract.md)
```

- [ ] **Step 3: Verify**

```bash
wc -l /Users/twelve/Music/myskills/harness-quick/skill.md
```

Expected: ≤ 60 lines.

- [ ] **Step 4: Commit**

```bash
cd /Users/twelve/Music/myskills
git add harness-quick/
git commit -m "feat(harness-quick): lightweight 1-file edit path

No ceremony for typos / rename / config / doc tweaks. Edit → verify →
commit → memory. Auto-downshifted by profile-entry fast-path or via
explicit /quick flag."
```

---

### Task 6: harness-bugfix sub-skill

**Files:**
- Create: `harness-bugfix/skill.md`

- [ ] **Step 1: Create directory**

```bash
mkdir -p /Users/twelve/Music/myskills/harness-bugfix
```

- [ ] **Step 2: Write skill.md**

File: `/Users/twelve/Music/myskills/harness-bugfix/skill.md`

```markdown
---
name: harness-bugfix
description: >
  Bug investigation → reproduction → fix → regression test. Delegates root-cause
  investigation to `investigate` skill when available. Every bugfix produces
  at least one failing test first that the fix turns green. Used when user
  flags /fix or profile task_type resolution picks bugfix.
---

# harness-bugfix — Investigate → Fix → Regression-Test

No new feature. Existing behavior is wrong; make it right.

## Preconditions

Same as all harness-* sub-skills: invoked by profile-entry with resolved profile, mode, description. `.harness-context.json` must exist.

## Procedure

1. **Reproduce first**
   - Write or identify a test that demonstrates the bug
   - Run the test — it MUST fail, confirming reproduction
   - If you can't reproduce, stop and ask user for repro steps. Do NOT guess.

2. **Investigate root cause**
   - Invoke `investigate` skill for structured hypothesis testing (4-stage: investigate → pattern → verify → fix)
   - 3 hypothesis failures → escalate to user, don't continue silent hypothesis loop

3. **Fix at root**
   - Do not patch symptom. Do not add defensive code around the bug. Fix the cause.
   - Minimal diff: change only what's needed to make the failing test pass.

4. **Add regression test**
   - The reproduction test IS the regression test. Keep it.
   - Add it in the appropriate location per project conventions.

5. **Verify**
   - Run the failing test → now passes
   - Run full test suite in the affected module — all green
   - Type check from `.harness-context.json.typeCheckCommand`

6. **Commit**
   - Two commits preferred: (a) regression test (failing, via `--allow-empty`-style marker), (b) fix. Many projects accept squashed single commit — follow project convention from CLAUDE.md.

7. **Mode-respecting side effects** (see profile-entry precedence)

8. **Memory observation**: include bug symptom, root cause, files touched, commit SHAs

## Escalation triggers

- Cannot reproduce within 30 minutes of attempt → stop, ask user
- 3 failed root-cause hypotheses → stop, present evidence, ask user
- Fix requires architectural change → stop, upgrade to `harness-feature` via user-confirmed reroute

## References

- [../harness-common/references/phase-init.md](../harness-common/references/phase-init.md)
- [../profile-entry/references/task-type-contract.md](../profile-entry/references/task-type-contract.md)
- `investigate` skill (external — invoke via Skill tool)
```

- [ ] **Step 3: Verify**

```bash
wc -l /Users/twelve/Music/myskills/harness-bugfix/skill.md
```

Expected: ≤ 90 lines.

- [ ] **Step 4: Commit**

```bash
cd /Users/twelve/Music/myskills
git add harness-bugfix/
git commit -m "feat(harness-bugfix): investigation-first bugfix path

Reproduction test → investigate (via investigate skill) → root fix →
regression test kept. 3-hypothesis-limit before user escalation.
No symptom patching."
```

---

### Task 7: harness-feature sub-skill (inherit current 8-Stage body)

**Files:**
- Create: `harness-feature/skill.md`
- Create: `harness-feature/references/workflow.md` (moved from harness-workflow)
- Create: `harness-feature/references/autonomy.md` (moved)
- Create: `harness-feature/references/monitoring.md` (moved)
- Create: `harness-feature/references/parallel-agents.md` (moved)
- Create: `harness-feature/references/maintenance.md` (moved)
- Create: `harness-feature/references/protocols.md` (moved)
- Create: `harness-feature/prompts/pd-prompt.md` (moved)
- Create: `harness-feature/prompts/architect-prompt.md` (moved)
- Create: `harness-feature/prompts/qa-prompt.md` (moved)
- Create: `harness-feature/prompts/security-prompt.md` (moved)

- [ ] **Step 1: Create directory and copy references/prompts**

```bash
cd /Users/twelve/Music/myskills
mkdir -p harness-feature/references harness-feature/prompts
cp harness-workflow/references/workflow.md harness-feature/references/workflow.md
cp harness-workflow/references/autonomy.md harness-feature/references/autonomy.md
cp harness-workflow/references/monitoring.md harness-feature/references/monitoring.md
cp harness-workflow/references/parallel-agents.md harness-feature/references/parallel-agents.md
cp harness-workflow/references/maintenance.md harness-feature/references/maintenance.md
cp harness-workflow/references/protocols.md harness-feature/references/protocols.md
cp harness-workflow/prompts/pd-prompt.md harness-feature/prompts/pd-prompt.md
cp harness-workflow/prompts/architect-prompt.md harness-feature/prompts/architect-prompt.md
cp harness-workflow/prompts/qa-prompt.md harness-feature/prompts/qa-prompt.md
cp harness-workflow/prompts/security-prompt.md harness-feature/prompts/security-prompt.md
```

- [ ] **Step 2: Write skill.md**

File: `/Users/twelve/Music/myskills/harness-feature/skill.md`

```markdown
---
name: harness-feature
description: >
  Full 8-Stage feature development workflow: need-analysis → architecture-review →
  planning → implementation → spec-review → quality-review → QA → security → wrap.
  Default task type when no flag or fast-path triggers. Inherits Phase 1-4 init
  from harness-common. Honors profile hard_floor (company profile blocks auto_push).
---

# harness-feature — 8-Stage Feature Workflow

Full ceremony. For new features, new subsystems, cross-module changes.

## Preconditions

Invoked by profile-entry with resolved profile / mode / description. `.harness-context.json` + `docs/STATE.json` must exist (bootstrap via `harness-common --adopt` if missing).

## 8-Stage Flow

```
Round N
 Stage 0  Need analysis     → team-pd prompt (see prompts/pd-prompt.md)
 Stage 1  Architecture      → team-architect prompt (see prompts/architect-prompt.md)
 Stage 2  Planning          → superpowers:writing-plans (docs/superpowers/plans/round-N.md)
 Stage 3  Implementation    → superpowers:subagent-driven-development
 Stage 4  Spec review       → strict-reviewer (schema: spec)
 Stage 5  Quality review    → codex + code-reviewer via strict-reviewer
 Stage 6  QA testing        → team-qa prompt (see prompts/qa-prompt.md)
 Stage 7  Security review   → team-security prompt (see prompts/security-prompt.md)
 Stage 8  Wrap              → STATE.json / WALKTHROUGH / memory / commit
                             (push gated on mode + hard_floor)
```

Full stage-by-stage details: [references/workflow.md](references/workflow.md).

## Task sizing (within feature path)

- **S**: 1-3 files, no architecture change → Stages 2 → 3 → 4 → 5 → 8
- **M**: new module, moderate → Stages 0 → 2 → 3 → 4 → 5 → 6 → 8
- **L**: cross-module, new subsystem → Stages 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
- **XL**: multi-subsystem → split into multiple Rounds, each at M/L (see [references/workflow.md](references/workflow.md) for XL split rules)

## Mode-respecting wrap (Stage 8)

Same gates apply as other sub-skills:
- `conservative` or `auto_push` in hard_floor: commit only, explicit "push when ready" message
- `standard`: commit, confirm before push
- `aggressive` (when allowed): auto-push + `--no-verify` still NEVER (hook-enforced)

## References

- [workflow.md](references/workflow.md) — full stage detail
- [autonomy.md](references/autonomy.md) — autonomous decision tree
- [monitoring.md](references/monitoring.md) — heartbeat + progress reporting
- [parallel-agents.md](references/parallel-agents.md) — Stage 3 parallel dispatch
- [maintenance.md](references/maintenance.md) — drift detection
- [protocols.md](references/protocols.md) — inter-stage communication
- [../harness-common/references/phase-init.md](../harness-common/references/phase-init.md)
- [../profile-entry/references/task-type-contract.md](../profile-entry/references/task-type-contract.md)

## Stage Prompt Templates

| Stage | Prompt |
|-------|--------|
| Stage 0 | [prompts/pd-prompt.md](prompts/pd-prompt.md) |
| Stage 1 | [prompts/architect-prompt.md](prompts/architect-prompt.md) |
| Stage 6 | [prompts/qa-prompt.md](prompts/qa-prompt.md) |
| Stage 7 | [prompts/security-prompt.md](prompts/security-prompt.md) |
```

- [ ] **Step 3: Verify**

```bash
ls /Users/twelve/Music/myskills/harness-feature/ /Users/twelve/Music/myskills/harness-feature/references/ /Users/twelve/Music/myskills/harness-feature/prompts/
wc -l /Users/twelve/Music/myskills/harness-feature/skill.md
```

Expected: skill.md ≤ 160 lines; 6 references + 4 prompts.

- [ ] **Step 4: Commit**

```bash
cd /Users/twelve/Music/myskills
git add harness-feature/
git commit -m "feat(harness-feature): full 8-Stage feature workflow

Inherits current harness-workflow 8-Stage body (Stage 0-8 + S/M/L/XL
sizing). References and prompts migrated from harness-workflow/.
Mode-respecting wrap honors profile hard_floor for push gating."
```

---

### Task 8: harness-refactor sub-skill

**Files:**
- Create: `harness-refactor/skill.md`

- [ ] **Step 1: Create directory**

```bash
mkdir -p /Users/twelve/Music/myskills/harness-refactor
```

- [ ] **Step 2: Write skill.md**

File: `/Users/twelve/Music/myskills/harness-refactor/skill.md`

```markdown
---
name: harness-refactor
description: >
  Behavior-preserving code reshape. Baseline capture (tests + behavior snapshot)
  → incremental plan with tiny commits → continuous verification → final
  comparison against baseline. No new behavior; failed comparison blocks wrap.
  Used when user flags /refactor.
---

# harness-refactor — Behavior-Preserving Reshape

Code shape changes; behavior does not.

## Preconditions

Same as all sub-skills. Plus: project MUST have tests that exercise the code being refactored. If coverage is thin → STOP, first add characterization tests (via `harness-feature` S-size task), THEN refactor.

## Procedure

1. **Baseline capture**
   - Run full test suite from `.harness-context.json.testCommand` — all must pass. Record passing count.
   - Capture behavior snapshot: if app is CLI → record `--help` output; if API → record OpenAPI or similar; if UI → screenshot key flows (via `browse` skill if available)
   - Commit baseline marker: `chore(refactor): baseline snapshot for <scope>`

2. **Incremental plan**
   - Invoke `superpowers:writing-plans` for the refactor plan
   - Each task = one small commit that leaves tests green
   - No task allowed to break tests even transiently

3. **Execute**
   - Invoke `superpowers:subagent-driven-development` or `superpowers:executing-plans` per writing-plans output
   - After each task: run tests → all green. Red tests abort that task, revert, replan.

4. **Final comparison**
   - Re-run full test suite — count MUST match baseline (no added failures; new passing tests OK)
   - Re-capture behavior snapshot — diff against baseline. Differences MUST be "none" or user-approved list.
   - If comparison fails → block Stage 8 wrap, report, roll back to baseline

5. **Mode-respecting wrap** (see profile-entry precedence)

6. **Memory observation**: pre/post metrics (LoC delta, cyclomatic delta if available), files touched, behavior snapshot diff result

## What refactor does NOT do

- Add features
- Fix bugs discovered mid-refactor (escalate to separate `harness-bugfix` run; record as followup in STATE.json)
- Change external API / schema / interface
- Skip baseline capture "because the code is short"

## References

- [../harness-common/references/phase-init.md](../harness-common/references/phase-init.md)
- [../profile-entry/references/task-type-contract.md](../profile-entry/references/task-type-contract.md)
- `superpowers:writing-plans`, `superpowers:subagent-driven-development`, `superpowers:executing-plans`
```

- [ ] **Step 3: Verify**

```bash
wc -l /Users/twelve/Music/myskills/harness-refactor/skill.md
```

Expected: ≤ 110 lines.

- [ ] **Step 4: Commit**

```bash
cd /Users/twelve/Music/myskills
git add harness-refactor/
git commit -m "feat(harness-refactor): behavior-preserving reshape path

Baseline capture → incremental plan → continuous verification → final
comparison. Failed comparison blocks wrap. Bug discoveries escalate
to harness-bugfix, not silent fix."
```

---

### Task 9: Reshape harness-workflow to thin profile-declaration stub

**Files:**
- Modify: `harness-workflow/skill.md` — rewrite entirely

- [ ] **Step 1: Read current harness-workflow/skill.md to preserve `--init` / `--adopt` / `--maintain` command surface**

```bash
head -20 /Users/twelve/Music/myskills/harness-workflow/skill.md
```

- [ ] **Step 2: Write reshaped skill.md**

File: `/Users/twelve/Music/myskills/harness-workflow/skill.md`

```markdown
---
name: harness-workflow
description: >
  Legacy entry point for the harness profile. Users who type /harness-workflow
  or use trigger phrases like "做XXX/加XXX/修XXX/改XXX/实现XXX" land here.
  This skill now forwards to profile-entry for routing, and provides direct
  passthroughs for /harness-workflow --init | --adopt | --maintain | --next.
  For most users: prefer explicit /quick /fix /refactor flags, or just state
  the task — profile-entry will route.
---

# harness-workflow — Harness Profile Entry (Legacy Shim)

This skill has been reshaped. The monolithic 8-Stage body now lives in `harness-feature/`. Phase 1-4 init lives in `harness-common/`. Quick / bugfix / refactor paths live in their own skills. The original trigger surface survives here as a thin passthrough.

## Behavior

### Bare `/harness-workflow`

1. Print current profile (via `profile-entry` routing)
2. Print current `docs/STATE.json` round + next action
3. Remind user of available flags: `/quick /fix /refactor /yolo /safe`

### `/harness-workflow --init`

Delegate to `harness-common` Phase 1-4. Exits when init complete.

### `/harness-workflow --adopt`

Delegate to `harness-common` Phase 2 with existing-file protection.

### `/harness-workflow --maintain`

Delegate to `harness-common` drift-check only. No init.

### `/harness-workflow --next` (legacy)

Equivalent to invoking a new development task with no flag. Delegate to `profile-entry`.

### Trigger phrase (no flag, user says "做XXX" / "加XXX" / "修XXX" / "改XXX" / "实现XXX")

Delegate to `profile-entry`. Profile-entry will:
- Detect current profile
- Apply structural fast-path (may auto-downshift to harness-quick)
- Resolve task type (default: feature) and mode
- Load exactly one leaf sub-skill

## What changed

| Before | After |
|----|----|
| Monolithic 363-line skill with S/M/L/XL branches inline | Delegates to `profile-entry` → loads one leaf sub-skill |
| Phase 1-4 embedded here | Lives in `harness-common/` |
| 8-Stage body embedded here | Lives in `harness-feature/` |
| No separate quick/bugfix/refactor paths | `harness-quick/`, `harness-bugfix/`, `harness-refactor/` |
| No cross-project scenario support | Profile registry at `~/.claude/profiles/` with `default`, `harness`, and optional `company*` |

## References

- [Design spec](../docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md)
- [profile-entry](../profile-entry/skill.md)
- [harness-common](../harness-common/skill.md)
- [harness-feature](../harness-feature/skill.md)
- [harness-quick](../harness-quick/skill.md)
- [harness-bugfix](../harness-bugfix/skill.md)
- [harness-refactor](../harness-refactor/skill.md)
```

- [ ] **Step 3: Verify size**

```bash
wc -l /Users/twelve/Music/myskills/harness-workflow/skill.md
```

Expected: ≤ 90 lines (down from 363).

- [ ] **Step 4: Commit**

```bash
cd /Users/twelve/Music/myskills
git add harness-workflow/skill.md
git commit -m "refactor(harness-workflow): reshape to thin profile-entry shim

Legacy monolith gutted. /harness-workflow --init/--adopt/--maintain
preserved as passthroughs to harness-common. Trigger phrases forward
to profile-entry. 363 LoC → ~80 LoC."
```

---

### Task 10: Update task-dispatcher doc to reflect new architecture

**Files:**
- Modify: `task-dispatcher/skill.md:171-183`

- [ ] **Step 1: Read current section**

```bash
sed -n '170,185p' /Users/twelve/Music/myskills/task-dispatcher/skill.md
```

Expected to show the "与 harness-workflow 的关系" section.

- [ ] **Step 2: Replace the section**

Use Edit tool on `/Users/twelve/Music/myskills/task-dispatcher/skill.md`.

Replace:

```markdown
## 与 harness-workflow 的关系

| 层级 | 职责 | 谁负责 |
|------|------|--------|
| **外层分解**：用户消息有几件事要做？ | task-dispatcher |
| **内层开发**：这件代码任务怎么走 8-Stage？ | harness-workflow |

两者不冲突：
- task-dispatcher 负责「做什么」— 把消息拆成独立子任务
- harness-workflow 负责「怎么做」— 每个代码子任务走 Stage 0→8

**典型组合：** 用户消息包含 1 个代码任务 + 1 个调研任务 → task-dispatcher 派调研 agent（background），同时主 agent 用 harness-workflow 做代码任务。
```

With:

```markdown
## 与 profile-entry 的关系

| 层级 | 职责 | 谁负责 |
|------|------|--------|
| **外层分解**：用户消息有几件事要做？ | task-dispatcher |
| **内层路由**：每件代码任务走哪个 profile / 任务类型 / 自治模式？ | profile-entry |
| **内层执行**：具体走哪条工作流？ | profile-entry 加载的 leaf sub-skill（harness-quick / bugfix / feature / refactor 之一） |

两者不冲突：
- task-dispatcher 负责「做什么」— 把消息拆成独立子任务
- profile-entry 负责「由谁做 + 怎么做」— 决定 profile、task type、mode，加载唯一的 leaf sub-skill

**典型组合：** 用户消息包含 1 个代码任务 + 1 个调研任务 → task-dispatcher 派调研 agent（background），同时主 agent 调 profile-entry 路由代码任务到合适的 leaf sub-skill。

**旧调用惯性：** `/harness-workflow` 触发语句仍然有效 — `harness-workflow` 现在是 `profile-entry` 的 thin shim（见 [设计 spec](../docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md)）。
```

- [ ] **Step 3: Verify**

```bash
grep -n "profile-entry" /Users/twelve/Music/myskills/task-dispatcher/skill.md
```

Expected: several matches in the updated section.

- [ ] **Step 4: Commit**

```bash
cd /Users/twelve/Music/myskills
git add task-dispatcher/skill.md
git commit -m "docs(task-dispatcher): update harness relationship section

Reflects new profile-entry router sitting between task-dispatcher and
leaf sub-skills. harness-workflow now documented as shim."
```

---

### Task 11: Update README.md to document the new framework

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README**

```bash
cat /Users/twelve/Music/myskills/README.md
```

Note current structure and where to inject the new "Dispatch Framework" section.

- [ ] **Step 2: Insert new section**

Add a new section to README.md. Exact insertion point depends on current content; place after the skills table or right after the intro. Use Edit tool.

New section content:

```markdown
## Dispatch Framework (2026-04 redesign)

Entry path for code tasks:

```
user message
  ↓ task-dispatcher        (outer parallel/serial split)
  ↓ profile-entry          (single Skill load; routes internally)
  ↓ leaf sub-skill         (harness-quick | harness-bugfix | harness-feature | harness-refactor)
  ↓ execution
```

**Profiles** live at `~/.claude/profiles/`:
- `default.yml` — always-match fallback, conservative mode
- `harness.yml` — personal projects (Next.js / Go / Python), standard mode
- `company.yml.template` — stub for company projects; rename and fill in. Hardcoded `hard_floor: [auto_push, force_push, destructive_ops, auto_merge]`.

**Flags** (one-shot, no session persistence):
- Task type: `/quick` `/fix` `/refactor`
- Mode: `/yolo` (aggressive), `/safe` (conservative)

**Precedence:** `profile hard_floor > invocation flag > profile default > built-in conservative`.

**Validation:** `./tools/harness-pack-test <profile-path>` checks contract conformance.

**Design spec:** [docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md](docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md)
```

- [ ] **Step 3: Verify**

```bash
grep -n "Dispatch Framework" /Users/twelve/Music/myskills/README.md
```

Expected: one match showing the section heading.

- [ ] **Step 4: Commit**

```bash
cd /Users/twelve/Music/myskills
git add README.md
git commit -m "docs(readme): document new dispatch framework

New entry path, profile registry location, flags, precedence rule,
and pointer to full design spec."
```

---

### Task 12: End-to-end smoke test — 4 routing scenarios

**Files:**
- None (verification only)

- [ ] **Step 1: Scenario A — fast-path triggered**

Manually simulate by reading `profile-entry/references/fast-path.md`:

- Create a tiny branch: `git checkout -b smoke-fast-path-test`
- Edit `README.md` with a 2-line doc change
- Check `git diff --stat`
- Verify fast-path conditions satisfied (1 file, <10 lines, `.md` extension)
- Verify `profile-entry/skill.md` routing logic would pick `harness-quick`

```bash
git checkout -b smoke-fast-path-test
echo "<!-- smoke test line -->" >> README.md
git diff --stat README.md
```

Expected output: `1 file changed, 1 insertion(+)` — satisfies fast-path criteria.

- [ ] **Step 2: Scenario B — explicit /fix flag**

Per `profile-entry/skill.md` logic: `/fix` flag present → task_type = bugfix → load `harness-bugfix`.

Confirm by reading the routing block in `profile-entry/skill.md` and tracing the logic for input `"/fix login returns 401"`. Expected: bugfix path selected, no fast-path inspection (flag overrides fast-path).

- [ ] **Step 3: Scenario C — company profile hard-floor conflict**

Per `profile-entry/references/precedence.md`: user says `/yolo` in a profile with `auto_push` in hard_floor → mode downgraded, loud disclosure required.

Temporarily simulate by adding a company test profile:

```bash
cp ~/.claude/profiles/company.yml.template /tmp/smoke-company.yml
# edit /tmp/smoke-company.yml: replace REPLACE_ME with test values, name = "smoke-company"
./tools/harness-pack-test /tmp/smoke-company.yml
```

Expected: `OK: /tmp/smoke-company.yml passed harness-pack-test`.

Trace via `profile-entry/skill.md`: for input `"/yolo push this fix"` under `smoke-company` profile → mode conflict → loud output format per precedence.md.

- [ ] **Step 4: Scenario D — nothing matches, fall through to default**

Temporarily `cd /tmp && git init smoke-unknown-repo && cd smoke-unknown-repo` — none of `harness.yml` or `company*.yml` matchers hit → `default.yml` wins (priority=0, always-match).

```bash
cd /tmp && mkdir smoke-unknown && cd smoke-unknown && git init -q
# In Claude Code mentally trace profile-entry: no marker, no matchers hit except default → use default, mode=conservative
```

- [ ] **Step 5: Clean up smoke artifacts**

```bash
cd /Users/twelve/Music/myskills
git checkout main
git branch -D smoke-fast-path-test
rm -f /tmp/smoke-company.yml
rm -rf /tmp/smoke-unknown
```

- [ ] **Step 6: Commit — nothing to commit (smoke test is a read-only trace)**

Skip commit if no file changes remain. Verify with `git status`.

---

### Task 13: Final contract validation on real profiles

**Files:**
- None (validation only)

- [ ] **Step 1: Validate all three profiles**

```bash
cd /Users/twelve/Music/myskills
./tools/harness-pack-test ~/.claude/profiles/default.yml
./tools/harness-pack-test ~/.claude/profiles/harness.yml
./tools/harness-pack-test ~/.claude/profiles/company.yml.template
```

Expected: all three print `OK:` and exit 0.

- [ ] **Step 2: Verify skill files load (light lint via frontmatter check)**

```bash
for f in /Users/twelve/Music/myskills/{profile-entry,harness-common,harness-quick,harness-bugfix,harness-feature,harness-refactor,harness-workflow}/skill.md; do
  head -1 "$f"
  grep -c "^name:" "$f"
  grep -c "^description:" "$f"
  echo "---"
done
```

Expected for each: `---` first line, 1 `name:`, 1 `description:` line.

- [ ] **Step 3: Verify cross-references resolve**

```bash
cd /Users/twelve/Music/myskills
# Check relative refs from harness-quick to harness-common
ls harness-common/references/phase-init.md
ls harness-common/references/memory-contract.md
ls profile-entry/references/task-type-contract.md
ls profile-entry/references/fast-path.md
ls profile-entry/references/precedence.md
ls profile-entry/references/profiles.md
ls harness-feature/references/workflow.md
ls harness-feature/prompts/pd-prompt.md
```

Expected: all files exist (no `ls: cannot access`).

- [ ] **Step 4: Check LoC reduction**

```bash
cd /Users/twelve/Music/myskills
wc -l harness-workflow/skill.md profile-entry/skill.md harness-common/skill.md
```

Expected: 
- `harness-workflow/skill.md` ≤ 90
- `profile-entry/skill.md` ≤ 120
- `harness-common/skill.md` ≤ 80

Compare to original 363. Combined new entry footprint (harness-workflow + profile-entry + harness-common) ≤ 290 LoC of routing/infra, with leaf sub-skills only loaded on demand.

- [ ] **Step 5: No commit needed — validation only**

---

## Self-Review Notes (for the implementer)

Before declaring the plan complete, run this self-check:

1. **All 13 tasks land at a clean git state** — each task ends with a working tree + commit (or explicit "no commit needed")
2. **Nothing references missing files** — the cross-reference check in Task 13 Step 3 catches stale links
3. **The legacy `/harness-workflow` trigger phrases still work** — Task 9's reshape preserves them as delegation
4. **Profile YAML and pack-test fixtures match** — Task 1 + Task 3 validate together
5. **harness-feature inherits the full 8-Stage body verbatim** — Task 7 copies prompts and references; no content silently dropped

If any of the above fails post-implementation, fix forward. Do not declare complete with warnings.
