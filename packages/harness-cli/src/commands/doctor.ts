import fs from 'fs-extra';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readMarker, MARKER_PATH } from '../utils/profile.js';
import { readState, MANAGED_FILES_PATH } from '../utils/managed-files.js';
import { memoryTreeIntact } from '../utils/memory.js';

export interface DoctorIssue {
  severity: 'error' | 'warn' | 'info';
  code: string;
  message: string;
}

export interface DoctorResult {
  version: string;
  schema_version: string;
  installed_presets: string[];
  managed_files_git_status: 'untracked' | 'tracked' | 'not-present';
  workflow_schema_version: string | null;
  profile: string | null;
  issues: DoctorIssue[];
  /** Worst-case exit code: 0 = healthy, 1 = warn, 2 = error */
  exitCode: 0 | 1 | 2;
}

export const HARNESS_CLI_VERSION = '0.1.0';
export const SCHEMA_VERSION = '1.0.0';

export interface DoctorInput {
  projectRoot: string;
}

export function runDoctor(input: DoctorInput): DoctorResult {
  const { projectRoot } = input;
  const issues: DoctorIssue[] = [];

  // 1) managed-files git tracking check (AD8.2 hard-fail)
  const managedRel = MANAGED_FILES_PATH;
  const managedAbs = path.join(projectRoot, managedRel);
  let gitStatus: DoctorResult['managed_files_git_status'] = 'not-present';
  if (fs.existsSync(managedAbs)) {
    const r = spawnSync('git', ['-C', projectRoot, 'ls-files', '--error-unmatch', managedRel], {
      encoding: 'utf8',
    });
    if (r.status === 0) {
      gitStatus = 'tracked';
      issues.push({
        severity: 'error',
        code: 'managed-files-tracked',
        message: `${managedRel} is tracked by git. Run: git rm --cached ${managedRel}`,
      });
    } else {
      gitStatus = 'untracked';
    }
  }

  // 2) schema version sentinel (R6 precursor)
  let workflowSchemaVersion: string | null = null;
  const currentPath = path.join(projectRoot, '.harness/current.json');
  if (fs.existsSync(currentPath)) {
    try {
      const current = fs.readJsonSync(currentPath);
      workflowSchemaVersion = current.workflow_schema_version ?? null;
      if (workflowSchemaVersion === null) {
        issues.push({
          severity: 'warn',
          code: 'missing-schema-sentinel',
          message: '.harness/current.json lacks workflow_schema_version — migration needed',
        });
      } else {
        // Compare against this CLI's understanding
        if (compareSemver(workflowSchemaVersion, SCHEMA_VERSION) > 0) {
          issues.push({
            severity: 'error',
            code: 'schema-too-new',
            message: `project wants schema ${workflowSchemaVersion} but CLI supports up to ${SCHEMA_VERSION} — upgrade CLI`,
          });
        }
      }
    } catch (e) {
      issues.push({
        severity: 'error',
        code: 'current-json-unparseable',
        message: `.harness/current.json is malformed: ${(e as Error).message}`,
      });
    }
  }

  // 3) memory tree intact
  const mem = memoryTreeIntact(projectRoot);
  if (!mem.ok) {
    issues.push({
      severity: 'warn',
      code: 'memory-tree-incomplete',
      message: `docs/memory missing: ${mem.missing.join(', ')} — run 'harness adopt'`,
    });
  }

  // 4) profile marker
  const marker = readMarker(projectRoot);
  if (!marker) {
    issues.push({
      severity: 'warn',
      code: 'no-profile-marker',
      message: `${MARKER_PATH} missing — run 'harness init' or 'harness adopt'`,
    });
  }

  // 5) installed presets (look inside bundled resources/presets/)
  const installed: string[] = [];
  try {
    const harnessConfigPath = path.join(projectRoot, 'harness.config.json');
    if (fs.existsSync(harnessConfigPath)) {
      const cfg = fs.readJsonSync(harnessConfigPath);
      if (Array.isArray(cfg.extends)) installed.push(...(cfg.extends as string[]));
    }
  } catch {
    // ignore
  }

  let exitCode: 0 | 1 | 2 = 0;
  for (const i of issues) {
    if (i.severity === 'error') exitCode = 2;
    else if (i.severity === 'warn' && exitCode < 1) exitCode = 1;
  }

  return {
    version: HARNESS_CLI_VERSION,
    schema_version: SCHEMA_VERSION,
    installed_presets: installed,
    managed_files_git_status: gitStatus,
    workflow_schema_version: workflowSchemaVersion,
    profile: marker?.profile ?? null,
    issues,
    exitCode,
  };
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
