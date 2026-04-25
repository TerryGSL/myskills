import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  readState,
  writeState,
  upsertRecord,
  findRecord,
  compareState,
  MANAGED_FILES_PATH,
} from '../../src/utils/managed-files.js';
import { ManagedFilesState, ConflictResolution } from '../../src/types/managed-file.js';
import { sha256 } from '../../src/utils/hash.js';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-mf-'));
}

describe('managed-files read/write', () => {
  it('readState returns null when file absent', () => {
    const root = tmpRoot();
    expect(readState(root)).toBeNull();
    fs.removeSync(root);
  });

  it('writeState then readState round-trips', () => {
    const root = tmpRoot();
    const state: ManagedFilesState = {
      schemaVersion: 1,
      managedFiles: [
        {
          path: 'CLAUDE.md',
          category: 'agents',
          strategy: 'generated',
          sourceHash: 'aaa',
          targetHash: 'aaa',
          lastSyncedAt: '2026-04-24T10:00:00Z',
        },
      ],
    };
    writeState(root, state);
    expect(fs.existsSync(path.join(root, MANAGED_FILES_PATH))).toBe(true);
    const roundtrip = readState(root);
    expect(roundtrip).toEqual(state);
    fs.removeSync(root);
  });

  it('upsertRecord adds new entry', () => {
    const state: ManagedFilesState = { schemaVersion: 1, managedFiles: [] };
    const next = upsertRecord(state, {
      path: 'x.md',
      category: 'docs',
      strategy: 'copy',
      sourceHash: 'h1',
      targetHash: 'h1',
      lastSyncedAt: '2026-04-24T10:00:00Z',
    });
    expect(next.managedFiles).toHaveLength(1);
  });

  it('upsertRecord replaces existing by path', () => {
    const state: ManagedFilesState = {
      schemaVersion: 1,
      managedFiles: [
        {
          path: 'x.md',
          category: 'docs',
          strategy: 'copy',
          sourceHash: 'old',
          targetHash: 'old',
          lastSyncedAt: '2026-04-24T09:00:00Z',
        },
      ],
    };
    const next = upsertRecord(state, {
      path: 'x.md',
      category: 'docs',
      strategy: 'copy',
      sourceHash: 'new',
      targetHash: 'new',
      lastSyncedAt: '2026-04-24T10:00:00Z',
    });
    expect(next.managedFiles).toHaveLength(1);
    expect(next.managedFiles[0].sourceHash).toBe('new');
  });

  it('findRecord returns existing or undefined', () => {
    const state: ManagedFilesState = {
      schemaVersion: 1,
      managedFiles: [
        {
          path: 'x.md',
          category: 'docs',
          strategy: 'copy',
          sourceHash: 'h',
          targetHash: 'h',
          lastSyncedAt: 'x',
        },
      ],
    };
    expect(findRecord(state, 'x.md')?.sourceHash).toBe('h');
    expect(findRecord(state, 'missing.md')).toBeUndefined();
  });
});

describe('managed-files four-state comparison (R2/T3 8-combination matrix)', () => {
  // 8 combinations per R3 sub-plan contract
  //   source × target × bundled  (each present or different from prev)
  // Matrix encoded as: [sourceHash, targetHash, bundledHash] → expected state
  const FIXTURES: Array<{
    label: string;
    sourceHash: string | null; // null = no record (missing)
    targetHash: string | null; // null = target file absent
    bundledHash: string;
    expected: ConflictResolution | 'missing';
  }> = [
    // target = source (user didn't modify)
    { label: 'unchanged: all equal', sourceHash: 'A', targetHash: 'A', bundledHash: 'A', expected: 'unchanged' },
    { label: 'update-available: bundled differs, target=source', sourceHash: 'A', targetHash: 'A', bundledHash: 'B', expected: 'update-available' },
    // target != source (user modified)
    { label: 'user-modified: bundled=source, target differs', sourceHash: 'A', targetHash: 'U', bundledHash: 'A', expected: 'user-modified' },
    { label: 'conflict: all different', sourceHash: 'A', targetHash: 'U', bundledHash: 'B', expected: 'conflict' },
    // target absent (deleted by user)
    { label: 'missing (target absent, source known)', sourceHash: 'A', targetHash: null, bundledHash: 'A', expected: 'missing' },
    { label: 'missing (target absent, bundled changed)', sourceHash: 'A', targetHash: null, bundledHash: 'B', expected: 'missing' },
    // no record yet (first init)
    { label: 'missing (no record, target absent)', sourceHash: null, targetHash: null, bundledHash: 'A', expected: 'missing' },
    { label: 'user-modified (no record, target present — treat as user-owned)', sourceHash: null, targetHash: 'U', bundledHash: 'A', expected: 'user-modified' },
  ];

  it.each(FIXTURES)('$label', ({ sourceHash, targetHash, bundledHash, expected }) => {
    const result = compareState({ sourceHash, targetHash, bundledHash });
    expect(result).toBe(expected);
  });
});
