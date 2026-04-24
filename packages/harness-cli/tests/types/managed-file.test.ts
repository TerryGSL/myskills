import Ajv from 'ajv/dist/2020.js';
import fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  ManagedFileRecord,
  ManagedFilesState,
  ConflictResolution,
} from '../../src/types/managed-file.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('ManagedFile canonical schema', () => {
  const ajv = new Ajv({ allErrors: true });
  const schema = fs.readJsonSync(
    path.join(__dirname, '../../resources/schemas/managed-file.schema.json')
  );
  const validate = ajv.compile(schema);

  it('ConflictResolution has 4 values', () => {
    const all: ConflictResolution[] = ['unchanged', 'update-available', 'user-modified', 'conflict'];
    expect(all).toHaveLength(4);
  });

  it('valid ManagedFilesState validates', () => {
    const state: ManagedFilesState = {
      schemaVersion: 1,
      managedFiles: [
        {
          path: 'CLAUDE.md',
          category: 'agents',
          strategy: 'generated',
          sourceHash: 'abc123',
          targetHash: 'abc123',
          lastSyncedAt: '2026-04-24T10:00:00Z',
        },
      ],
    };
    expect(validate(state)).toBe(true);
  });

  it('missing sourceHash rejected', () => {
    const bad = {
      schemaVersion: 1,
      managedFiles: [
        { path: 'x', category: 'agents', strategy: 'copy', targetHash: 'y', lastSyncedAt: 'now' },
      ],
    };
    expect(validate(bad)).toBe(false);
  });
});
