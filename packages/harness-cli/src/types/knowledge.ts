// Canonical source of truth for knowledge domain types.
// DO NOT duplicate these definitions in skill markdown or reviewer contracts.
// Skill prose must use <!-- @generated:xxx --> anchors; doc-gen replaces them.

export type RuleStatus = 'active' | 'expired' | 'drifted' | 'superseded';

export type ManifestStatus = 'active' | 'partial' | 'drifted' | `superseded_by:${string}`;

export type RetrievalOutcome = 'success' | 'coordinator_miss' | 'all_candidates_filtered';

export type ViolationTest =
  | 'must_use_wrapper'
  | 'must_call_component'
  | 'must_not_throw_raw_exception'
  | 'must_use_package'
  | 'must_not_use_pattern'
  | 'must_annotate_with'
  | 'free_form_review';

export interface KnowledgeRequirement {
  rule_id: string;
  manifest_file: string;
  applies_to: string[];
  requirement_text: string;
  violation_test: ViolationTest;
  [extraField: string]: unknown;
}

export interface AdvisoryKnowledge {
  source: 'user_override' | 'expired_rule';
  id: string;
  domain: string;
  text: string;
  weight: 'advisory';
}

export interface KnownIssue {
  source: 'drifted_rule' | 'superseded_rule' | 'filtered_manifest';
  id: string;
  domain: string;
  reason: string;
}

/**
 * 8-field runtime state object written to
 * `.harness-status.json.knowledgeCheck` by Stage -0.5 retrieval.
 *
 * Source of truth: `resources/schemas/knowledgeCheck.schema.json` (PR A2.1).
 * Field semantics: `harness/harness-common/references/knowledge-retrieval.md`.
 *
 * The richer Stage -0.5 payload (effective_index_status / snapshot_id /
 * filtered_candidates / advisory_knowledge / knowledge_requirements / etc.)
 * is consumed by strict-reviewer via `review_target` (see review-target.ts).
 * `KnowledgeCheck` here is the compact runtime status that Stage -0.5
 * coordinator writes for downstream gates and route consumers.
 */
export interface KnowledgeCheck {
  /** CLAUDE.md `harness-knowledge: disabled` opt-out. */
  disabled: boolean;
  /** `docs/harness/knowledge/INDEX.md` exists in projectRoot. */
  present: boolean;
  /** Aggregate manifest health: `ready` / `stale` / `missing`. */
  status: 'ready' | 'stale' | 'missing';
  /** Any manifest claims an applies_to/rule out of sync with the project. */
  drifted: boolean;
  /** Drifted manifest was salvaged via a Stage 4 late-recovery fallback. */
  late_recovered: boolean;
  /** Total rule count across all loaded manifests. */
  rules_count: number;
  /** Total example/evidence ref count across all loaded manifests. */
  examples_count: number;
  /** ISO 8601 timestamp; null when retrieval was skipped (e.g. disabled). */
  retrieved_at: string | null;
}
