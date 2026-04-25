import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import { performRetrieval } from '../../src/utils/knowledge-retrieval.js';
import type { KnowledgeCheck } from '../../src/types/knowledge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function tmpProject(name = 'harness-cli-knowledge-retrieval-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function writeFile(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.ensureDirSync(path.dirname(abs));
  fs.writeFileSync(abs, body, 'utf8');
}

const ajv = new Ajv({ allErrors: true, strict: false });
const schemaPath = path.resolve(
  __dirname,
  '..',
  '..',
  'resources',
  'schemas',
  'knowledgeCheck.schema.json',
);
const schema = fs.readJsonSync(schemaPath);
const validate = ajv.compile(schema);

function assertValidKnowledgeCheck(value: KnowledgeCheck): void {
  const ok = validate(value);
  if (!ok) {
    throw new Error(
      `KnowledgeCheck does not match schema: ${JSON.stringify(validate.errors)}`,
    );
  }
}

function manifest(opts: {
  domain: string;
  status?: 'active' | 'drifted' | 'partial' | 'superseded_by:other.md';
  rules: Array<{
    id: string;
    text: string;
    status?: 'active' | 'expired' | 'drifted' | 'superseded';
    anchor?: string;
  }>;
}): string {
  const status = opts.status ?? 'active';
  let body = `---\n`;
  body += `domain: ${opts.domain}\n`;
  body += `snapshot_id: "scan-2026-04-21T10:00Z"\n`;
  body += `applies_to:\n`;
  body += `  paths: ["src/**"]\n`;
  body += `last_verified: 2026-04-21\n`;
  body += `status: ${status}\n`;
  body += `---\n\n# ${opts.domain}\n\n`;
  for (const r of opts.rules) {
    const a = r.anchor ?? r.id.replace(/[/]/g, '-');
    body += `**Rule ID**: ${r.id}\n`;
    body += `**rule**: ${r.text}\n`;
    body += `**applies**: src/**\n`;
    body += `**Evidence**: evidence.md#${a}\n`;
    body += `**Confidence**: high\n`;
    body += `**Status**: ${r.status ?? 'active'}\n`;
    body += `**violation_test**: free_form_review\n`;
    body += `**manual_review_reason**: heuristic\n`;
    body += `**expiry_after_days**: 90\n\n`;
  }
  return body;
}

describe('performRetrieval — 8-field KnowledgeCheck state', () => {
  it('Case 1 — present + ready: INDEX exists, fresh scan, all rules active', () => {
    const root = tmpProject();
    try {
      writeFile(
        root,
        'docs/harness/knowledge/INDEX.md',
        '---\nschema_version: 1\nsnapshot_id: "scan-2026-04-21T10:00Z"\nlast_full_scan: 2026-04-21\nstatus: active\n---\n\n# Knowledge INDEX\n',
      );
      writeFile(
        root,
        'docs/harness/knowledge/style-and-structure/manifest.md',
        manifest({
          domain: 'style-and-structure',
          rules: [
            { id: 'style/rule-1', text: 'naming convention', anchor: 'naming' },
            { id: 'style/rule-2', text: 'module layout', anchor: 'layout' },
          ],
        }),
      );
      writeFile(
        root,
        'docs/harness/knowledge/style-and-structure/evidence.md',
        '## naming\nfile.ts:10\n\n## layout\nfile.ts:42\n',
      );

      const out = performRetrieval({
        projectRoot: root,
        taskType: 'feature',
        taskDescription: 'add a new endpoint',
        now: '2026-04-25T12:00:00Z',
      });

      expect(out).toEqual({
        disabled: false,
        present: true,
        status: 'ready',
        drifted: false,
        late_recovered: false,
        rules_count: 2,
        examples_count: 2,
        retrieved_at: '2026-04-25T12:00:00Z',
      });
      assertValidKnowledgeCheck(out);
    } finally {
      fs.removeSync(root);
    }
  });

  it('Case 2 — missing: no docs/harness/knowledge/INDEX.md', () => {
    const root = tmpProject();
    try {
      const out = performRetrieval({
        projectRoot: root,
        taskType: 'bugfix',
        taskDescription: 'fix payment race',
        now: '2026-04-25T12:00:00Z',
      });

      expect(out).toEqual({
        disabled: false,
        present: false,
        status: 'missing',
        drifted: false,
        late_recovered: false,
        rules_count: 0,
        examples_count: 0,
        retrieved_at: '2026-04-25T12:00:00Z',
      });
      assertValidKnowledgeCheck(out);
    } finally {
      fs.removeSync(root);
    }
  });

  it('Case 3 — disabled: CLAUDE.md harness-knowledge:disabled wins over INDEX presence', () => {
    const root = tmpProject();
    try {
      writeFile(
        root,
        'CLAUDE.md',
        '# Project\n\n<!-- harness-knowledge:start -->\nharness-knowledge: disabled\n<!-- harness-knowledge:end -->\n',
      );
      writeFile(
        root,
        'docs/harness/knowledge/INDEX.md',
        '---\nlast_full_scan: 2026-04-21\nstatus: active\n---\n',
      );

      const out = performRetrieval({
        projectRoot: root,
        taskType: 'quick',
        taskDescription: 'rename variable',
      });

      expect(out).toEqual({
        disabled: true,
        present: false,
        status: 'missing',
        drifted: false,
        late_recovered: false,
        rules_count: 0,
        examples_count: 0,
        retrieved_at: null,
      });
      assertValidKnowledgeCheck(out);
    } finally {
      fs.removeSync(root);
    }
  });

  it('Case 4 — drifted: per-rule Status: drifted bubbles up to drifted=true (no recovery)', () => {
    const root = tmpProject();
    try {
      writeFile(
        root,
        'docs/harness/knowledge/INDEX.md',
        '---\nlast_full_scan: 2026-04-20\nstatus: drifted\n---\n',
      );
      writeFile(
        root,
        'docs/harness/knowledge/internal-components/manifest.md',
        manifest({
          domain: 'internal-components',
          status: 'drifted',
          rules: [
            { id: 'internal/rule-1', text: 'old wrapper rule', status: 'drifted' },
          ],
        }),
      );

      const out = performRetrieval({
        projectRoot: root,
        taskType: 'refactor',
        taskDescription: 'extract a helper',
        now: '2026-04-25T12:00:00Z',
      });

      expect(out.disabled).toBe(false);
      expect(out.present).toBe(true);
      expect(out.status).toBe('ready');
      expect(out.drifted).toBe(true);
      expect(out.late_recovered).toBe(false);
      expect(out.rules_count).toBe(1);
      // 1 evidence anchor reference from the manifest body (no evidence.md
      // file exists, so only the manifest-side ref counts).
      expect(out.examples_count).toBe(1);
      expect(out.retrieved_at).toBe('2026-04-25T12:00:00Z');
      assertValidKnowledgeCheck(out);
    } finally {
      fs.removeSync(root);
    }
  });

  it('Case 5 — late_recovered: drifted manifest, caller passes lateRecovered=true', () => {
    const root = tmpProject();
    try {
      writeFile(
        root,
        'docs/harness/knowledge/INDEX.md',
        '---\nlast_full_scan: 2026-04-20\nstatus: active\n---\n',
      );
      writeFile(
        root,
        'docs/harness/knowledge/exception-and-error-contracts/manifest.md',
        manifest({
          domain: 'exception-and-error-contracts',
          status: 'drifted',
          rules: [
            { id: 'exc/rule-1', text: 'no raw RuntimeException', status: 'drifted' },
            { id: 'exc/rule-2', text: 'wrap in Result', status: 'active' },
          ],
        }),
      );

      const out = performRetrieval({
        projectRoot: root,
        taskType: 'feature',
        taskDescription: 'add Stripe webhook handler',
        lateRecovered: true,
        now: '2026-04-25T12:00:00Z',
      });

      expect(out.disabled).toBe(false);
      expect(out.present).toBe(true);
      expect(out.status).toBe('ready');
      expect(out.drifted).toBe(true);
      expect(out.late_recovered).toBe(true);
      expect(out.rules_count).toBe(2);
      assertValidKnowledgeCheck(out);
    } finally {
      fs.removeSync(root);
    }
  });

  it('stale path — last_full_scan > 180 days flips status to stale', () => {
    const root = tmpProject();
    try {
      writeFile(
        root,
        'docs/harness/knowledge/INDEX.md',
        '---\nlast_full_scan: 2025-09-01\nstatus: active\n---\n',
      );

      const out = performRetrieval({
        projectRoot: root,
        taskType: 'feature',
        taskDescription: 'anything',
        now: '2026-04-25T12:00:00Z',
      });

      expect(out.present).toBe(true);
      expect(out.status).toBe('stale');
      expect(out.drifted).toBe(false);
      assertValidKnowledgeCheck(out);
    } finally {
      fs.removeSync(root);
    }
  });
});
