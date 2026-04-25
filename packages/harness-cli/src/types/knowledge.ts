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

export interface KnowledgeCheck {
  effective_index_status: 'active' | 'stale' | 'drifted' | 'disabled';
  snapshot_id: string | null;
  retrieval_outcome: RetrievalOutcome;
  filtered_candidates: Array<{ manifest: string; reason: string }>;
  known_issues: KnownIssue[];
  relevant_knowledge_files: string[];
  advisory_knowledge: AdvisoryKnowledge[];
  knowledge_requirements: KnowledgeRequirement[];
}
