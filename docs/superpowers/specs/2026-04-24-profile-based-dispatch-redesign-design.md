# Profile-Based Dispatch Redesign — Design Spec

- **Date**: 2026-04-24
- **Status**: Approved-pending-user-review
- **Author**: Claude (Opus 4.7) + codex (3 adversarial rounds, converged)
- **Supersedes**: current monolithic `harness-workflow/skill.md` (363 LoC) internal S/M/L/XL branching

---

## Problem

The current entry-point for code tasks is a monolithic `harness-workflow` skill that:

1. Tries to cover every dev scenario (init, adopt, maintain, S/M/L/XL size gating, 8-Stage pipeline, memory contract, drift detection, hooks) in one 363-line file
2. Gets injected at session start, diluting model attention as the conversation grows
3. Cannot represent distinct **project scenarios** (personal vs company) with different default behaviors
4. Conflates three orthogonal concerns: which skill pack applies, which workflow variant to run, how aggressive the autonomy should be
5. Forces the same 8-Stage flow onto trivial single-line fixes, overkilling simple work

The adjacent `task-dispatcher` (298 LoC) does outer parallel/serial decomposition well but hands every code task wholesale to `harness-workflow`, with no inner dispatch.

## Goals

- Entry-point skill shrinks to ~80 LoC of routing logic only
- Scenarios dispatch cleanly to different skill packs (harness personal, company, future third-party)
- Trivial tasks skip ceremony automatically (deterministic, not LLM-guessed)
- Company compliance policies (e.g., never auto-push) cannot be bypassed by flags
- Architecture supports unknown future skill packs via a documented contract
- Framework stays simple and fast — no added layers without value

## Non-Goals

- Does NOT replace `task-dispatcher` (outer message-level splitter stays)
- Does NOT implement the company skill pack itself (a stub reserves the slot; actual pack developed separately)
- Does NOT try to semantically classify task types via LLM judgment
- Does NOT persist aggression mode across turns, CWDs, or sessions

---

## Architecture

### Two-layer dispatch

```
user message
  ↓
task-dispatcher              (unchanged — outer parallel/serial split)
  ↓ (per code subtask)
profile-entry                (new — ONE Skill load; internal routing logic only)
  │
  │ 1. Read .harness-profile marker (primary signal)
  │ 2. If missing → run registered matchers (fallback), disclose result
  │ 3. Structural fast-path check (deterministic, git-diff based)
  │ 4. Resolve precedence contract
  │ 5. Load exactly ONE leaf sub-skill
  ↓
leaf sub-skill               (harness-quick | harness-bugfix | harness-feature | harness-refactor)
  ↓
execution with aggression mode applied
```

**Why two layers, not four**: `profile-entry` performs all routing internally as plain text logic. Only after resolving which leaf sub-skill applies does it invoke `Skill(...)`. This keeps the "classification" cost under one Skill tool invocation while still presenting clean separation.

### Three orthogonal axes

| Axis | Decides | How resolved |
|----|----|----|
| **Profile** | Which skill pack owns execution (`harness` / `company` / `default` / future packs) | `.harness-profile` marker → fallback matchers → `default` |
| **Task type** | Which workflow variant within the profile (`quick` / `bugfix` / `feature` / `refactor`) | Structural fast-path → explicit flag (`/quick` `/fix` `/refactor`) → default `feature` |
| **Aggression mode** | How autonomous the execution is (`conservative` / `standard` / `aggressive`) | Hard-floor > invocation flag (`/yolo` `/safe`) > profile default > built-in conservative |

### Precedence contract (single rule)

```
profile hard-floor policy
  > per-invocation flag
  > profile config default
  > built-in conservative default
```

**Hard-floor > flag** is deliberate. Company profile's `auto_push=false` is a compliance floor; `/yolo` in a company repo must NOT bypass it. When the floor overrides a flag, `profile-entry` MUST emit:

```
Requested: /yolo
Effective: company-safe (profile policy: auto_push=false, destructive_ops=false)
Reason: company profile hard-floor
```

No silent overrides.

### Structural fast-path (determinism replaces LLM guessing)

Before considering explicit flags or defaults, run a deterministic check:

```
if no explicit task-type flag AND
   git diff --stat shows 1 file changed AND
   diff size < 10 lines AND
   no new file created AND
   target file matches fast-path allowlist
then silently route to harness-quick
else honor flag, else default to harness-feature
```

**Fast-path allowlist** (detection mechanics in `references/fast-path.md`):
- Extension in `{.md, .txt, .json, .yml, .yaml}` OR
- Target is source file AND diff does NOT modify: exported symbols, function signatures, type definitions, SQL schema, migration files, `package.json` / `go.mod` / `pyproject.toml` / `Cargo.toml` dependency sections

Detection uses `git diff -U0` plus simple regex rules per language (no AST). False negatives (missing a valid fast-path case) degrade gracefully to feature-path; false positives (routing a structural change to quick-path) are the risk, mitigated by keeping allowlist narrow and list documented.

This solves "user forgets `/quick` on trivial edits and gets heavy-path overkill" without semantic classification flakiness.

### Detection and marker validation

**Primary**: `.harness-profile` file at repo root, contents = profile name.

**Validation rules** (all must pass or emit warning):
1. Profile name must exist in registry (`~/.claude/profiles/<name>.yml`)
2. Profile's own fallback matcher rules must also match current repo (cross-check; catches stale markers after repo copy/rename)

On mismatch:
```
⚠ marker says 'harness' but repo doesn't match harness detection rules
  (current path: /Users/twelve/work/acme-corp/svc-x)
  best fallback match: 'company-acme'
  Continue with marker 'harness' or switch to 'company-acme'?
```

**Fallback matchers** when no marker:
- Matchers have explicit integer `priority` (higher wins)
- Ties broken by specificity (longer path glob beats shorter; git-remote match beats path-only)
- Still-tied → hard error, user must create `.harness-profile`

**Auto-match disclosure**: when fallback resolves a profile (no explicit marker), `profile-entry` announces in the first response line:
```
Detected profile: harness-personal (matched: path_glob ~/Music/myskills/**, priority 10)
Override: /profile <name>
```

### Aggression mode

Per-invocation flags only. No session persistence. No CWD-surviving state.

| Flag | Effect |
|----|----|
| `/yolo` | Request aggressive mode (subject to hard-floor) |
| `/safe` | Request conservative mode |
| `/quick` `/fix` `/refactor` | Task-type override + implies standard mode |

Profile config sets default mode per profile. Company profile hardcodes `hard_floor: [auto_push, force_push, destructive_ops]` — these specific settings cannot be lifted by flag.

**Mode echo discipline**: echo current mode only on these transitions:
- Profile detection (first turn of session/conversation in that profile)
- Flag override resolution
- Fast-path auto-downshift
- Hard-floor conflict

After a transition announcement, subsequent turns stay silent unless another transition occurs.

---

## File structure

```
myskills/                                     (repo root)
├── task-dispatcher/                          (unchanged)
│   └── skill.md                              298 LoC
├── profile-entry/                            (NEW — entry point)
│   ├── skill.md                              ~80 LoC routing logic
│   └── references/
│       ├── profiles.md                       profile registry schema + matcher rules
│       ├── precedence.md                     precedence contract reference
│       ├── fast-path.md                      structural fast-path criteria
│       └── task-type-contract.md             cross-pack sub-skill contract
├── harness-common/                           (NEW — extracted from current harness-workflow)
│   ├── skill.md                              ~80 LoC
│   └── references/
│       ├── memory-contract.md                (moved from harness-workflow/references)
│       ├── project-detection.md              (moved)
│       └── phase-init.md                     (extracted from current Phase 1-4)
├── harness-quick/                            (NEW)
│   └── skill.md                              ~50 LoC
├── harness-bugfix/                           (NEW)
│   └── skill.md                              ~80 LoC
├── harness-feature/                          (NEW — inherits current 8-Stage body)
│   ├── skill.md                              ~150 LoC
│   └── prompts/                              (moved from harness-workflow/prompts)
├── harness-refactor/                         (NEW)
│   └── skill.md                              ~100 LoC
├── harness-workflow/                         (RESHAPED — now a profile entry stub)
│   └── skill.md                              ~80 LoC — declares `harness` profile and forwards to profile-entry
└── (unchanged: investigate/, office-hours/, strict-reviewer/, team-*/)

~/.claude/profiles/                           (user-level registry)
├── default.yml                               always-match fallback, priority=0
├── harness.yml                               personal projects profile
└── company.yml.template                      STUB: schema + placeholder sub-skill paths, user fills later
```

### Profile YAML schema

```yaml
# ~/.claude/profiles/harness.yml
name: harness
description: Personal projects — Next.js / Go / Python

detection:
  priority: 10
  matchers:
    - type: path_glob
      pattern: "~/Music/myskills/**"
    - type: path_glob
      pattern: "~/Music/hummv/**"
    - type: git_remote_regex
      pattern: "github.com:TerryGSL/.*"

entry_skill: profile-entry   # always — profile entry fans out from here

task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor

default_mode: standard

hard_floor: []               # personal profile has no compliance floor
```

```yaml
# ~/.claude/profiles/company.yml.template (STUB)
name: company-<fill-in>
description: Company projects — strict review required

detection:
  priority: 20
  matchers:
    - type: path_glob
      pattern: "<your company repos path>"
    - type: git_remote_regex
      pattern: "<your company git host regex>"

entry_skill: profile-entry

task_types:
  quick: <company-quick-skill-placeholder>
  bugfix: <company-bugfix-skill-placeholder>
  feature: <company-feature-skill-placeholder>
  refactor: <company-refactor-skill-placeholder>

default_mode: conservative

hard_floor:
  - auto_push           # never auto-push, always require human review
  - force_push
  - destructive_ops
  - auto_merge
```

### Cross-pack task-type contract

Documented in `profile-entry/references/task-type-contract.md`. Any skill pack implementing alternative task-type skills must:

1. **Honor hard_floor**: never execute listed operations, regardless of request
2. **Observe mode echo conventions**: announce on required transitions, silent otherwise
3. **Accept standardized inputs**: current CWD, subtask description, resolved mode, optional `.harness-context.json`
4. **Produce standardized outputs**: commit(s) on the branch, mode-respecting side effects, final summary

Contract validation via `harness-pack-test` script (lives at `myskills/tools/harness-pack-test`, written in Bash + Node depending on fixture needs):
```bash
./tools/harness-pack-test ~/.claude/profiles/company.yml
# runs fixture inputs, asserts contract compliance, exits non-zero on violation
```

---

## Component responsibilities

### `profile-entry`

**Reads**: `.harness-profile`, `~/.claude/profiles/*.yml`, git state for fast-path

**Logic** (in order):
1. Marker lookup + validation (warn on stale/mismatch)
2. If no marker → run matchers by priority, pick highest, disclose
3. Structural fast-path check
4. Resolve task type: fast-path result → explicit flag → profile default (`feature`)
5. Resolve mode: hard-floor > flag > profile default > conservative
6. Emit mode/detection announcements if triggered
7. Invoke `Skill(<leaf_sub_skill>)` with resolved parameters

**Must NOT**: perform any code modification itself, perform semantic LLM classification, persist state across turns.

### `harness-common`

Shared infrastructure referenced by all `harness-*` sub-skills:
- Phase 1 (global infra setup — one-time)
- Phase 2 (project config + `.harness-context.json` detection)
- Phase 3 (memory contract init)
- Phase 4 (validation + initial commit)
- Drift detection + `--maintain` mode

Sub-skills reference this via `see references/harness-common/<topic>.md` rather than duplicating.

### `harness-quick`

1-line / 1-file / no-ceremony path. Just edit + commit. No PRD, no architect, no plan doc. Memory observation still written.

### `harness-bugfix`

- Step 1: investigate (invokes `investigate` skill)
- Step 2: reproduce
- Step 3: fix
- Step 4: add regression test
- Step 5: commit + memory observation

### `harness-feature`

Current 8-Stage body minus Phase init (moved to `harness-common`):
- Stage 0 PD → Stage 1 architect → Stage 2 plan → Stage 3 impl → Stage 4 spec-review → Stage 5 quality → Stage 6 QA → Stage 7 security → Stage 8 wrap

### `harness-refactor`

- Baseline capture (tests passing, behavior snapshot)
- Incremental plan (tiny commits)
- Execute with continuous verification
- Final comparison against baseline

### `harness-workflow` (reshaped)

Slimmed to `harness` profile's declared entry. Keeps the `/harness-workflow --init` / `--adopt` / `--maintain` commands as passthroughs to `harness-common`. Existing user muscle memory survives.

---

## Migration plan (summary — detailed plan in implementation stage)

1. Create `profile-entry/` with routing logic + references
2. Create `~/.claude/profiles/{default,harness}.yml` + `company.yml.template`
3. Extract `harness-common/` from current `harness-workflow`
4. Split current 8-Stage body into `harness-feature/`
5. Create `harness-quick/` `harness-bugfix/` `harness-refactor/`
6. Reshape `harness-workflow/skill.md` to profile declaration stub
7. Add `harness-pack-test` CLI for contract validation
8. Update root `README.md` to explain the new framework
9. Verify: existing `--init` / `--adopt` / `--maintain` flows unchanged end-user behavior

---

## Risks and mitigations

| Risk | Mitigation |
|----|----|
| Structural fast-path misfires on edge cases (e.g., small diff but schema change) | Fast-path criteria documented in `references/fast-path.md` with explicit exclusions; easy to tune |
| Marker validation warning becomes noisy after repo rename | Warning is informational, workflow continues; user can update or delete marker |
| Sub-skill cross-references to `harness-common` break if user accesses a sub-skill directly | Each sub-skill's top paragraph states "normally invoked via profile-entry; direct invocation supported but may skip init checks" |
| User forgets which profile they're in | Detection announcement on each profile transition; `/profile` flag with no args prints current profile |
| Adding a new skill pack requires editing multiple files | Compensated by contract test; pack author gets fast feedback |

---

## Out of scope for this spec

- Concrete company skill pack implementation (stub only)
- Hook-based session re-injection (deferred; profile-entry's on-demand Skill loading should replace most of its need)
- Claude Code plugin packaging (deferred; framework can be plugin-ified later without architectural change)

---

## Codex adversarial review record

Three rounds. Final convergence:

| Round | Issues raised | Resolution |
|----|----|----|
| 1 | 7 fundamental flaws (session-persistent yolo, 4-hop overhead, LLM task-type guessing, detection conflicts, wrap-not-replace, cold-start, no precedence contract) | Full redesign → v2 |
| 2 | 4 resolved, 3 partial (heavy-path default, matcher tie-break, cold start), 1 new hole (stale marker authority) | Targeted fixes → v3 |
| 3 | 6/7 sufficient, 1 remaining (explicit cold-start detection path) | F7 patch: default profile `always-match, priority=0` |

All codex session transcripts stored at `~/.codex/sessions/2026/04/24/*.jsonl`.
