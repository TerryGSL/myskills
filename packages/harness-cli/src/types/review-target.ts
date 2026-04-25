import type { KnowledgeRequirement, KnownIssue, RetrievalOutcome } from './knowledge.js';

export type ReviewStage = 'qa' | 'security' | 'spec' | 'quality';

export interface ReviewTarget {
  changed_files: string[];
  diff_summary: string;
  stage: ReviewStage;
  claims_to_verify?: string[];
  memory_cases?: Array<Record<string, unknown>>;
  prior_verdict?: Record<string, unknown> | null;

  // Knowledge scanner integration (Spec 1)
  relevant_knowledge_files?: string[];
  knowledge_snapshot_id?: string | null;
  knowledge_requirements?: KnowledgeRequirement[];
  retrieval_outcome?: RetrievalOutcome;
  known_issues?: KnownIssue[];
}
