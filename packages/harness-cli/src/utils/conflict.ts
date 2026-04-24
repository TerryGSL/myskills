import fs from 'fs-extra';
import * as path from 'node:path';
import { ConflictResolution } from '../types/managed-file.js';

export interface ConflictInput {
  profile: string;
  state: ConflictResolution | 'missing';
  path: string;
}

export interface ConflictDecision {
  action: 'noop' | 'apply' | 'skip' | 'write-rej' | 'abort-batch';
  exitCode: 0 | 1 | 2;
  blockBatch: boolean;
  message: string;
}

/**
 * Decide what to do given four-state + profile.
 *
 * Per spec §6.3:
 * - personal profile: conflict → write .rej.<ts>, non-zero exit, don't block batch
 * - company-mt profile: conflict → BLOCK whole batch (hard_floor philosophy)
 * - user-modified: always skip (preserve user changes)
 * - update-available: always apply new bundled
 * - missing: write fresh
 * - unchanged: no-op
 */
export function resolveConflict(input: ConflictInput): ConflictDecision {
  const { profile, state, path: p } = input;

  switch (state) {
    case 'unchanged':
      return { action: 'noop', exitCode: 0, blockBatch: false, message: `unchanged: ${p}` };
    case 'update-available':
      return { action: 'apply', exitCode: 0, blockBatch: false, message: `updating: ${p}` };
    case 'missing':
      return { action: 'apply', exitCode: 0, blockBatch: false, message: `creating: ${p}` };
    case 'user-modified':
      return {
        action: 'skip',
        exitCode: 0,
        blockBatch: false,
        message: `skip (user-modified): ${p}`,
      };
    case 'conflict':
      if (profile === 'company-mt') {
        return {
          action: 'abort-batch',
          exitCode: 2,
          blockBatch: true,
          message: `company-mt hard_floor: managed_file_conflict at ${p} — batch BLOCKED`,
        };
      }
      return {
        action: 'write-rej',
        exitCode: 1,
        blockBatch: false,
        message: `conflict at ${p} — writing .rej file; user must resolve manually`,
      };
  }
}

/**
 * Write bundled content to `<path>.rej.<timestamp>` next to target.
 * Returns full path to written reject file.
 */
export function writeRejFile(
  projectRoot: string,
  relativePath: string,
  bundledContent: string,
): string {
  const timestamp = Date.now();
  const rejPath = path.join(projectRoot, `${relativePath}.rej.${timestamp}`);
  fs.ensureDirSync(path.dirname(rejPath));
  fs.writeFileSync(rejPath, bundledContent);
  return rejPath;
}

export type { ConflictResolution } from '../types/managed-file.js';
