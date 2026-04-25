import fs from 'fs-extra';
import * as path from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import { fileURLToPath } from 'node:url';
import {
  ManagedFileRecord,
  ManagedFilesState,
  ConflictResolution,
} from '../types/managed-file.js';

export const MANAGED_FILES_PATH = '.harness/managed-files.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '../../resources/schemas/managed-file.schema.json');

const ajv = new Ajv({ allErrors: true });
let _validate: ((data: unknown) => boolean) | null = null;

function validator() {
  if (_validate === null) {
    const schema = fs.readJsonSync(SCHEMA_PATH);
    _validate = ajv.compile(schema);
  }
  return _validate;
}

/**
 * Read `.harness/managed-files.json` from a project root.
 * Returns null if the file doesn't exist.
 * Throws if the file exists but fails schema validation.
 */
export function readState(projectRoot: string): ManagedFilesState | null {
  const filePath = path.join(projectRoot, MANAGED_FILES_PATH);
  if (!fs.existsSync(filePath)) return null;
  const data = fs.readJsonSync(filePath);
  const validate = validator();
  if (!validate(data)) {
    throw new Error(`managed-files.json schema violation at ${filePath}`);
  }
  return data as ManagedFilesState;
}

/**
 * Write ManagedFilesState to `.harness/managed-files.json`.
 * Creates parent directory if missing.
 * Validates against schema before writing (fail fast).
 */
export function writeState(projectRoot: string, state: ManagedFilesState): void {
  const validate = validator();
  if (!validate(state)) {
    throw new Error('refusing to write invalid ManagedFilesState');
  }
  const filePath = path.join(projectRoot, MANAGED_FILES_PATH);
  fs.ensureDirSync(path.dirname(filePath));
  fs.writeJsonSync(filePath, state, { spaces: 2 });
}

/**
 * Find a record by path. Returns undefined if not found.
 */
export function findRecord(
  state: ManagedFilesState,
  managedPath: string,
): ManagedFileRecord | undefined {
  return state.managedFiles.find((r) => r.path === managedPath);
}

/**
 * Insert-or-update a record by path.
 * Returns a new state (immutable).
 */
export function upsertRecord(
  state: ManagedFilesState,
  record: ManagedFileRecord,
): ManagedFilesState {
  const idx = state.managedFiles.findIndex((r) => r.path === record.path);
  const next = [...state.managedFiles];
  if (idx >= 0) {
    next[idx] = record;
  } else {
    next.push(record);
  }
  return { schemaVersion: 1, managedFiles: next };
}

export interface CompareInput {
  sourceHash: string | null; // null = no prior record (first init)
  targetHash: string | null; // null = file absent on disk
  bundledHash: string; // what CLI wants to write (current bundled resources)
}

/**
 * Four-state comparison matrix (R3 sub-plan contract, 8 combinations covered by fixtures):
 *
 * | target vs source | bundled vs source | state             |
 * |------------------|-------------------|-------------------|
 * | equal            | equal             | unchanged         |
 * | equal            | differ            | update-available  |
 * | differ           | equal             | user-modified     |
 * | differ           | differ            | conflict          |
 * | target absent    | —                 | missing           |
 * | no record,target | —                 | user-modified     |
 */
export function compareState(
  input: CompareInput,
): ConflictResolution | 'missing' {
  const { sourceHash, targetHash, bundledHash } = input;

  // target file absent on disk
  if (targetHash === null) return 'missing';

  // no prior record but target exists → user-owned, don't overwrite
  if (sourceHash === null) return 'user-modified';

  const targetEqSource = targetHash === sourceHash;
  const bundledEqSource = bundledHash === sourceHash;

  if (targetEqSource && bundledEqSource) return 'unchanged';
  if (targetEqSource && !bundledEqSource) return 'update-available';
  if (!targetEqSource && bundledEqSource) return 'user-modified';
  return 'conflict';
}
