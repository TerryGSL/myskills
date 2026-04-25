import { checkMemoryTree, type MemoryCheckReport } from '../utils/memory.js';

export interface MemoryCheckInput {
  projectRoot?: string;
  json?: boolean;
}

export interface MemoryCheckOutput extends MemoryCheckReport {
  exitCode: 0 | 2;
}

/**
 * `harness memory check [--json]` — validate the project's three-layer memory
 * write-permission matrix.
 *
 * Behaviour:
 *   - Reads `docs/memory/` + workflow/session anchors under projectRoot.
 *   - Returns the static matrix plus any current violations conform to
 *     `resources/schemas/memory.schema.json`.
 *   - `exitCode` is `0` when no violations, `2` when at least one violation
 *     is reported.
 *
 * Spec: docs/superpowers/specs/2026-04-26-unified-fusion-design.md §14 #7
 */
export function runMemoryCheck(input: MemoryCheckInput): MemoryCheckOutput {
  const projectRoot = input.projectRoot ?? process.cwd();
  const report = checkMemoryTree(projectRoot);
  const exitCode: 0 | 2 = report.current_violations.length === 0 ? 0 : 2;
  return { ...report, exitCode };
}
