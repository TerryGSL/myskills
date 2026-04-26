import fs from 'fs-extra';
import * as path from 'node:path';
import type { KnowledgeCheck } from '../types/knowledge.js';

/**
 * Stage -0.5 knowledge retrieval (PR C3).
 *
 * Produces the 8-field {@link KnowledgeCheck} state object written to
 * `.harness-status.json.knowledgeCheck`.
 *
 * Source-of-truth references:
 *   - `resources/schemas/knowledgeCheck.schema.json` (PR A2.1)
 *   - `harness-common/contracts/knowledge.md` retrieval section
 *
 * **Scope guard**: this PR does NOT modify scan.ts. The retrieval output
 * is consumed by `harness route --json` (PR C5) and by Stage 4 late
 * recovery; scanner-side concerns (writing manifests, scout, etc.) are
 * unchanged.
 *
 * The reader is intentionally tolerant: missing files, unparseable
 * frontmatter, and partial manifests degrade to a well-formed
 * KnowledgeCheck with `status: 'missing'` rather than throwing — Stage 4
 * uses the field values to decide whether to BLOCK / warn / proceed.
 */

export type TaskType = 'quick' | 'bugfix' | 'feature' | 'refactor';

export interface RetrievalInput {
  projectRoot: string;
  taskType: TaskType;
  taskDescription: string;
  /**
   * Stage 4 late-recovery flag. When the coordinator already detected a
   * drift and recovered via the diff-based fallback, the caller passes
   * `lateRecovered: true` so the reviewer-facing state reflects the
   * salvage. Default false.
   */
  lateRecovered?: boolean;
  /**
   * Override "now" for deterministic tests. ISO 8601 string.
   */
  now?: string;
}

const STALE_DAYS = 180;

const KNOWLEDGE_DIR = path.posix.join('docs', 'harness', 'knowledge');
const INDEX_FILE = 'INDEX.md';
const MANIFEST_FILE = 'manifest.md';
const EVIDENCE_FILE = 'evidence.md';

const DISABLE_BLOCK_RE =
  /<!--\s*harness-knowledge:start\s*-->([\s\S]*?)<!--\s*harness-knowledge:end\s*-->/i;
const DISABLE_LINE_RE = /^\s*harness-knowledge:\s*disabled\s*$/im;

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/;

interface ManifestSummary {
  rules: number;
  examples: number;
  drifted: boolean;
}

function safeReadText(file: string): string | null {
  try {
    if (!fs.existsSync(file)) return null;
    if (!fs.statSync(file).isFile()) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function isClaudeMdDisabled(projectRoot: string): boolean {
  const claudeMd = safeReadText(path.join(projectRoot, 'CLAUDE.md'));
  if (!claudeMd) return false;
  const block = DISABLE_BLOCK_RE.exec(claudeMd);
  if (!block) return false;
  return DISABLE_LINE_RE.test(block[1]);
}

function indexLastFullScan(indexBody: string): Date | null {
  // Match either YAML frontmatter `last_full_scan: 2026-01-02` or
  // a body line `**Last full scan**: 2026-01-02` / `last_full_scan: ...`.
  const fm = FRONTMATTER_RE.exec(indexBody);
  if (fm) {
    const m = /^last_full_scan:\s*"?([\d-]+(?:T[\d:Z.+-]+)?)"?\s*$/im.exec(
      fm[1],
    );
    if (m) {
      const d = new Date(m[1]);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const inline =
    /(?:\*\*Last full scan\*\*|last_full_scan)\s*[:=]\s*"?([\d-]+(?:T[\d:Z.+-]+)?)"?/i.exec(
      indexBody,
    );
  if (inline) {
    const d = new Date(inline[1]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function isIndexDrifted(indexBody: string): boolean {
  const fm = FRONTMATTER_RE.exec(indexBody);
  if (fm && /^status:\s*drifted\s*$/im.test(fm[1])) return true;
  // Also surface body-level "INDEX.status: drifted" if scanner stored it
  // outside frontmatter.
  return /\bINDEX\.status\b\s*[:=]\s*drifted/i.test(indexBody);
}

function listKnowledgeDomains(projectRoot: string): string[] {
  const root = path.join(projectRoot, KNOWLEDGE_DIR);
  if (!fs.existsSync(root)) return [];
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    const abs = path.join(root, name);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    if (fs.existsSync(path.join(abs, MANIFEST_FILE))) {
      out.push(name);
    }
  }
  return out.sort();
}

/**
 * Parse a single manifest.md and report (rules, examples, drifted).
 *
 * - `rules`: count of `**Rule ID**:` markers in the body.
 * - `examples`: distinct evidence anchors referenced from manifest body
 *   (`evidence.md#<anchor>`) plus `## <anchor>` headers from a sibling
 *   evidence.md when present.
 * - `drifted`: frontmatter `status: drifted` / `status: superseded_by:...`
 *   OR any per-rule `**Status**: drifted` / `**Status**: superseded`.
 */
function summarizeManifest(domainDir: string): ManifestSummary {
  const manifestPath = path.join(domainDir, MANIFEST_FILE);
  const body = safeReadText(manifestPath);
  if (body == null) {
    return { rules: 0, examples: 0, drifted: false };
  }

  let drifted = false;
  const fm = FRONTMATTER_RE.exec(body);
  if (fm) {
    if (/^status:\s*drifted\s*$/im.test(fm[1])) drifted = true;
    if (/^status:\s*superseded_by:/im.test(fm[1])) drifted = true;
  }

  const rules =
    (body.match(/^\s*\*\*Rule ID\*\*\s*:/gm) ?? []).length;

  if (
    /^\s*\*\*Status\*\*\s*:\s*(drifted|superseded)\s*$/im.test(body)
  ) {
    drifted = true;
  }

  // Examples are evidence anchor refs from manifest body.
  const evidenceRefs = new Set<string>();
  const refRe = /evidence\.md#([\w-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = refRe.exec(body)) !== null) {
    evidenceRefs.add(match[1]);
  }

  // If there's a sibling evidence.md, count its `## <anchor>` headers as
  // additional example evidence (anchors not necessarily referenced from
  // manifest still count as examples for this domain).
  const evidencePath = path.join(domainDir, EVIDENCE_FILE);
  const evidenceBody = safeReadText(evidencePath);
  if (evidenceBody) {
    const headerRe = /^##\s+([\w-]+)\b/gm;
    let h: RegExpExecArray | null;
    while ((h = headerRe.exec(evidenceBody)) !== null) {
      evidenceRefs.add(h[1]);
    }
  }

  return {
    rules,
    examples: evidenceRefs.size,
    drifted,
  };
}

function nowIso(now?: string): string {
  if (now) return now;
  return new Date().toISOString();
}

/**
 * Compute the 8-field KnowledgeCheck state for a project.
 *
 * Step ordering mirrors `harness-common/contracts/knowledge.md`:
 *   Step 0: disable check (CLAUDE.md `harness-knowledge: disabled`)
 *   Step 1: INDEX.md presence
 *   Step 2: aggregate manifest summary (rules / examples / drifted)
 *   Step 3: stale check (last_full_scan > 180d -> status='stale')
 */
export function performRetrieval(input: RetrievalInput): KnowledgeCheck {
  const { projectRoot, lateRecovered = false, now } = input;
  // taskType / taskDescription are reserved for future per-domain routing
  // (Stage -0.5 Step 2). PR C3 reports project-wide aggregate state; per
  // request routing lands in PR C5.
  void input.taskType;
  void input.taskDescription;

  // Step 0: disable check
  if (isClaudeMdDisabled(projectRoot)) {
    return {
      disabled: true,
      present: false,
      status: 'missing',
      drifted: false,
      late_recovered: false,
      rules_count: 0,
      examples_count: 0,
      retrieved_at: null,
    };
  }

  const indexPath = path.join(projectRoot, KNOWLEDGE_DIR, INDEX_FILE);
  const indexBody = safeReadText(indexPath);

  // Step 1: INDEX presence
  if (indexBody == null) {
    return {
      disabled: false,
      present: false,
      status: 'missing',
      drifted: false,
      late_recovered: false,
      rules_count: 0,
      examples_count: 0,
      retrieved_at: nowIso(now),
    };
  }

  // Step 2: aggregate per-domain manifest summary
  const domains = listKnowledgeDomains(projectRoot);
  let rules = 0;
  let examples = 0;
  let drifted = isIndexDrifted(indexBody);
  for (const d of domains) {
    const s = summarizeManifest(
      path.join(projectRoot, KNOWLEDGE_DIR, d),
    );
    rules += s.rules;
    examples += s.examples;
    if (s.drifted) drifted = true;
  }

  // Step 3: stale check (last_full_scan > STALE_DAYS days)
  let stale = false;
  const lastScan = indexLastFullScan(indexBody);
  if (lastScan) {
    const ageMs =
      (now ? new Date(now).getTime() : Date.now()) - lastScan.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > STALE_DAYS) stale = true;
  }

  // late_recovered only makes sense alongside drift (Stage 4 salvage of
  // a drifted manifest). If caller passes the flag without drift it is
  // accepted verbatim so callers can express their own semantics.
  const finalLateRecovered = !!lateRecovered;

  return {
    disabled: false,
    present: true,
    status: stale ? 'stale' : 'ready',
    drifted,
    late_recovered: finalLateRecovered,
    rules_count: rules,
    examples_count: examples,
    retrieved_at: nowIso(now),
  };
}
