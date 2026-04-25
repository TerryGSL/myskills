import fs from 'fs-extra';
import * as path from 'node:path';
import { sha256, sha256File } from './hash.js';
import {
  readState,
  writeState,
  upsertRecord,
  findRecord,
  compareState,
} from './managed-files.js';
import { resolveConflict, writeRejFile } from './conflict.js';
import {
  ManagedCategory,
  ManagedStrategy,
  ManagedFilesState,
} from '../types/managed-file.js';

export interface MaterializeInput {
  projectRoot: string;
  bundledPath: string;
  targetRelative: string;
  category: ManagedCategory;
  strategy: ManagedStrategy;
  profile: string;
  /** Optional state to pass through (batch mode); if omitted, reads/writes on disk. */
  state?: ManagedFilesState;
}

export interface MaterializeResult {
  action: 'apply' | 'noop' | 'skip' | 'write-rej' | 'abort-batch';
  exitCode: 0 | 1 | 2;
  blockBatch: boolean;
  message: string;
  rejPath?: string;
  /** Updated state (caller should persist if in batch mode). */
  state: ManagedFilesState;
}

/**
 * Materialize one bundled resource into target project per four-state policy.
 * Registers/updates `.harness/managed-files.json` entry.
 * Single-file variant — batch variant (materialize) should wrap this with
 * abort-batch handling for company-mt.
 */
export function materializeFile(input: MaterializeInput): MaterializeResult {
  const { projectRoot, bundledPath, targetRelative, category, strategy, profile } = input;

  if (!fs.existsSync(bundledPath)) {
    throw new Error(`bundled resource missing: ${bundledPath}`);
  }

  const bundledContent = fs.readFileSync(bundledPath, 'utf8');
  const bundledHash = sha256(bundledContent);

  const state: ManagedFilesState = input.state ?? readState(projectRoot) ?? {
    schemaVersion: 1,
    managedFiles: [],
  };

  const targetAbs = path.join(projectRoot, targetRelative);
  const record = findRecord(state, targetRelative);
  const targetHash = fs.existsSync(targetAbs) ? sha256File(targetAbs) : null;
  const sourceHash = record?.sourceHash ?? null;

  const cmp = compareState({ sourceHash, targetHash, bundledHash });
  const decision = resolveConflict({ profile, state: cmp, path: targetRelative });

  let nextState = state;
  let rejPath: string | undefined;

  switch (decision.action) {
    case 'apply': {
      fs.ensureDirSync(path.dirname(targetAbs));
      fs.writeFileSync(targetAbs, bundledContent);
      nextState = upsertRecord(state, {
        path: targetRelative,
        category,
        strategy,
        sourceHash: bundledHash,
        targetHash: bundledHash,
        lastSyncedAt: new Date().toISOString(),
      });
      break;
    }
    case 'noop':
    case 'skip':
      // state unchanged
      break;
    case 'write-rej':
      rejPath = writeRejFile(projectRoot, targetRelative, bundledContent);
      // state unchanged; user must resolve manually
      break;
    case 'abort-batch':
      // Do nothing; caller must stop
      break;
  }

  // Persist state only if we read from disk (batch caller owns persistence)
  if (!input.state && nextState !== state) {
    writeState(projectRoot, nextState);
  }

  return {
    action: decision.action,
    exitCode: decision.exitCode,
    blockBatch: decision.blockBatch,
    message: decision.message,
    rejPath,
    state: nextState,
  };
}
