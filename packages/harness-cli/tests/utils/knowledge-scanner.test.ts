import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import {
  scanKnowledge,
  KNOWLEDGE_DOMAINS,
  type KnowledgeDomain,
  type KnowledgeDomainItem,
} from '../../src/utils/knowledge-scanner.js';

function tmpProject(name = 'harness-cli-knowledge-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function writeFile(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.ensureDirSync(path.dirname(abs));
  fs.writeFileSync(abs, body, 'utf8');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ajv = new Ajv({ allErrors: true, strict: false });
const schemaPath = path.resolve(
  __dirname,
  '..',
  '..',
  'resources',
  'schemas',
  'knowledge.schema.json',
);
const schema = fs.readJsonSync(schemaPath);
const validate = ajv.compile(schema);

function getDomain(
  result: ReturnType<typeof scanKnowledge>,
  name: KnowledgeDomain,
) {
  const item = result.domains.find((d) => d.domain === name);
  if (!item) throw new Error(`domain ${name} missing`);
  return item;
}

describe('knowledge-scanner — 5-domain manifest', () => {
  it('returns all 5 domains in canonical order on an empty project', () => {
    const root = tmpProject();
    try {
      const r = scanKnowledge(root);
      expect(r.domains.map((d) => d.domain)).toEqual(KNOWLEDGE_DOMAINS);
      expect(typeof r.scanned_at).toBe('string');
      expect(r.project_root).toBe(root);
      // Each domain item must validate against the schema
      for (const item of r.domains as KnowledgeDomainItem[]) {
        const domainName = item.domain;
        const ok = validate(item);
        if (!ok) {
          // Surface ajv errors for easier debugging
          throw new Error(
            `schema invalid for ${domainName}: ${JSON.stringify(validate.errors)}`,
          );
        }
        expect(typeof item.manifest).toBe('string');
        expect(item.manifest.length).toBeGreaterThan(0);
        expect(Array.isArray(item.rules)).toBe(true);
        expect(Array.isArray(item.examples)).toBe(true);
      }
    } finally {
      fs.removeSync(root);
    }
  });

  it('api: detects routes/handlers and emits a rule', () => {
    const root = tmpProject();
    try {
      writeFile(
        root,
        'src/routes/users.ts',
        `import { Router } from 'express';
const router = Router();
router.get('/users', (req, res) => res.json([]));
export default router;
`,
      );
      writeFile(
        root,
        'src/controllers/orders.ts',
        `class Orders { @GetMapping('/orders') list() {} }`,
      );
      const r = scanKnowledge(root);
      const api = getDomain(r, 'api');
      expect(api.rules.length).toBeGreaterThan(0);
      expect(api.rules[0].id).toMatch(/^api\//);
      expect(api.examples.length).toBeGreaterThan(0);
      expect(api.examples[0].ref).toMatch(/:\d+$/);
    } finally {
      fs.removeSync(root);
    }
  });

  it('db: detects migrations and prisma schema', () => {
    const root = tmpProject();
    try {
      writeFile(
        root,
        'prisma/schema.prisma',
        `generator client { provider = "prisma-client-js" }`,
      );
      writeFile(
        root,
        'migrations/20240101_init.sql',
        `CREATE TABLE users (id INT PRIMARY KEY);`,
      );
      const r = scanKnowledge(root);
      const db = getDomain(r, 'db');
      expect(db.rules.find((x) => x.id === 'db/rule-1')).toBeDefined();
      expect(db.rules.find((x) => x.id === 'db/rule-2')).toBeDefined();
      expect(db.examples.some((e) => e.ref.includes('schema.prisma'))).toBe(
        true,
      );
    } finally {
      fs.removeSync(root);
    }
  });

  it('business-rules: detects services with policy/validate keywords', () => {
    const root = tmpProject();
    try {
      writeFile(
        root,
        'src/services/payment.ts',
        `export function validatePayment(amount: number) {
  if (amount <= 0) throw new Error('invalid');
}
`,
      );
      writeFile(
        root,
        'src/domain/order-policy.ts',
        `// authorize order
export const policy = { allow: () => true };
`,
      );
      const r = scanKnowledge(root);
      const br = getDomain(r, 'business-rules');
      expect(br.rules.length).toBeGreaterThan(0);
      expect(br.examples.length).toBeGreaterThan(0);
    } finally {
      fs.removeSync(root);
    }
  });

  it('config: detects package.json + .env', () => {
    const root = tmpProject();
    try {
      writeFile(root, 'package.json', '{"name":"x","version":"0.0.1"}');
      writeFile(root, '.env', 'API_KEY=abc');
      const r = scanKnowledge(root);
      const cfg = getDomain(r, 'config');
      expect(cfg.rules.find((x) => x.id === 'config/rule-1')).toBeDefined();
      expect(cfg.rules.find((x) => x.id === 'config/rule-2')).toBeDefined();
      expect(cfg.examples.some((e) => e.ref === 'package.json')).toBe(true);
    } finally {
      fs.removeSync(root);
    }
  });

  it('deployment: detects Dockerfile + GitHub Actions + fly.toml', () => {
    const root = tmpProject();
    try {
      writeFile(root, 'Dockerfile', 'FROM node:22\n');
      writeFile(
        root,
        '.github/workflows/ci.yml',
        `name: ci\non: [push]\njobs: { build: { runs-on: ubuntu-latest, steps: [] } }\n`,
      );
      writeFile(root, 'fly.toml', 'app = "x"\n');
      const r = scanKnowledge(root);
      const dep = getDomain(r, 'deployment');
      expect(dep.rules.find((x) => x.id === 'deployment/rule-1')).toBeDefined();
      expect(dep.rules.find((x) => x.id === 'deployment/rule-2')).toBeDefined();
      expect(dep.rules.find((x) => x.id === 'deployment/rule-3')).toBeDefined();
      expect(dep.examples.some((e) => e.ref === 'Dockerfile')).toBe(true);
      expect(dep.examples.some((e) => e.ref === 'fly.toml')).toBe(true);
    } finally {
      fs.removeSync(root);
    }
  });

  it('respects domain filter (subset)', () => {
    const root = tmpProject();
    try {
      const r = scanKnowledge(root, { domains: ['api', 'db'] });
      // Filter only narrows which scanners run; emitted items match.
      expect(r.domains.map((d) => d.domain).sort()).toEqual(['api', 'db']);
    } finally {
      fs.removeSync(root);
    }
  });

  it('schema validation: every domain item conforms even when populated', () => {
    const root = tmpProject();
    try {
      writeFile(root, 'package.json', '{"name":"x"}');
      writeFile(root, 'Dockerfile', 'FROM node:22');
      writeFile(root, 'src/routes/x.ts', 'router.get("/x", () => {})');
      writeFile(root, 'migrations/001.sql', 'SELECT 1;');
      writeFile(root, 'src/services/p.ts', 'function validate(){}');
      const r = scanKnowledge(root);
      for (const item of r.domains as KnowledgeDomainItem[]) {
        const domainName = item.domain;
        const ok = validate(item);
        if (!ok) {
          throw new Error(
            `schema invalid for ${domainName}: ${JSON.stringify(validate.errors)}`,
          );
        }
      }
    } finally {
      fs.removeSync(root);
    }
  });
});
