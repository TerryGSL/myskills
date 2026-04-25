import fs from 'fs-extra';
import * as path from 'node:path';
import { memoryTreeIntact } from '../utils/memory.js';

export interface ScanInput {
  projectRoot: string;
  applyAnswers?: boolean;
  budgetMin?: number;
  domain?: string;
}

export interface ScanResult {
  exitCode: 0 | 1 | 2;
  action: 'request-written' | 'apply-answers-written' | 'blocked';
  reason?: string;
}

/**
 * R4 scope: CLI-side preflight + hand-off marker. The actual 5-domain AI scanner
 * pipeline runs via harness-workflow Stage -0.5 subagents (not CLI). This command
 * validates preconditions (memory tree present per spec §G1 fix), then writes
 * `.harness/scan-request.json` that harness-workflow skill will pick up.
 */
export function runScan(input: ScanInput): ScanResult {
  const { projectRoot, applyAnswers, budgetMin, domain } = input;

  // Preflight: memory tree must exist (spec G1 fix — scanner depends on it)
  const mem = memoryTreeIntact(projectRoot);
  if (!mem.ok) {
    return {
      exitCode: 2,
      action: 'blocked',
      reason: `memory tree incomplete: missing ${mem.missing.join(', ')} — run 'harness adopt' first`,
    };
  }

  const requestFile = path.join(projectRoot, '.harness/scan-request.json');
  fs.ensureDirSync(path.dirname(requestFile));

  const request = {
    schemaVersion: 1,
    requestedAt: new Date().toISOString(),
    applyAnswers: Boolean(applyAnswers),
    budgetMin: budgetMin ?? 28,
    domain: domain ?? null,
    status: applyAnswers ? 'apply_answers_pending' : 'scan_requested',
  };
  fs.writeJsonSync(requestFile, request, { spaces: 2 });

  return {
    exitCode: 0,
    action: applyAnswers ? 'apply-answers-written' : 'request-written',
  };
}
