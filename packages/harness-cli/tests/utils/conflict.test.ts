import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  resolveConflict,
  writeRejFile,
  ConflictDecision,
} from '../../src/utils/conflict.js';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-conflict-'));
}

describe('conflict resolution (R2/T6)', () => {
  it('personal profile: conflict → write .rej, non-zero exit', () => {
    const decision = resolveConflict({
      profile: 'personal',
      state: 'conflict',
      path: 'CLAUDE.md',
    });
    expect(decision.action).toBe('write-rej');
    expect(decision.exitCode).toBe(1);
    expect(decision.blockBatch).toBe(false);
  });

  it('company-mt profile: conflict → BLOCK whole batch', () => {
    const decision = resolveConflict({
      profile: 'company-mt',
      state: 'conflict',
      path: 'CLAUDE.md',
    });
    expect(decision.action).toBe('abort-batch');
    expect(decision.exitCode).toBe(2);
    expect(decision.blockBatch).toBe(true);
  });

  it('user-modified: skip (preserve user), zero exit', () => {
    const decision = resolveConflict({
      profile: 'personal',
      state: 'user-modified',
      path: 'CLAUDE.md',
    });
    expect(decision.action).toBe('skip');
    expect(decision.exitCode).toBe(0);
  });

  it('update-available: apply new bundled', () => {
    const decision = resolveConflict({
      profile: 'personal',
      state: 'update-available',
      path: 'CLAUDE.md',
    });
    expect(decision.action).toBe('apply');
    expect(decision.exitCode).toBe(0);
  });

  it('unchanged: no-op', () => {
    const decision = resolveConflict({
      profile: 'personal',
      state: 'unchanged',
      path: 'CLAUDE.md',
    });
    expect(decision.action).toBe('noop');
    expect(decision.exitCode).toBe(0);
  });

  it('missing: write fresh', () => {
    const decision = resolveConflict({
      profile: 'personal',
      state: 'missing',
      path: 'CLAUDE.md',
    });
    expect(decision.action).toBe('apply');
    expect(decision.exitCode).toBe(0);
  });

  it('writeRejFile creates .rej.<timestamp> file with bundled content', () => {
    const root = tmpRoot();
    const rejPath = writeRejFile(root, 'CLAUDE.md', '# new bundled content');
    expect(fs.existsSync(rejPath)).toBe(true);
    expect(rejPath).toMatch(/CLAUDE\.md\.rej\.\d+$/);
    const content = fs.readFileSync(rejPath, 'utf8');
    expect(content).toBe('# new bundled content');
    fs.removeSync(root);
  });
});
