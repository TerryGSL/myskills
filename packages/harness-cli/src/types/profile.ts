export type HardFloorAction =
  | 'auto_push'
  | 'force_push'
  | 'destructive_ops'
  | 'auto_merge'
  | 'rewrite_history'
  | 'network_install';

export type AggressionMode = 'conservative' | 'standard' | 'aggressive';

export type MatcherType = 'path_glob' | 'git_remote_regex' | 'file_exists';

export interface Matcher {
  type: MatcherType;
  pattern: string;
}

export interface Detection {
  priority: number;
  matchers: Matcher[];
}

export interface TaskTypes {
  quick: string;
  bugfix: string;
  feature: string;
  refactor: string;
}

export interface FastPathRule {
  extensions: string[];
  forbidden_patterns: string[];
  forbidden_files: string[];
  max_changed_files: number;
  max_diff_lines: number;
}

export interface RepoConventions {
  language?: string;
  build_files?: string[];
  package_roots?: string[];
  test_gate?: {
    require_unit_test_for_backend_change?: boolean;
    prefer_module_scoped_command?: boolean;
  };
  review_style?: {
    verdict_first?: boolean;
    file_line_grounding_required?: boolean;
    no_speculation?: boolean;
  };
  memory_layout?: {
    knowledge_root?: string;
    memory_root?: string;
    learnings_root?: string;
  };
  i18n_defaults?: {
    backend_skill?: string;
    repo_specific_phase2_skill?: string;
  };
}

export interface ComplianceHooks {
  preflight?: string[];
  required_checks?: string[];
  blocked_when?: string[];
}

export interface Profile {
  name: string;
  description: string;
  detection: Detection;
  entry_skill: 'profile-entry';
  task_types: TaskTypes;
  default_mode: AggressionMode;
  hard_floor: HardFloorAction[];
  repo_conventions?: RepoConventions;
  compliance_hooks?: ComplianceHooks;
}
