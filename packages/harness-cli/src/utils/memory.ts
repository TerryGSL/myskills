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

// ---------------------------------------------------------------------------
// PR C4: 三层 memory 写入权限矩阵 + checkMemoryTree
// Spec: docs/superpowers/specs/2026-04-26-unified-fusion-design.md §14 #7
// Contract: harness-common/contracts/memory.md
// Schema: packages/harness-cli/resources/schemas/memory.schema.json
// ---------------------------------------------------------------------------

export const MEMORY_LAYERS = ['project', 'workflow', 'session'] as const;
export type MemoryLayer = (typeof MEMORY_LAYERS)[number];

export const MEMORY_WRITERS = ['leaf', 'reviewer', 'user'] as const;
export type MemoryWriter = (typeof MEMORY_WRITERS)[number];

/**
 * One row of the three-layer memory write-permission matrix.
 * Mirrors `resources/schemas/memory.schema.json`.
 */
export interface MemoryLayerEntry {
  layer: MemoryLayer;
  writer: MemoryWriter;
  /** Glob-or-literal path relative to projectRoot. Globs use `<dir>/*.<ext>`. */
  file_path: string;
  allowed_stages: string[];
}

/**
 * Static three-layer write-permission matrix (source of truth: contracts/memory.md).
 *
 * | layer    | writer   | file_path                  | allowed_stages                                 |
 * |----------|----------|----------------------------|------------------------------------------------|
 * | project  | leaf     | docs/memory/decisions/*.md | feature Stage 4 / refactor commit              |
 * | project  | reviewer | docs/memory/cases/*.md     | reviewer hard-floor case                       |
 * | project  | user     | docs/memory/errors.md      | any (user-driven)                              |
 * | workflow | leaf     | .harness/walkthrough.md    | any step within a round                        |
 * | session  | runtime  | .harness/current.json      | runtime (non-persistent)                       |
 */
export function getLayers(): MemoryLayerEntry[] {
  return [
    {
      layer: 'project',
      writer: 'leaf',
      file_path: 'docs/memory/decisions/*.md',
      allowed_stages: ['feature:stage4', 'refactor:commit'],
    },
    {
      layer: 'project',
      writer: 'reviewer',
      file_path: 'docs/memory/cases/*.md',
      allowed_stages: ['reviewer:hard-floor'],
    },
    {
      layer: 'project',
      writer: 'user',
      file_path: 'docs/memory/errors.md',
      allowed_stages: ['any'],
    },
    {
      layer: 'workflow',
      writer: 'leaf',
      file_path: '.harness/walkthrough.md',
      allowed_stages: ['round:any-step'],
    },
    {
      layer: 'session',
      // Schema enum is { leaf, reviewer, user }; the runtime layer reports
      // 'user' here because runtime writes are ephemeral and not subject to
      // a leaf/reviewer attribution.
      writer: 'user',
      file_path: '.harness/current.json',
      allowed_stages: ['runtime'],
    },
  ];
}

export interface MemoryViolation {
  /** Project-relative path of the offending file (or expected file). */
  file: string;
  /** The writer the matrix expects for this file_path. */
  expected_writer: MemoryWriter;
  /** What we observed (only set when we can attribute a writer; otherwise undefined). */
  actual_writer?: MemoryWriter;
  /** Short machine-readable rule id. */
  rule: 'missing-file' | 'missing-directory' | 'wrong-writer' | 'stage-not-allowed';
}

export interface MemoryCheckReport {
  layers: MemoryLayerEntry[];
  current_violations: MemoryViolation[];
}

/**
 * Convert a matrix `file_path` (with optional trailing `/<dir>/*.md`) to a glob predicate.
 * Returns either an exact filename or a directory + extension pair.
 */
function parseMatrixPath(
  filePath: string,
): { kind: 'exact'; rel: string } | { kind: 'glob'; dir: string; ext: string } {
  const m = /^(.+)\/\*\.(\w+)$/.exec(filePath);
  if (m) {
    return { kind: 'glob', dir: m[1], ext: '.' + m[2] };
  }
  return { kind: 'exact', rel: filePath };
}

/**
 * Read the file's frontmatter / leading metadata to attribute a writer.
 * Recognises a `writer:` key in the first ~20 lines (YAML frontmatter or
 * top-of-file comment). Returns undefined when no attribution can be parsed.
 */
function readWriterAttribution(absPath: string): MemoryWriter | undefined {
  let buf: string;
  try {
    buf = fs.readFileSync(absPath, 'utf8');
  } catch {
    return undefined;
  }
  const head = buf.split(/\r?\n/).slice(0, 20).join('\n');
  const m = /(?:^|\n)\s*writer:\s*["']?(leaf|reviewer|user)["']?/i.exec(head);
  if (!m) return undefined;
  const w = m[1].toLowerCase();
  if (w === 'leaf' || w === 'reviewer' || w === 'user') return w;
  return undefined;
}

/**
 * Scan `docs/memory/` (and the workflow/session anchors) under `projectRoot`
 * and validate against the three-layer matrix. Returns the matrix itself plus
 * a list of any violations discovered.
 *
 * Detection rules (conservative — false-positive averse):
 *   - For glob layer entries (e.g. `docs/memory/cases/*.md`): each matching
 *     file is inspected; if its frontmatter declares a `writer:` field that
 *     contradicts the matrix, emit `wrong-writer`. Files without an explicit
 *     `writer:` declaration are NOT flagged.
 *   - For exact-path layer entries: a missing file is reported as
 *     `missing-file` only when the surrounding memory tree is otherwise
 *     intact (avoids noise on fresh, un-init'd projects).
 *   - Workflow / session anchors (outside docs/memory/) are always checked.
 */
export function checkMemoryTree(projectRoot: string): MemoryCheckReport {
  const layers = getLayers();
  const violations: MemoryViolation[] = [];
  const memOk = memoryTreeIntact(projectRoot).ok;

  for (const entry of layers) {
    const parsed = parseMatrixPath(entry.file_path);

    if (parsed.kind === 'exact') {
      const abs = path.join(projectRoot, parsed.rel);
      if (!fs.existsSync(abs)) {
        const insideMemoryRoot = parsed.rel.startsWith(MEMORY_ROOT + '/');
        if (!insideMemoryRoot || memOk) {
          violations.push({
            file: parsed.rel,
            expected_writer: entry.writer,
            rule: 'missing-file',
          });
        }
        continue;
      }
      const actual = readWriterAttribution(abs);
      if (actual && actual !== entry.writer) {
        violations.push({
          file: parsed.rel,
          expected_writer: entry.writer,
          actual_writer: actual,
          rule: 'wrong-writer',
        });
      }
      continue;
    }

    // glob: scan directory for matching extension
    const dirAbs = path.join(projectRoot, parsed.dir);
    if (!fs.existsSync(dirAbs)) {
      if (!memOk) continue;
      violations.push({
        file: parsed.dir + '/',
        expected_writer: entry.writer,
        rule: 'missing-directory',
      });
      continue;
    }
    let names: string[] = [];
    try {
      names = fs.readdirSync(dirAbs);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(parsed.ext)) continue;
      const fileAbs = path.join(dirAbs, name);
      const fileRel = path.posix.join(parsed.dir, name);
      const actual = readWriterAttribution(fileAbs);
      if (actual && actual !== entry.writer) {
        violations.push({
          file: fileRel,
          expected_writer: entry.writer,
          actual_writer: actual,
          rule: 'wrong-writer',
        });
      }
    }
  }

  return { layers, current_violations: violations };
}
