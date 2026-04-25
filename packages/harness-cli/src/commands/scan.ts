import fs from 'fs-extra';
import * as path from 'node:path';
import { memoryTreeIntact } from '../utils/memory.js';
import {
  scanKnowledge,
  type KnowledgeDomain,
  type KnowledgeScanResult,
  KNOWLEDGE_DOMAINS,
} from '../utils/knowledge-scanner.js';

export interface ScanInput {
  projectRoot: string;
  applyAnswers?: boolean;
  budgetMin?: number;
  domain?: string;
  /** When true, run the local 5-domain heuristic scanner and return the manifest in `knowledge`. */
  json?: boolean;
}

export interface ScanResult {
  exitCode: 0 | 1 | 2;
  action: 'request-written' | 'apply-answers-written' | 'blocked' | 'json-manifest';
  reason?: string;
  knowledge?: KnowledgeScanResult;
}

/**
 * R4 scope: CLI-side preflight + hand-off marker. The full 5-domain AI scanner
 * pipeline runs via harness-workflow Stage -0.5 subagents (not CLI). This command
 * validates preconditions (memory tree present per spec §G1 fix), then writes
 * `.harness/scan-request.json` that harness-workflow skill will pick up.
 *
 * PR C2: when invoked with `json: true`, runs a local heuristic 5-domain
 * scanner (api / db / business-rules / config / deployment) and returns a
 * manifest conforming to `resources/schemas/knowledge.schema.json`. Used by
 * harness-workflow Stage -0.5 as a fast pre-pass before the AI scanner.
 */
export function runScan(input: ScanInput): ScanResult {
  const { projectRoot, applyAnswers, budgetMin, domain, json } = input;

  if (json) {
    const requested = parseDomainFilter(domain);
    if (requested === 'invalid') {
      return {
        exitCode: 2,
        action: 'blocked',
        reason: `unknown domain '${domain}' — must be one of: ${KNOWLEDGE_DOMAINS.join(', ')}`,
      };
    }
    const result = scanKnowledge(projectRoot, { domains: requested });
    return {
      exitCode: 0,
      action: 'json-manifest',
      knowledge: result,
    };
  }

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

function parseDomainFilter(
  domain: string | undefined,
): KnowledgeDomain[] | undefined | 'invalid' {
  if (!domain) return undefined;
  const list = domain
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return undefined;
  for (const d of list) {
    if (!KNOWLEDGE_DOMAINS.includes(d as KnowledgeDomain)) return 'invalid';
  }
  return list as KnowledgeDomain[];
}
