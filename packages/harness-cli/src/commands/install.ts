import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * harness install — user-global setup (~/.claude/profiles + settings.json hook + skills symlinks).
 *
 * Spec §A PR 2 (docs/superpowers/specs/2026-04-26-harness-fusion-design.md).
 *
 * Behavior:
 *   - default = check + auto-fix
 *   - --doctor = check only (no writes)
 *   - --json = machine-readable output
 *
 * Steps:
 *   1. profiles dir mkdir if missing
 *   2. seed default.yml / harness.yml / company.yml.template if missing (atomic mktemp + mv)
 *   3. settings.json 3-state branch:
 *        missing   → write minimal JSON registering hooks.Stop[] entry
 *        malformed → backup as <path>.bak.invalid, status=error, do NOT touch original
 *        valid     → backup .bak, merge hooks.Stop[] (skip if hook already registered), atomic mv
 *   4. skills symlink check + repair (overwrites broken links)
 *   5. Tier 3 tool detection (bash / python3 / realpath) — warn-only, never fail
 *
 * Hook path is FIXED to `${repoRoot}/hooks/context-monitor.sh`.
 */

export interface InstallInput {
  /** Repo root of the myskills clone (used to derive hook script path + skill source dirs). */
  repoRoot: string;
  /** Check-only mode. No writes. */
  doctor?: boolean;
  /** Machine-readable output (mode flag for caller; this module only returns structure). */
  json?: boolean;
  /** Override $HOME for tests. */
  homeDir?: string;
}

export type InstallStatus = 'ok' | 'check-only-missing' | 'error';

export interface InstallStep {
  step: 1 | 2 | 3 | 4 | 5;
  name: string;
  /** 'ok' = nothing to do; 'fixed' = wrote/repaired; 'missing' = doctor mode found gap; 'error' = blocking failure */
  state: 'ok' | 'fixed' | 'missing' | 'error';
  detail?: string;
}

export interface Tier3Tools {
  bash: boolean;
  python3: boolean;
  realpath: boolean;
}

export interface InstallResult {
  status: InstallStatus;
  doctor: boolean;
  steps: InstallStep[];
  filesWritten: string[];
  /** Hook absolute path that was registered (or expected). */
  hookPath: string;
  tier3Tools: Tier3Tools;
  /** Warnings (e.g. tier-3 tool missing). */
  warnings: string[];
  /** Profile / settings paths used (absolute). */
  paths: {
    profilesDir: string;
    settingsJson: string;
    skillsDir: string;
  };
}

/** Skill names that get symlinked from `${repoRoot}/<name>` → `~/.claude/skills/<name>`. */
const SKILLS = [
  'profile-entry',
  'harness-common',
  'harness-quick',
  'harness-bugfix',
  'harness-feature',
  'harness-refactor',
  'harness-init',
  'task-dispatcher',
  'strict-reviewer',
  'harness-workflow',
  'team-pd',
  'team-architect',
  'team-senior-dev',
  'team-junior-dev',
  'team-qa',
  'team-security',
  'investigate',
  'office-hours',
];

function atomicWrite(targetPath: string, content: string): void {
  fs.ensureDirSync(path.dirname(targetPath));
  const tmp = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, targetPath);
}

function defaultYmlContent(): string {
  return `# default.yml — fallback profile (priority 0, path_glob ** matches all)
name: default
description: 默认 profile（无项目特定配置时使用）

detection:
  priority: 0
  matchers:
    - type: path_glob
      pattern: "**"

entry_skill: profile-entry

task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor

default_mode: conservative

hard_floor: []
`;
}

function harnessYmlContent(): string {
  return `# harness.yml — personal-project profile
name: harness
description: 个人项目 profile — 默认 standard aggression。

detection:
  priority: 10
  matchers:
    - type: path_glob
      pattern: "~/Music/myskills/**"
    - type: git_remote_regex
      pattern: "github\\\\.com[:/]TerryGSL/.*"

entry_skill: profile-entry

task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor

default_mode: standard

hard_floor: []
`;
}

function companyTemplateContent(): string {
  return `# company.yml.template — copy + edit for company projects (use \`harness profile-bootstrap\`)
# hard_floor list MUST NOT be empty for company projects (default safety floor).
name: company-REPLACE_ME
description: 公司项目 profile — 严格审查，绝不自动 push

detection:
  priority: 20
  matchers:
    - type: path_glob
      pattern: "REPLACE_ME"
    - type: git_remote_regex
      pattern: "REPLACE_ME"

entry_skill: profile-entry

task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor

default_mode: conservative

hard_floor:
  - auto_push
  - force_push
  - destructive_ops
  - auto_merge
`;
}

interface SettingsJson {
  hooks?: {
    Stop?: Array<{
      matcher?: string;
      hooks?: Array<{ type: string; command: string }>;
    }>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

function minimalSettingsJson(hookPath: string): SettingsJson {
  return {
    hooks: {
      Stop: [
        {
          matcher: '',
          hooks: [{ type: 'command', command: hookPath }],
        },
      ],
    },
  };
}

function hookAlreadyRegistered(settings: SettingsJson, hookPath: string): boolean {
  const stops = settings.hooks?.Stop;
  if (!Array.isArray(stops)) return false;
  for (const entry of stops) {
    const hooks = entry?.hooks;
    if (!Array.isArray(hooks)) continue;
    for (const h of hooks) {
      if (h?.type === 'command' && h?.command === hookPath) return true;
    }
  }
  return false;
}

function mergeHook(settings: SettingsJson, hookPath: string): SettingsJson {
  const out: SettingsJson = { ...settings };
  const hooks = { ...(out.hooks ?? {}) };
  const stops = Array.isArray(hooks.Stop) ? [...hooks.Stop] : [];
  stops.push({
    matcher: '',
    hooks: [{ type: 'command', command: hookPath }],
  });
  hooks.Stop = stops;
  out.hooks = hooks;
  return out;
}

function which(cmd: string): boolean {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0 && (r.stdout?.trim().length ?? 0) > 0;
}

function isSymlinkPointingTo(linkPath: string, expected: string): boolean {
  try {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return false;
    const actual = fs.readlinkSync(linkPath);
    return actual === expected;
  } catch {
    return false;
  }
}

export function runInstall(input: InstallInput): InstallResult {
  const home = input.homeDir ?? os.homedir();
  const profilesDir = path.join(home, '.claude', 'profiles');
  const skillsDir = path.join(home, '.claude', 'skills');
  const settingsJson = path.join(home, '.claude', 'settings.json');
  const hookPath = path.join(input.repoRoot, 'hooks', 'context-monitor.sh');
  const doctor = !!input.doctor;

  const steps: InstallStep[] = [];
  const filesWritten: string[] = [];
  const warnings: string[] = [];
  let status: InstallStatus = 'ok';
  let anyMissing = false;

  // ── Step 1: profiles dir ────────────────────────────────────────────────
  if (!fs.existsSync(profilesDir)) {
    if (doctor) {
      steps.push({ step: 1, name: 'profiles-dir', state: 'missing', detail: profilesDir });
      anyMissing = true;
    } else {
      fs.ensureDirSync(profilesDir);
      steps.push({ step: 1, name: 'profiles-dir', state: 'fixed', detail: profilesDir });
      filesWritten.push(profilesDir);
    }
  } else {
    steps.push({ step: 1, name: 'profiles-dir', state: 'ok', detail: profilesDir });
  }

  // ── Step 2: seed yml files ──────────────────────────────────────────────
  const ymlSeeds: Array<{ rel: string; writer: () => string }> = [
    { rel: 'default.yml', writer: defaultYmlContent },
    { rel: 'harness.yml', writer: harnessYmlContent },
    { rel: 'company.yml.template', writer: companyTemplateContent },
  ];
  for (const { rel, writer } of ymlSeeds) {
    const target = path.join(profilesDir, rel);
    if (fs.existsSync(target)) {
      steps.push({ step: 2, name: `yml:${rel}`, state: 'ok', detail: target });
      continue;
    }
    if (doctor) {
      steps.push({ step: 2, name: `yml:${rel}`, state: 'missing', detail: target });
      anyMissing = true;
    } else {
      // Need profilesDir to exist before writing children. ensureDir is safe / idempotent.
      fs.ensureDirSync(profilesDir);
      atomicWrite(target, writer());
      steps.push({ step: 2, name: `yml:${rel}`, state: 'fixed', detail: target });
      filesWritten.push(target);
    }
  }

  // ── Step 3: settings.json (3-state) ─────────────────────────────────────
  if (!fs.existsSync(settingsJson)) {
    if (doctor) {
      steps.push({ step: 3, name: 'settings.json', state: 'missing', detail: settingsJson });
      anyMissing = true;
    } else {
      const minimal = minimalSettingsJson(hookPath);
      atomicWrite(settingsJson, JSON.stringify(minimal, null, 2) + '\n');
      steps.push({
        step: 3,
        name: 'settings.json',
        state: 'fixed',
        detail: 'created minimal settings.json with Stop hook',
      });
      filesWritten.push(settingsJson);
    }
  } else {
    // Try to parse
    let parsed: SettingsJson | null = null;
    let parseError: Error | null = null;
    try {
      parsed = JSON.parse(fs.readFileSync(settingsJson, 'utf8')) as SettingsJson;
    } catch (e) {
      parseError = e as Error;
    }
    if (parseError) {
      // malformed → backup .bak.invalid, do NOT touch original, mark error
      const bakInvalid = `${settingsJson}.bak.invalid`;
      if (!doctor) {
        try {
          fs.copyFileSync(settingsJson, bakInvalid);
        } catch {
          // best-effort backup; still report error
        }
      }
      steps.push({
        step: 3,
        name: 'settings.json',
        state: 'error',
        detail: `malformed JSON, backed up to ${bakInvalid}: ${parseError.message}`,
      });
      status = 'error';
    } else if (parsed && hookAlreadyRegistered(parsed, hookPath)) {
      steps.push({
        step: 3,
        name: 'settings.json',
        state: 'ok',
        detail: 'hook already registered',
      });
    } else {
      // valid but missing hook → merge
      if (doctor) {
        steps.push({
          step: 3,
          name: 'settings.json',
          state: 'missing',
          detail: 'hook not registered',
        });
        anyMissing = true;
      } else {
        const bak = `${settingsJson}.bak`;
        fs.copyFileSync(settingsJson, bak);
        const merged = mergeHook(parsed ?? {}, hookPath);
        atomicWrite(settingsJson, JSON.stringify(merged, null, 2) + '\n');
        steps.push({
          step: 3,
          name: 'settings.json',
          state: 'fixed',
          detail: `merged Stop hook, backup at ${bak}`,
        });
        filesWritten.push(settingsJson);
      }
    }
  }

  // ── Step 4: skills symlinks ─────────────────────────────────────────────
  for (const skill of SKILLS) {
    const linkPath = path.join(skillsDir, skill);
    const targetPath = path.join(input.repoRoot, skill);
    if (isSymlinkPointingTo(linkPath, targetPath)) {
      steps.push({ step: 4, name: `skill:${skill}`, state: 'ok' });
      continue;
    }
    // Either missing, broken link, or points elsewhere
    if (doctor) {
      steps.push({
        step: 4,
        name: `skill:${skill}`,
        state: 'missing',
        detail: `expected symlink ${linkPath} → ${targetPath}`,
      });
      anyMissing = true;
    } else {
      fs.ensureDirSync(skillsDir);
      // Remove stale entry (file, broken symlink, wrong-target symlink)
      try {
        fs.lstatSync(linkPath);
        fs.removeSync(linkPath);
      } catch {
        // didn't exist
      }
      try {
        fs.symlinkSync(targetPath, linkPath);
        steps.push({ step: 4, name: `skill:${skill}`, state: 'fixed', detail: linkPath });
        filesWritten.push(linkPath);
      } catch (e) {
        steps.push({
          step: 4,
          name: `skill:${skill}`,
          state: 'error',
          detail: `symlink failed: ${(e as Error).message}`,
        });
        status = 'error';
      }
    }
  }

  // ── Step 5: Tier 3 tool detection (warn-only) ──────────────────────────
  const tier3Tools: Tier3Tools = {
    bash: which('bash'),
    python3: which('python3'),
    realpath: which('realpath'),
  };
  const missingTools = (Object.keys(tier3Tools) as Array<keyof Tier3Tools>).filter(
    (k) => !tier3Tools[k],
  );
  if (missingTools.length > 0) {
    const w = `Tier 3 tools missing: ${missingTools.join(', ')} (warn-only — bash fallback may not work)`;
    warnings.push(w);
    steps.push({ step: 5, name: 'tier3-tools', state: 'ok', detail: w });
  } else {
    steps.push({ step: 5, name: 'tier3-tools', state: 'ok', detail: 'bash / python3 / realpath all present' });
  }

  // Final status resolution
  if (status !== 'error') {
    if (doctor && anyMissing) {
      status = 'check-only-missing';
    } else {
      status = 'ok';
    }
  }

  return {
    status,
    doctor,
    steps,
    filesWritten,
    hookPath,
    tier3Tools,
    warnings,
    paths: {
      profilesDir,
      settingsJson,
      skillsDir,
    },
  };
}

export function printHumanSummary(r: InstallResult): void {
  const mode = r.doctor ? 'doctor (check only)' : 'install (check + auto-fix)';
  process.stdout.write(`harness install — ${mode}\n`);
  process.stdout.write(`hook path: ${r.hookPath}\n`);
  for (const s of r.steps) {
    const tag =
      s.state === 'ok' ? '✓' : s.state === 'fixed' ? '＋' : s.state === 'missing' ? '✗' : '!';
    process.stdout.write(`  [step ${s.step}] ${tag} ${s.name}${s.detail ? ` — ${s.detail}` : ''}\n`);
  }
  if (r.warnings.length) {
    for (const w of r.warnings) process.stderr.write(`warn: ${w}\n`);
  }
  process.stdout.write(`status: ${r.status}\n`);
}
