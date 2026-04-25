import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { runInstall } from '../../src/commands/install.js';

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-install-'));
}

function tmpRepo(): string {
  // Stand-in for the myskills repo root. We don't need real skill content —
  // install only ln -sf ${repoRoot}/<skill>; the link target may be missing
  // and the test still verifies symlink existence + target.
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-repo-'));
  fs.ensureDirSync(path.join(r, 'hooks'));
  fs.writeFileSync(path.join(r, 'hooks', 'context-monitor.sh'), '#!/usr/bin/env bash\n');
  return r;
}

describe('harness install (R6/PR 2)', () => {
  let homeDir: string;
  let repoRoot: string;

  beforeEach(() => {
    homeDir = tmpHome();
    repoRoot = tmpRepo();
  });

  afterEach(() => {
    fs.removeSync(homeDir);
    fs.removeSync(repoRoot);
  });

  it('1) default mode: creates profiles dir + ymls + minimal settings.json', () => {
    const r = runInstall({ homeDir, repoRoot });
    expect(r.status).toBe('ok');
    expect(r.doctor).toBe(false);

    // profiles dir + 3 ymls
    const profilesDir = path.join(homeDir, '.claude', 'profiles');
    expect(fs.existsSync(profilesDir)).toBe(true);
    expect(fs.existsSync(path.join(profilesDir, 'default.yml'))).toBe(true);
    expect(fs.existsSync(path.join(profilesDir, 'harness.yml'))).toBe(true);
    expect(fs.existsSync(path.join(profilesDir, 'company.yml.template'))).toBe(true);

    // settings.json minimal — must be valid JSON containing the fixed hook path
    const settingsPath = path.join(homeDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(settings.hooks.Stop).toBeDefined();
    const hookPath = path.join(repoRoot, 'hooks', 'context-monitor.sh');
    expect(r.hookPath).toBe(hookPath);
    const allCommands = settings.hooks.Stop.flatMap(
      (s: { hooks?: Array<{ command: string }> }) => s.hooks ?? [],
    ).map((h: { command: string }) => h.command);
    expect(allCommands).toContain(hookPath);

    // No backup created on virgin install
    expect(fs.existsSync(`${settingsPath}.bak`)).toBe(false);
    expect(fs.existsSync(`${settingsPath}.bak.invalid`)).toBe(false);
  });

  it('2) --doctor mode: lists missing items but does NOT write', () => {
    const r = runInstall({ homeDir, repoRoot, doctor: true });
    expect(r.doctor).toBe(true);
    expect(r.status).toBe('check-only-missing');

    // Nothing was written
    const profilesDir = path.join(homeDir, '.claude', 'profiles');
    expect(fs.existsSync(profilesDir)).toBe(false);
    expect(fs.existsSync(path.join(homeDir, '.claude', 'settings.json'))).toBe(false);
    expect(r.filesWritten.length).toBe(0);

    // Reports show missing entries
    expect(r.steps.some((s) => s.state === 'missing')).toBe(true);
  });

  it('3) malformed settings.json: backup as .bak.invalid + status=error, original untouched', () => {
    const settingsPath = path.join(homeDir, '.claude', 'settings.json');
    fs.ensureDirSync(path.dirname(settingsPath));
    const garbage = '{ this is not valid JSON';
    fs.writeFileSync(settingsPath, garbage);

    const r = runInstall({ homeDir, repoRoot });
    expect(r.status).toBe('error');

    // Backup created
    expect(fs.existsSync(`${settingsPath}.bak.invalid`)).toBe(true);
    expect(fs.readFileSync(`${settingsPath}.bak.invalid`, 'utf8')).toBe(garbage);

    // Original NOT modified
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe(garbage);

    // Step 3 reports error
    const step3 = r.steps.find((s) => s.step === 3 && s.name === 'settings.json');
    expect(step3?.state).toBe('error');
  });

  it('4) valid settings.json missing hook: auto-merge + .bak created', () => {
    const settingsPath = path.join(homeDir, '.claude', 'settings.json');
    fs.ensureDirSync(path.dirname(settingsPath));
    const original = { permissions: { allow: ['Bash(ls:*)'] } };
    fs.writeFileSync(settingsPath, JSON.stringify(original, null, 2));

    const r = runInstall({ homeDir, repoRoot });
    expect(r.status).toBe('ok');

    // .bak written with original
    expect(fs.existsSync(`${settingsPath}.bak`)).toBe(true);
    expect(JSON.parse(fs.readFileSync(`${settingsPath}.bak`, 'utf8'))).toEqual(original);

    // Original now contains the hook + preserves existing keys
    const merged = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(merged.permissions).toEqual(original.permissions); // preserved
    expect(merged.hooks?.Stop).toBeDefined();
    const hookPath = path.join(repoRoot, 'hooks', 'context-monitor.sh');
    const cmds = merged.hooks.Stop.flatMap(
      (s: { hooks?: Array<{ command: string }> }) => s.hooks ?? [],
    ).map((h: { command: string }) => h.command);
    expect(cmds).toContain(hookPath);

    // Idempotent re-run: no second .bak write, hook NOT duplicated
    const r2 = runInstall({ homeDir, repoRoot });
    expect(r2.status).toBe('ok');
    const merged2 = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const cmds2 = merged2.hooks.Stop.flatMap(
      (s: { hooks?: Array<{ command: string }> }) => s.hooks ?? [],
    ).map((h: { command: string }) => h.command);
    expect(cmds2.filter((c: string) => c === hookPath).length).toBe(1);
  });

  it('5) tier3Tools field structure: { bash, python3, realpath } with booleans', () => {
    const r = runInstall({ homeDir, repoRoot, doctor: true });
    expect(r.tier3Tools).toBeDefined();
    expect(typeof r.tier3Tools.bash).toBe('boolean');
    expect(typeof r.tier3Tools.python3).toBe('boolean');
    expect(typeof r.tier3Tools.realpath).toBe('boolean');
    // tier-3 detection MUST appear as a step regardless of doctor mode
    expect(r.steps.some((s) => s.step === 5 && s.name === 'tier3-tools')).toBe(true);
  });
});
