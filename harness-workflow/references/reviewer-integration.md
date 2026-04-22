# harness-workflow ↔ strict-reviewer Integration

> Caller-side protocol for Stage 4/5/6/7 to invoke `strict-reviewer` correctly.
> Spec reference: `specs/2026-04-22-memory-reviewer-upgrade.md` §Invocation Protocol

## Roles

- **strict-reviewer skill** — stateless reviewer (see `strict-reviewer/SKILL.md`)
- **Caller** — harness-workflow main agent acting as Stage 4/5/6/7 coordinator
- **Scorecard** — `docs/memory/harness_reviewer_scorecard.yml`, owned and persisted by caller

## Protocol

### 1. Construct `review_target`

Caller gathers inputs from current round state:

| Field | Source |
|-------|--------|
| `changed_files` | `git diff --name-only <.harness-status.json.baseSha>..HEAD` |
| `diff_summary` | `git log --oneline <baseSha>..HEAD` + `git diff --stat` |
| `stage` | Current Stage: `"qa"` for Stage 6, `"security"` for Stage 7, `"spec"` for Stage 4, `"quality"` for Stage 5 |
| `claims_to_verify` | Stage-specific: Stage 4 = spec acceptance criteria; Stage 5 = plan's test checklist; Stage 6 = PRD acceptance criteria; Stage 7 = security requirements |
| `memory_cases` | Read from `.harness-status.json.memoryCheck.matches` |
| `prior_verdict` | If this is a re-review after FAIL, pass the prior output; else null |

### 2. Invoke

```
Skill(skill="strict-reviewer", args=<serialized review_target YAML>)
```

Caller waits for YAML-shaped response.

### 3. Parse response

Response is YAML matching the Output schema in `strict-reviewer/SKILL.md`. Caller MUST:

- Parse as YAML (Python `yaml.safe_load` or equivalent)
- If parse fails → retry once with identical `review_target`
- If second parse fails → treat as `verdict: BLOCKED` reason `"reviewer output malformed"`

### 4. Route by verdict

| verdict | caller action |
|---------|--------------|
| `PASS` | Continue to next Stage. Append `scorecard_delta` to scorecard (see step 5). |
| `FAIL` | Enter Stage's auto-fix loop: Stage 4 ≤ 3 rounds / Stage 5 ≤ 3 rounds / Stage 6/7 per P0 bug rules. Each retry builds a new `review_target` with `prior_verdict` set. |
| `BLOCKED` | **Escalate to user**. Do not auto-retry, do not continue. `BLOCKED` means system state is incomplete (input malformed, coverage impossible, etc.), not that code is broken. |

### 5. Scorecard persistence (caller owns, strict-reviewer is stateless)

For every invocation (PASS / FAIL / BLOCKED), caller appends to `docs/memory/harness_reviewer_scorecard.yml`:

```yaml
reviews:
  - review_id: "r-<date>-<N>"            # generate monotonic id per round
    stage: "<stage>"
    timestamp: "<ISO>"
    changed_files: [...]
    verdict: "<verdict>"
    findings_count: <from output>
    linked_error_case: null              # set later if false-pass correction fires
```

And update `totals`:

```yaml
totals:
  total_reviews: +1
  <verdict lower>_count: +1
```

Then check rotation: if `len(reviews) > 500` → move older entries to `docs/memory/archive/harness_reviewer_scorecard_<year>.yml` (keep most recent 100).

## strict-reviewer unavailable (degraded mode)

If `Skill(skill="strict-reviewer", ...)` fails (skill missing, tool error, timeout):

| Context | Action |
|---------|--------|
| harness mode (docs/STATE.json exists) | **BLOCKED**, escalate. NEVER fall back to legacy prompt. |
| Standalone use (no STATE.json) | Fall back to legacy qa-prompt / security-prompt; log knownIssue |
| User explicitly approves one-time degrade | Legacy prompt for this invocation only; append knownIssue with reason |
| `autonomous_mode` | Always BLOCKED, wait for user. Do not silently degrade. |

Rationale: the whole point of strict-reviewer is the hard gates. When the enforcement infrastructure is gone is exactly when you need the gates most, not least.

## Linking false-pass incidents

When a later bug contradicts a prior PASS review (the feedback loop that makes scorecard worth having):

1. Open a new error case in `docs/memory/cases/harness_<date>_<slug>.md` (if it meets `errors_collection.min_criteria`)
2. Append to scorecard `false_pass_incidents`:
   ```yaml
   false_pass_incidents:
     - incident_id: "fpi-<date>-<N>"
       original_review_id: "r-<date>-<N>"   # the review that missed this
       bug_case: "cases/harness_<date>_<slug>.md#<id>"
       detected_at: "<ISO>"
       action_taken: "..."
   ```
3. `--maintain` scans `false_pass_incidents` periodically to feed reviewer-prompt examples (future work)

## Claims verification guidance per stage

Callers should pick `claims_to_verify` appropriate to the stage:

- **Stage 4 (spec review)**: each acceptance criterion in plan / spec — does the code meet it?
- **Stage 5 (quality / codex cross-review)**: core architecture assertions — single responsibility, no layering violations, no abandoned branches
- **Stage 6 (QA)**: each test case in plan's test checklist — does the code + test pair produce the expected behavior?
- **Stage 7 (security)**: OWASP-style threat statements — does the code prevent <specific class of attack>?

Empty `claims_to_verify` is allowed but strongly discouraged — it lets strict-reviewer only rely on adversarial search, reducing signal density.
