import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  defaultProfilesDir,
  listProfiles,
  matchProfile,
  readMarker,
  type MatchContext,
} from '../utils/profile.js';
import type { Profile, Matcher } from '../types/profile.js';
import { MATCHER_TYPES, type MatcherType } from '../types/constants.js';
import * as os from 'node:os';
import * as fs from 'node:fs';

/**
 * `harness profile-resolve --json` — Stage 0 of the unified routing flow.
 *
 * Resolution algorithm (spec §14 #1):
 *   Step 0: read .harness-profile YAML marker at projectRoot.
 *           If present + valid → resolved_by=marker, matched_pattern=null.
 *   Step 1: else load all *.yml under profilesDir (~/.claude/profiles by default),
 *           run matchProfile with (cwd, gitRemote). If a winner emerges →
 *           resolved_by=matcher, matched_pattern=<the matcher pattern that fired
 *           on the winning profile, with highest specificity>.
 *   Step 2: tie (two profiles same priority + same specificity) → throw.
 *   Step 3: no match → fall back to "default" profile (priority 0, glob "**" matches everything).
 *           If even default is missing → throw.
 *
 * Output JSON: { profile_name, resolved_by, matched_pattern }.
 */

export interface ProfileResolveInput {
  /** Project root to resolve against. Defaults to process.cwd(). */
  cwd?: string;
  /** Override profiles directory (defaults to ~/.claude/profiles). Tests use this. */
  profilesDir?: string;
  /** Override git remote detection (tests use this). If undefined, detected from git. */
  gitRemote?: string | null;
  json?: boolean;
}

export type ResolvedBy = 'marker' | 'matcher' | 'user_override';

export interface ProfileResolveOutput {
  profile_name: string;
  resolved_by: ResolvedBy;
  matched_pattern: string | null;
}

function detectGitRemote(cwd: string): string | null {
  try {
    const out = execFileSync('git', ['-C', cwd, 'config', '--get', 'remote.origin.url'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = out.trim();
    return trimmed.length ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Recompute the matcher pattern that fired with the highest specificity
 * for a given profile + context. Mirrors matchOne in utils/profile.ts but
 * returns the pattern string instead of a score.
 */
function bestMatcherPattern(profile: Profile, ctx: MatchContext): string | null {
  let best: { pattern: string; spec: number } | null = null;
  for (const m of profile.detection.matchers) {
    if (!MATCHER_TYPES.includes(m.type as MatcherType)) continue;
    const spec = scoreMatcher(m, ctx);
    if (spec === null) continue;
    if (!best || spec > best.spec) best = { pattern: m.pattern, spec };
  }
  return best?.pattern ?? null;
}

function scoreMatcher(m: Matcher, ctx: MatchContext): number | null {
  switch (m.type) {
    case 'path_glob': {
      const expanded = m.pattern.replace(/^~\//, `${os.homedir()}/`);
      const prefix = expanded.replace(/\/\*\*$/, '');
      return ctx.cwd.startsWith(prefix) ? prefix.length : null;
    }
    case 'git_remote_regex': {
      if (!ctx.gitRemote) return null;
      try {
        return new RegExp(m.pattern).test(ctx.gitRemote) ? m.pattern.length : null;
      } catch {
        return null;
      }
    }
    case 'file_exists': {
      return fs.existsSync(path.join(ctx.cwd, m.pattern)) ? m.pattern.length : null;
    }
  }
}

function detectTie(profiles: Profile[], ctx: MatchContext): { a: string; b: string } | null {
  const scored: Array<{ name: string; priority: number; specificity: number }> = [];
  for (const p of profiles) {
    let bestSpec = -1;
    for (const m of p.detection.matchers) {
      const s = scoreMatcher(m, ctx);
      if (s !== null && s > bestSpec) bestSpec = s;
    }
    if (bestSpec >= 0) {
      scored.push({ name: p.name, priority: p.detection.priority, specificity: bestSpec });
    }
  }
  if (scored.length < 2) return null;
  scored.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.specificity - a.specificity;
  });
  // top two share priority + specificity → tie
  if (
    scored[0].priority === scored[1].priority &&
    scored[0].specificity === scored[1].specificity
  ) {
    return { a: scored[0].name, b: scored[1].name };
  }
  return null;
}

export function runProfileResolve(input: ProfileResolveInput): ProfileResolveOutput {
  const cwd = input.cwd ?? process.cwd();
  const profilesDir = input.profilesDir ?? defaultProfilesDir();

  // Step 0: marker
  const marker = readMarker(cwd);
  if (marker && typeof marker.profile === 'string' && marker.profile.length > 0) {
    return {
      profile_name: marker.profile,
      resolved_by: 'marker',
      matched_pattern: null,
    };
  }

  // Step 1: matchers
  const profiles = listProfiles(profilesDir);
  const gitRemote = input.gitRemote === undefined ? detectGitRemote(cwd) : input.gitRemote;
  const ctx: MatchContext = { cwd, gitRemote };

  // Step 2: detect tie
  const tie = detectTie(profiles, ctx);
  if (tie) {
    throw new Error(
      `profile resolution tie: ${tie.a} vs ${tie.b} share priority + specificity at cwd=${cwd}`,
    );
  }

  const winner = matchProfile(profiles, ctx);
  if (winner) {
    const pattern = bestMatcherPattern(winner, ctx);
    return {
      profile_name: winner.name,
      resolved_by: 'matcher',
      matched_pattern: pattern,
    };
  }

  // Step 3: fall back to default profile (must exist)
  const defaultProfile = profiles.find((p) => p.name === 'default');
  if (defaultProfile) {
    return {
      profile_name: 'default',
      resolved_by: 'matcher',
      matched_pattern: null,
    };
  }

  throw new Error(
    `profile resolution failed: no marker, no matcher hit, no default profile in ${profilesDir}`,
  );
}
