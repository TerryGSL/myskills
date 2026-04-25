import fs from 'fs-extra';
import * as path from 'node:path';
import * as os from 'node:os';
import { parse as parseYaml } from 'yaml';
import Ajv from 'ajv/dist/2020.js';
import { fileURLToPath } from 'node:url';
import { Profile } from '../types/profile.js';
import { MATCHER_TYPES, type MatcherType } from '../types/constants.js';

export const MARKER_PATH = '.harness-profile';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '../../resources/schemas/profile.schema.json');

const ajv = new Ajv({ allErrors: true });
let _validate: ((data: unknown) => boolean) | null = null;

function validator() {
  if (_validate === null) {
    const schema = fs.readJsonSync(SCHEMA_PATH);
    _validate = ajv.compile(schema);
  }
  return _validate;
}

/** Load a single profile YAML file, validate against schema, return typed Profile. */
export function loadProfile(filePath: string): Profile {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = parseYaml(raw);
  const validate = validator();
  if (!validate(data)) {
    throw new Error(
      `profile schema violation at ${filePath}: ${JSON.stringify((validate as { errors?: unknown }).errors)}`,
    );
  }
  return data as Profile;
}

/**
 * Defensive profile validation.
 *
 * Layered on top of the JSON-schema (ajv) check in `loadProfile` to catch
 * issues that the schema does not — or to fail fast before schema compile.
 *
 * Returns a list of human-readable violation strings; empty array = clean.
 *
 * Checks:
 *   1. Placeholder residue (template strings like REPLACE_ME / __X__ left
 *      in a derived profile — strong signal the user / bootstrap forgot to
 *      substitute).
 *   2. Matcher type whitelist (defensive double-check; schema also enforces
 *      via ajv enum, but markdown contracts and bash fallbacks may emit
 *      illegal types).
 *   3. Required top-level fields presence.
 */
export function validateProfile(yamlText: string, parsed: unknown): string[] {
  const violations: string[] = [];

  // 1) Placeholder residue
  if (/REPLACE_ME|__[A-Z_]+__/.test(yamlText)) {
    violations.push(
      'Placeholder residue: file contains REPLACE_ME or __X__, not derived',
    );
  }

  const obj =
    parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;

  // 2) Matcher type whitelist
  const detection = obj?.detection as { matchers?: unknown } | undefined;
  const matchers = Array.isArray(detection?.matchers) ? detection.matchers : [];
  for (let i = 0; i < matchers.length; i++) {
    const m = matchers[i] as { type?: unknown };
    const t = m?.type;
    if (typeof t !== 'string' || !MATCHER_TYPES.includes(t as MatcherType)) {
      violations.push(
        `detection.matchers[${i}].type illegal: ${JSON.stringify(t)} (allowed: ${MATCHER_TYPES.join(' / ')})`,
      );
    }
  }

  // 3) Required fields
  for (const k of [
    'detection',
    'entry_skill',
    'default_mode',
    'hard_floor',
    'task_types',
  ]) {
    if (!obj || !(k in obj)) {
      violations.push(`Missing required field: ${k}`);
    }
  }

  return violations;
}

/** List + load all *.yml profiles under a directory (non-recursive). */
export function listProfiles(dir: string): Profile[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => path.join(dir, f));
  return files.map(loadProfile);
}

/** Default profiles directory at ~/.claude/profiles. */
export function defaultProfilesDir(): string {
  return path.join(os.homedir(), '.claude', 'profiles');
}

export interface MatchContext {
  cwd: string;
  gitRemote: string | null;
}

/**
 * Match profile to a repo context. Rules:
 * 1. Highest `detection.priority` wins.
 * 2. Tie-break: longer matcher pattern wins (specificity).
 * 3. Still tied → first in array; caller may hard-error if they require no ambiguity.
 *
 * Returns null if no matcher fires.
 */
export function matchProfile(profiles: Profile[], ctx: MatchContext): Profile | null {
  const hits = profiles
    .map((p) => ({ p, score: matchScore(p, ctx) }))
    .filter((x) => x.score !== null) as Array<{ p: Profile; score: { priority: number; specificity: number } }>;
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    if (b.score.priority !== a.score.priority) return b.score.priority - a.score.priority;
    return b.score.specificity - a.score.specificity;
  });
  return hits[0].p;
}

function matchScore(
  profile: Profile,
  ctx: MatchContext,
): { priority: number; specificity: number } | null {
  let bestSpecificity = -1;
  for (const m of profile.detection.matchers) {
    const spec = matchOne(m.type, m.pattern, ctx);
    if (spec !== null && spec > bestSpecificity) bestSpecificity = spec;
  }
  if (bestSpecificity < 0) return null;
  return { priority: profile.detection.priority, specificity: bestSpecificity };
}

function matchOne(type: string, pattern: string, ctx: MatchContext): number | null {
  if (!MATCHER_TYPES.includes(type as MatcherType)) return null;
  const t = type as MatcherType;
  switch (t) {
    case 'path_glob': {
      const expanded = pattern.replace(/^~\//, `${os.homedir()}/`);
      const prefix = expanded.replace(/\/\*\*$/, '');
      return ctx.cwd.startsWith(prefix) ? prefix.length : null;
    }
    case 'git_remote_regex': {
      if (!ctx.gitRemote) return null;
      try {
        return new RegExp(pattern).test(ctx.gitRemote) ? pattern.length : null;
      } catch {
        return null;
      }
    }
    case 'file_exists': {
      return fs.existsSync(path.join(ctx.cwd, pattern)) ? pattern.length : null;
    }
  }
}

export interface ProfileMarker {
  profile: string;
  resolved_by: 'marker' | 'matcher' | 'user_override';
  updated_at: string;
}

export function readMarker(projectRoot: string): ProfileMarker | null {
  const filePath = path.join(projectRoot, MARKER_PATH);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    const data = parseYaml(raw);
    return data as ProfileMarker;
  } catch {
    return null;
  }
}

export function writeMarker(
  projectRoot: string,
  marker: Omit<ProfileMarker, 'updated_at'> & { updated_at?: string },
): void {
  const full: ProfileMarker = {
    profile: marker.profile,
    resolved_by: marker.resolved_by,
    updated_at: marker.updated_at ?? new Date().toISOString(),
  };
  const filePath = path.join(projectRoot, MARKER_PATH);
  const body = `profile: ${full.profile}\nresolved_by: ${full.resolved_by}\nupdated_at: ${full.updated_at}\n`;
  fs.writeFileSync(filePath, body);
}
