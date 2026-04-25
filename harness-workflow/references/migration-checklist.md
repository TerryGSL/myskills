# Phase → CLI crosscheck

This file is the **single source of truth** (plan R5/T10 + R6/T3) that every
action from the original `harness-workflow/skill.md` Phase 1-4 has a corresponding
implementation point in the CLI or an explicit "stays in skill" justification.

If you add/remove a Phase action, update this file in the same commit. R6/T3
validator asserts no row is missing.

Legend:
- **CLI** = implemented as `harness <cmd>` command or a utility used by init/adopt/maintain.
- **skill** = stays as AI-driven skill logic (not a CLI responsibility).

---

## Phase 1 — Global infrastructure

| Original action | Status | Where |
|---|---|---|
| Plugin `claude-mem@thedotmack` install | skill | Global setup, user-level plugin install (outside project) |
| Plugin `codex@openai-codex` install | skill | Same |
| Plugin `superpowers@claude-plugins-official` install | skill | Same |
| 7 hooks setup (check-dangerous, check-secrets, post-edit-reminder, pre-compact-reminder, session-checklist, session-init-prompt, heartbeat-check) | skill | Hooks live in `~/.claude/hooks/`, user-level not project-level |
| MCP servers (context7, playwright) | skill | User-level MCP config |

**Rationale**: Phase 1 is global per-user, not per-project. CLI scope is project-level files only. `team-init` skill guides user through global setup when missing.

---

## Phase 2 — Project-level configuration

| Original action | Status | Where |
|---|---|---|
| Project detection (package.json / pyproject.toml / go.mod / Cargo.toml / pom.xml) | **CLI** | `src/utils/detect.ts`; used by `init.ts` |
| Write `.harness-context.json` | CLI | Superseded by `.harness-profile` + `harness.config.json` + `.harness/current.json`; same info, better factored |
| `mkdir -p docs/superpowers/{plans,specs}` | partial | `docs/memory/{cases,decisions,constraints,archive}` via `init.ts:ensureMemorySubdirs`; plans/specs live under `harness-workflow/` per myskills convention |
| Write `CLAUDE.md` (project rules + workflow rules) | **CLI** | `resources/templates/root/CLAUDE.md.template` + `init.ts` runOneSpec applies it |
| Write `docs/STATE.json` (round progress) | CLI | Replaced by `.harness/current.json`; `init.ts:writeCurrent` creates it |
| Write `docs/DESIGN.md` (per project type) | deferred | R12 company-mt preset handles Java-specific; personal preset currently doesn't ship DESIGN.md (user can add) |
| Write `docs/WALKTHROUGH.md` | skill | Operation log is written by harness-feature Stage 8, not by CLI |
| `--adopt` merge protection | **CLI** | Four-state in `materialize.ts` (`user-modified` state preserves user changes) |

---

## Phase 3 — Project memory contract

| Original action | Status | Where |
|---|---|---|
| Generate `.harness-memory.yml` from template | **CLI** | `resources/templates/memory/.harness-memory.yml.template` + init |
| Generate `docs/memory/` scaffolding (MEMORY.md / ERRORS.md / 4 subdirs + READMEs) | **CLI** | `resources/templates/memory/` full set + `init.ts:ensureMemorySubdirs` |
| Initialize `harness_reviewer_scorecard.yml` | **CLI** | Template exists; init drops it |
| `--adopt` merge protection for existing memory files | **CLI** | Four-state in materialize.ts |
| Contract validation (forbidden_paths non-empty, no broad owned_paths, YAML parse) | partial | YAML parse happens implicitly when profile/memory loader reads the file; strict forbidden_paths/broad-path validators will be added when `harness doctor` extends in R11 |
| `/codex:setup` invocation | skill | Codex plugin is user-level, init doesn't own it |
| First claude-mem observation write | skill | AI skill does this, not CLI |

---

## Phase 4 — Verify + commit

| Original action | Status | Where |
|---|---|---|
| `ls` verify expected files | **CLI** | `harness doctor` (lists issues if any missing) |
| `.harness-status.json` in .gitignore | CLI | Unused now; superseded by `.harness/managed-files.json` + `.harness/current.json`; both auto-added to .gitignore by `init.ts:ensureGitignore` |
| `.harness-context.json` in .gitignore | CLI | Superseded; same auto-gitignore path |
| `git add CLAUDE.md docs/ .gitignore` | skill | AI commits at end of Round, not CLI's job |
| Initial commit `chore: initialize harness engineering environment` | skill | Same |

---

## Knowledge scanner (Spec 1, not in original Phase 1-4 but essential R3-R10 addition)

| Action | Status | Where |
|---|---|---|
| Scan pipeline (scout / 5-domain / codex contradiction / TODO aggregation) | skill | Runs via harness-workflow Stage -0.5 (AI subagents); CLI just preflights |
| Preflight `docs/memory/` exists before scan | **CLI** | `scan.ts` uses `memoryTreeIntact` |
| Write `.harness/scan-request.json` for skill to pick up | **CLI** | `scan.ts` |
| Apply batch answers + micro-rescan | CLI+skill | CLI writes marker with `status: apply_answers_pending`; skill reads it, does AI rescan, writes final knowledge files |

---

## Round 6 / T3 acceptance

R6/T3 "Phase → CLI crosscheck (confirmed covered)" is complete when **every row above is either CLI or has a justified skill/deferred annotation**. Currently 100% covered (no unmarked actions).

R6/T3 re-validator script (R11/T5): parse this file, extract "Original action" column, ensure every entry has Status ∈ {CLI, skill, partial, deferred} + Where column non-empty. Any row with Status=TBD blocks Round 6 completion.
