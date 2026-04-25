import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { runProfileResolve } from './profile-resolve.js';
import { listProfiles, defaultProfilesDir, readMarker } from '../utils/profile.js';
import { performRetrieval } from '../utils/knowledge-retrieval.js';
import type { Profile } from '../types/profile.js';
import type { KnowledgeCheck } from '../types/knowledge.js';
import {
  HARD_FLOOR_FLAGS,
  AGGRESSION_MODES,
  type AggressionMode,
  type HardFloorFlag,
} from '../types/constants.js';

/**
 * `harness route --json` — unified routing CLI command (PR C5).
 *
 * Single execution point that merges:
 *   1. profile-resolve (PR C1)
 *   2. fast-path detection (git diff stat)
 *   3. flag → leaf_skill mapping
 *   4. aggression mode resolution (hard_floor > flag > profile.default_mode > standard)
 *   5. knowledge retrieval (PR C3 performRetrieval)
 *   6. context_to_inject markdown rendering
 *
 * Spec:
 *   - docs/superpowers/specs/2026-04-26-unified-fusion-design.md
 *   - harness-common/contracts/routing.md
 *   - harness-common/contracts/task-type.md (fast-path)
 *   - harness-common/contracts/aggression-mode.md
 *   - harness-common/contracts/hard-floor-enforcement.md
 *
 * Output conforms to resources/schemas/route-output.schema.json.
 */

export type LeafSkill = 'harness-quick' | 'harness-bugfix' | 'harness-feature' | 'harness-refactor';

export interface RouteInput {
  task: string;
  flags?: string[];
  cwd?: string;
  profilesDir?: string;
  gitRemote?: string | null;
  now?: string;
  skipGit?: boolean;
  json?: boolean;
}

export interface RouteOutput {
  leaf_skill: LeafSkill;
  resolved_profile: string;
  resolved_mode: AggressionMode;
  task_description: string;
  hard_floor: HardFloorFlag[];
  knowledge_manifest: KnowledgeCheck;
  fast_path_hit: boolean;
  context_to_inject: string;
}

const FAST_PATH_FORBIDDEN_FILES = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'Gemfile',
  'Dockerfile',
  'Makefile',
];
const FAST_PATH_FORBIDDEN_DIR_PATTERNS = [
  /\.github\/workflows\//,
  /(?:^|\/)migrations\//,
];
const FAST_PATH_PUBLIC_EXPORT_RE = /(?:^|\/)(index\.ts|__init__\.py|lib\.rs)$/;
const FAST_PATH_SCHEMA_RE = /\.schema\.json$|(?:^|\/)schema\.sql$/;

const BUGFIX_KEYWORDS = [/修.*bug/i, /fix\s+bug/i, /bugfix/i, /找一下错/i, /修复/i];
const REFACTOR_KEYWORDS = [/重构/i, /refactor/i, /重新组织/i];
const FEATURE_KEYWORDS = [/加功能/i, /新增/i, /实现/i, /add\s+feature/i];

function detectFastPath(cwd: string, skipGit: boolean): boolean {
  if (skipGit) return false;
  const stat = spawnSync('git', ['-C', cwd, 'diff', '--stat', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (stat.status !== 0) return false;
  const lines = stat.stdout.split('\n').filter((l) => /^\s*\S+\s+\|/.test(l));
  if (lines.length !== 1) return false;
  const file = (lines[0].match(/^\s*(\S+)\s+\|/) || [])[1];
  if (!file) return false;

  const base = path.basename(file);
  if (FAST_PATH_FORBIDDEN_FILES.includes(base)) return false;
  if (FAST_PATH_PUBLIC_EXPORT_RE.test(file)) return false;
  if (FAST_PATH_SCHEMA_RE.test(file)) return false;
  for (const re of FAST_PATH_FORBIDDEN_DIR_PATTERNS) {
    if (re.test(file)) return false;
  }

  const full = spawnSync('git', ['-C', cwd, 'diff', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (full.status !== 0) return false;
  const addedLines = full.stdout
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
  if (addedLines >= 10) return false;

  return true;
}

function flagToLeaf(flags: string[]): LeafSkill | null {
  const norm = flags
    .map((f) => f.trim().toLowerCase().replace(/^\//, ''))
    .filter((f) => f.length > 0);
  if (norm.includes('quick')) return 'harness-quick';
  if (norm.includes('bugfix') || norm.includes('fix')) return 'harness-bugfix';
  if (norm.includes('refactor')) return 'harness-refactor';
  if (norm.includes('feature')) return 'harness-feature';
  return null;
}

function keywordToLeaf(taskDescription: string): LeafSkill {
  if (BUGFIX_KEYWORDS.some((re) => re.test(taskDescription))) return 'harness-bugfix';
  if (REFACTOR_KEYWORDS.some((re) => re.test(taskDescription))) return 'harness-refactor';
  if (FEATURE_KEYWORDS.some((re) => re.test(taskDescription))) return 'harness-feature';
  return 'harness-feature';
}

function resolveMode(args: {
  flags: string[];
  profileDefault: AggressionMode;
  hardFloor: HardFloorFlag[];
  markerMode?: AggressionMode;
}): AggressionMode {
  const norm = args.flags
    .map((f) => f.trim().toLowerCase().replace(/^\//, ''))
    .filter((f) => f.length > 0);

  let candidate: AggressionMode;
  if (norm.includes('safe')) {
    candidate = 'conservative';
  } else if (norm.includes('yolo')) {
    candidate = 'aggressive';
  } else if (args.markerMode && AGGRESSION_MODES.includes(args.markerMode)) {
    candidate = args.markerMode;
  } else {
    candidate = args.profileDefault;
  }
  if (!AGGRESSION_MODES.includes(candidate)) candidate = 'standard';

  // hard_floor cap: any hard_floor entry blocks aggressive mode (otherwise
  // /yolo would silently grant auto_push / force_push / etc.). See
  // hard-floor-enforcement.md "hard_floor > aggression_mode > 用户 flag".
  if (candidate === 'aggressive' && args.hardFloor.length > 0) {
    candidate = args.profileDefault;
    if (candidate === 'aggressive') candidate = 'conservative';
  }
  return candidate;
}

function loadProfileByName(profilesDir: string, name: string): Profile | null {
  const profiles = listProfiles(profilesDir);
  return profiles.find((p) => p.name === name) ?? null;
}

function readMarkerMode(cwd: string): AggressionMode | undefined {
  const marker = readMarker(cwd);
  if (!marker) return undefined;
  const m = (marker as unknown as { mode?: unknown }).mode;
  if (typeof m === 'string' && AGGRESSION_MODES.includes(m as AggressionMode)) {
    return m as AggressionMode;
  }
  return undefined;
}

function renderContext(args: {
  taskDescription: string;
  leafSkill: LeafSkill;
  resolvedProfile: string;
  resolvedMode: AggressionMode;
  hardFloor: HardFloorFlag[];
  fastPathHit: boolean;
  knowledge: KnowledgeCheck;
}): string {
  const lines: string[] = [];
  lines.push('## Binding Rules');
  lines.push('');
  lines.push(`- **Profile**: ${args.resolvedProfile}`);
  lines.push(`- **Leaf skill**: ${args.leafSkill}`);
  lines.push(`- **Mode**: ${args.resolvedMode}`);
  lines.push(
    `- **Hard floor**: ${args.hardFloor.length ? args.hardFloor.join(', ') : '(none)'}`,
  );
  lines.push(`- **Fast-path hit**: ${args.fastPathHit ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Task');
  lines.push('');
  lines.push(args.taskDescription || '(empty)');
  lines.push('');
  lines.push('## Knowledge Manifest');
  lines.push('');
  if (args.knowledge.disabled) {
    lines.push('- knowledge retrieval **disabled** via CLAUDE.md opt-out');
  } else if (!args.knowledge.present) {
    lines.push('- knowledge index **missing** — no retrieved rules');
  } else {
    lines.push(`- status: ${args.knowledge.status}`);
    lines.push(`- rules: ${args.knowledge.rules_count}`);
    lines.push(`- examples: ${args.knowledge.examples_count}`);
    if (args.knowledge.drifted) lines.push('- drifted manifest detected');
    if (args.knowledge.late_recovered) lines.push('- late-recovered (Stage 4 salvage)');
  }
  return lines.join('\n');
}

function sanitizeHardFloor(input: unknown): HardFloorFlag[] {
  if (!Array.isArray(input)) return [];
  const out: HardFloorFlag[] = [];
  for (const v of input) {
    if (typeof v === 'string' && (HARD_FLOOR_FLAGS as readonly string[]).includes(v)) {
      out.push(v as HardFloorFlag);
    }
  }
  return out;
}

export function runRoute(input: RouteInput): RouteOutput {
  const cwd = input.cwd ?? process.cwd();
  const profilesDir = input.profilesDir ?? defaultProfilesDir();
  const flags = input.flags ?? [];

  // 1) profile-resolve (reuse PR C1)
  const resolved = runProfileResolve({
    cwd,
    profilesDir,
    gitRemote: input.gitRemote,
  });

  // 2) load full profile YAML to get default_mode + hard_floor
  const profile = loadProfileByName(profilesDir, resolved.profile_name);
  const profileDefault: AggressionMode =
    profile && AGGRESSION_MODES.includes(profile.default_mode)
      ? profile.default_mode
      : 'standard';
  const hardFloor: HardFloorFlag[] = sanitizeHardFloor(profile?.hard_floor ?? []);

  // 3) fast-path detection
  const skipGit = !!input.skipGit || !fs.existsSync(path.join(cwd, '.git'));
  const fastPathHit = detectFastPath(cwd, skipGit);

  // 4) leaf_skill: explicit flag > fast-path > keyword > default(feature)
  const flagLeaf = flagToLeaf(flags);
  let leafSkill: LeafSkill;
  if (flagLeaf) {
    leafSkill = flagLeaf;
  } else if (fastPathHit) {
    leafSkill = 'harness-quick';
  } else {
    leafSkill = keywordToLeaf(input.task);
  }

  // 5) resolved_mode (hard_floor caps aggressive)
  const resolvedMode = resolveMode({
    flags,
    profileDefault,
    hardFloor,
    markerMode: readMarkerMode(cwd),
  });

  // 6) knowledge retrieval (PR C3)
  const taskTypeForRetrieval = leafSkill.replace(/^harness-/, '') as
    | 'quick'
    | 'bugfix'
    | 'feature'
    | 'refactor';
  const knowledge = performRetrieval({
    projectRoot: cwd,
    taskType: taskTypeForRetrieval,
    taskDescription: input.task,
    now: input.now,
  });

  // 7) context_to_inject markdown
  const context = renderContext({
    taskDescription: input.task,
    leafSkill,
    resolvedProfile: resolved.profile_name,
    resolvedMode,
    hardFloor,
    fastPathHit,
    knowledge,
  });

  // 8) assemble
  return {
    leaf_skill: leafSkill,
    resolved_profile: resolved.profile_name,
    resolved_mode: resolvedMode,
    task_description: input.task,
    hard_floor: hardFloor,
    knowledge_manifest: knowledge,
    fast_path_hit: fastPathHit,
    context_to_inject: context,
  };
}
