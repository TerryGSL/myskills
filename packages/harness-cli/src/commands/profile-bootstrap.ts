import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { deriveProfile } from '../utils/derive.js';
import { validateProfile } from '../utils/profile.js';
import { HARD_FLOOR_FLAGS } from '../types/constants.js';

/**
 * harness profile-bootstrap — derive + write a company-* profile from the
 * current git repo.
 *
 * Spec §A PR 4.
 *
 * Behaviour:
 *   1. deriveProfile() — canonical repo root + path_glob + git_remote_regex
 *   2. classify workspace (company → hard_floor; personal → empty)
 *   3. assemble yaml
 *   4. validateProfile() gate — refuse to write on any violation
 *   5. atomic write to ~/.claude/profiles/company-<slug>.yml
 *   6. write repo .harness-profile marker (atomic)
 *   7. add .harness-profile to .gitignore (idempotent grep)
 *
 * Never auto-called from init/adopt/maintain — those are project-scoped, this
 * touches user-home (~/.claude/profiles/). User must invoke explicitly.
 */

export type WorkspaceKind = 'company' | 'personal';

export interface BootstrapInput {
  /** Optional explicit slug (overrides derived). */
  userSlug?: string;
  /** Optional remote-name filter (origin / upstream). */
  remoteName?: string;
  /** Workspace kind — controls hard_floor population. */
  workspace?: WorkspaceKind;
  /** Skip interactive confirmation (scripting / tests). */
  yes?: boolean;
  /** Override $HOME for tests. */
  homeDir?: string;
}

export interface BootstrapResult {
  status: 'ok' | 'error';
  slug: string;
  profileName: string;
  ymlPath: string;
  markerPath: string;
  gitignoreUpdated: boolean;
  hardFloor: string[];
  pathGlob: string;
  remoteRegex: string;
  message?: string;
}

/** Heuristic: slug or workspace flag flagged as company → apply hard_floor. */
function isCompanyWorkspace(slug: string, workspace: WorkspaceKind | undefined): boolean {
  if (workspace === 'company') return true;
  if (workspace === 'personal') return false;
  // No explicit workspace: default to "company" if slug strongly suggests it.
  return /(^|[-_])(company|work|corp)([-_]|$)/i.test(slug);
}

/** Render the profile YAML body. Branches on whether a remote regex exists. */
export function renderProfileYaml(opts: {
  slug: string;
  pathGlob: string;
  remoteRegex: string;
  hardFloor: string[];
}): string {
  const { slug, pathGlob, remoteRegex, hardFloor } = opts;
  const matchersBlock: string[] = [
    `    - type: path_glob`,
    `      pattern: "${pathGlob}"`,
  ];
  if (remoteRegex) {
    matchersBlock.push(`    - type: git_remote_regex`);
    // YAML double-quoted: backslash needs to be escaped (\\.git → \\\\.git in source)
    matchersBlock.push(`      pattern: "${remoteRegex.replace(/\\/g, '\\\\')}"`);
  }
  const hardFloorBlock = hardFloor.length
    ? hardFloor.map((f) => `  - ${f}`).join('\n')
    : '  []';

  return `name: company-${slug}
description: "Auto-derived profile for ${slug}"
detection:
  priority: 20
  matchers:
${matchersBlock.join('\n')}
entry_skill: profile-entry
task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor
default_mode: conservative
hard_floor:
${hardFloorBlock}
`;
}

function atomicWrite(targetPath: string, content: string): void {
  fs.ensureDirSync(path.dirname(targetPath));
  const tmp = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, targetPath);
}

function appendToGitignore(repoRoot: string): boolean {
  const gitignore = path.join(repoRoot, '.gitignore');
  const entry = '.harness-profile';
  let existing = '';
  if (fs.existsSync(gitignore)) {
    existing = fs.readFileSync(gitignore, 'utf8');
    const lines = existing.split('\n').map((l) => l.trim());
    if (lines.includes(entry)) return false;
  }
  const trailing = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  fs.appendFileSync(gitignore, `${trailing}${entry}\n`);
  return true;
}

export function runProfileBootstrap(input: BootstrapInput): BootstrapResult {
  const home = input.homeDir ?? os.homedir();

  // 1. derive
  const derived = deriveProfile(input.userSlug, input.remoteName);

  // 2. workspace classification → hard_floor
  // Company workspaces get the full safety floor (all HARD_FLOOR_FLAGS).
  // Source of truth is constants.HARD_FLOOR_FLAGS; never hard-code the list.
  const company = isCompanyWorkspace(derived.slug, input.workspace);
  const hardFloor: string[] = company ? [...HARD_FLOOR_FLAGS] : [];

  // 3. assemble yaml
  const yamlText = renderProfileYaml({
    slug: derived.slug,
    pathGlob: derived.pathGlob,
    remoteRegex: derived.remoteRegex,
    hardFloor,
  });

  // 4. validateProfile gate
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch (e) {
    throw new Error(`assembled YAML failed to parse: ${(e as Error).message}`);
  }
  const violations = validateProfile(yamlText, parsed);
  if (violations.length > 0) {
    throw new Error(
      `validateProfile rejected derived YAML (refusing to write):\n  - ${violations.join('\n  - ')}`,
    );
  }

  // 5. atomic write to ~/.claude/profiles/company-<slug>.yml
  const profilesDir = path.join(home, '.claude', 'profiles');
  fs.ensureDirSync(profilesDir);
  const ymlPath = path.join(profilesDir, `company-${derived.slug}.yml`);
  atomicWrite(ymlPath, yamlText);

  // 6. .harness-profile marker
  const markerPath = path.join(derived.repoRoot, '.harness-profile');
  const markerBody = `profile: company-${derived.slug}\nresolved_by: marker\nupdated_at: ${new Date().toISOString()}\n`;
  atomicWrite(markerPath, markerBody);

  // 7. .gitignore append (idempotent)
  const gitignoreUpdated = appendToGitignore(derived.repoRoot);

  return {
    status: 'ok',
    slug: derived.slug,
    profileName: `company-${derived.slug}`,
    ymlPath,
    markerPath,
    gitignoreUpdated,
    hardFloor,
    pathGlob: derived.pathGlob,
    remoteRegex: derived.remoteRegex,
  };
}

export function printBootstrapSummary(r: BootstrapResult): void {
  process.stdout.write(`Derived: profile=${r.profileName}\n`);
  process.stdout.write(`  path_glob:        ${r.pathGlob}\n`);
  process.stdout.write(`  git_remote_regex: ${r.remoteRegex || '(none)'}\n`);
  process.stdout.write(`  hard_floor:       [${r.hardFloor.join(', ')}]\n`);
  process.stdout.write(`Wrote:\n`);
  process.stdout.write(`  ${r.ymlPath}\n`);
  process.stdout.write(`  ${r.markerPath}\n`);
  if (r.gitignoreUpdated) {
    process.stdout.write(`  added .harness-profile to .gitignore\n`);
  }
}
