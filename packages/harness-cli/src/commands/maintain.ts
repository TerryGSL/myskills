import { runInit, InitInput } from './init.js';
import { runDoctor } from './doctor.js';
import { detectPromotables, PromotionFlag } from '../utils/learnings.js';

export interface MaintainInput {
  projectRoot: string;
  preset: 'personal' | 'company-mt';
  upgrade?: boolean;
}

export interface MaintainResult {
  exitCode: 0 | 1 | 2;
  healthIssues: number;
  promotableFlags: PromotionFlag[];
  upgrade?: {
    filesWritten: string[];
    conflicts: string[];
    blockedBy?: string;
  };
}

/**
 * `harness maintain` — daily drift check + retention reminder.
 * `harness maintain --upgrade` — re-run init with new bundled; four-state handles conflicts.
 */
export function runMaintain(input: MaintainInput): MaintainResult {
  const { projectRoot, preset, upgrade } = input;

  const doc = runDoctor({ projectRoot });
  const flags = detectPromotables(projectRoot);

  let upgradeResult: MaintainResult['upgrade'];
  let exitCode: 0 | 1 | 2 = doc.exitCode;

  if (upgrade) {
    const init: InitInput = { projectRoot, preset };
    const r = runInit(init);
    upgradeResult = {
      filesWritten: r.filesWritten,
      conflicts: r.conflicts,
      blockedBy: r.blockedBy,
    };
    if (r.exitCode > exitCode) exitCode = r.exitCode;
  }

  return {
    exitCode,
    healthIssues: doc.issues.length,
    promotableFlags: flags,
    upgrade: upgradeResult,
  };
}
