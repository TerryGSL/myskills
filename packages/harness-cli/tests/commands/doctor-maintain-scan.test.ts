import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInit } from '../../src/commands/init.js';
import { runDoctor } from '../../src/commands/doctor.js';
import { runMaintain } from '../../src/commands/maintain.js';
import { runScan } from '../../src/commands/scan.js';

function tmpProject(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-doctor-'));
  spawnSync('git', ['init', '--quiet'], { cwd: d });
  return d;
}

describe('harness doctor (R4/T1+T2)', () => {
  it('clean project after init → exitCode 0', () => {
    const root = tmpProject();
    runInit({ projectRoot: root, preset: 'personal' });
    const r = runDoctor({ projectRoot: root });
    expect(r.exitCode).toBe(0);
    expect(r.profile).toBe('harness');
    expect(r.workflow_schema_version).toBe('1.0.0');
    expect(r.managed_files_git_status).toBe('untracked');
    fs.removeSync(root);
  });

  it('managed-files git-tracked → error', () => {
    const root = tmpProject();
    runInit({ projectRoot: root, preset: 'personal' });
    // Force-add managed-files.json bypassing gitignore
    spawnSync('git', ['add', '-f', '.harness/managed-files.json'], { cwd: root });
    spawnSync('git', ['commit', '-m', 'bad', '--no-gpg-sign'], { cwd: root });
    const r = runDoctor({ projectRoot: root });
    expect(r.exitCode).toBe(2);
    expect(r.managed_files_git_status).toBe('tracked');
    expect(r.issues.find((i) => i.code === 'managed-files-tracked')).toBeDefined();
    fs.removeSync(root);
  });

  it('schema too new → error (high version → abort, AD4)', () => {
    const root = tmpProject();
    runInit({ projectRoot: root, preset: 'personal' });
    const cur = fs.readJsonSync(path.join(root, '.harness/current.json'));
    cur.workflow_schema_version = '99.0.0';
    fs.writeJsonSync(path.join(root, '.harness/current.json'), cur, { spaces: 2 });
    const r = runDoctor({ projectRoot: root });
    expect(r.exitCode).toBe(2);
    expect(r.issues.find((i) => i.code === 'schema-too-new')).toBeDefined();
    fs.removeSync(root);
  });

  it('memory tree missing → warn', () => {
    const root = tmpProject();
    runInit({ projectRoot: root, preset: 'personal' });
    fs.removeSync(path.join(root, 'docs/memory/cases'));
    const r = runDoctor({ projectRoot: root });
    expect(r.exitCode).toBeGreaterThanOrEqual(1);
    expect(r.issues.find((i) => i.code === 'memory-tree-incomplete')).toBeDefined();
    fs.removeSync(root);
  });
});

describe('harness maintain (R4/T5+T6)', () => {
  it('default maintain: reports health issues + promotable flags', () => {
    const root = tmpProject();
    runInit({ projectRoot: root, preset: 'personal' });
    const r = runMaintain({ projectRoot: root, preset: 'personal' });
    expect(r.exitCode).toBe(0);
    expect(Array.isArray(r.promotableFlags)).toBe(true);
    fs.removeSync(root);
  });

  it('maintain --upgrade re-applies bundled via four-state (idempotent on clean)', () => {
    const root = tmpProject();
    runInit({ projectRoot: root, preset: 'personal' });
    const r = runMaintain({ projectRoot: root, preset: 'personal', upgrade: true });
    expect(r.exitCode).toBe(0);
    expect(r.upgrade).toBeDefined();
    // No real bundled change between two runs → no new files written, no conflicts
    expect(r.upgrade?.conflicts).toHaveLength(0);
    fs.removeSync(root);
  });
});

describe('harness scan shell (R4/T7)', () => {
  it('memory missing → blocked', () => {
    const root = tmpProject();
    const r = runScan({ projectRoot: root });
    expect(r.exitCode).toBe(2);
    expect(r.action).toBe('blocked');
  });

  it('after init → writes scan-request.json', () => {
    const root = tmpProject();
    runInit({ projectRoot: root, preset: 'personal' });
    const r = runScan({ projectRoot: root, budgetMin: 15, domain: 'style-and-structure' });
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('request-written');
    const req = fs.readJsonSync(path.join(root, '.harness/scan-request.json'));
    expect(req.status).toBe('scan_requested');
    expect(req.budgetMin).toBe(15);
    expect(req.domain).toBe('style-and-structure');
    fs.removeSync(root);
  });

  it('--apply-answers writes status=apply_answers_pending', () => {
    const root = tmpProject();
    runInit({ projectRoot: root, preset: 'personal' });
    const r = runScan({ projectRoot: root, applyAnswers: true });
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('apply-answers-written');
    const req = fs.readJsonSync(path.join(root, '.harness/scan-request.json'));
    expect(req.status).toBe('apply_answers_pending');
    fs.removeSync(root);
  });
});
