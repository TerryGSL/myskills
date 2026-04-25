import fs from 'fs-extra';
import * as path from 'node:path';

export const MEMORY_ROOT = 'docs/memory';
export const MEMORY_CONTRACT = 'docs/memory/.harness-memory.yml';
export const MEMORY_SCORECARD = 'docs/memory/harness_reviewer_scorecard.yml';
export const MEMORY_SUBDIRS = ['cases', 'decisions', 'constraints', 'archive'] as const;

/**
 * Fast sanity check: does `docs/memory/` exist with the contract file
 * + four subdirectories? Used by `doctor` and `scan` preflight.
 */
export function memoryTreeIntact(projectRoot: string): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  const contractPath = path.join(projectRoot, MEMORY_CONTRACT);
  if (!fs.existsSync(contractPath)) missing.push(MEMORY_CONTRACT);
  for (const sub of MEMORY_SUBDIRS) {
    const subDir = path.join(projectRoot, MEMORY_ROOT, sub);
    if (!fs.existsSync(subDir)) missing.push(`${MEMORY_ROOT}/${sub}/`);
  }
  return { ok: missing.length === 0, missing };
}
