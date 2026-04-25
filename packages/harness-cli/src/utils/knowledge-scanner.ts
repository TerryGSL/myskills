import fs from 'fs-extra';
import * as path from 'node:path';
import { globbySync } from 'globby';

/**
 * 5-domain knowledge manifest scanner (PR C2).
 *
 * Each domain produces a per-domain item that conforms to
 * `resources/schemas/knowledge.schema.json`:
 *
 *   { domain, manifest, rules[{id,text,status?}], examples[{ref,description?}] }
 *
 * The schema's `manifest` field is the **path** of where the markdown
 * manifest would be written (`docs/harness/knowledge/<domain>/manifest.md`).
 * The full JSON envelope returned by `runScan({ json: true })` adds
 * outer-level `scanned_at` / `project_root` / `domains` / `manifest_summary`
 * (the latter is informational only — not part of the per-domain item that
 * the schema validates).
 *
 * This is a heuristic scanner: glob + filename / pattern match. It does NOT
 * read AST. It is intentionally cheap and conservative — populated `rules`
 * and `examples` are evidence-grounded; absence of evidence yields empty
 * arrays rather than fabricated rules.
 */

export type KnowledgeDomain =
  | 'api'
  | 'db'
  | 'business-rules'
  | 'config'
  | 'deployment';

export const KNOWLEDGE_DOMAINS: KnowledgeDomain[] = [
  'api',
  'db',
  'business-rules',
  'config',
  'deployment',
];

export interface KnowledgeRule {
  id: string;
  text: string;
  status?: 'active' | 'expired' | 'drifted' | 'superseded';
}

export interface KnowledgeExample {
  ref: string;
  description?: string;
}

export interface KnowledgeDomainItem {
  domain: KnowledgeDomain;
  manifest: string;
  rules: KnowledgeRule[];
  examples: KnowledgeExample[];
}

export interface KnowledgeScanResult {
  scanned_at: string;
  project_root: string;
  domains: KnowledgeDomainItem[];
  /** Human-readable per-domain markdown summary; not part of schema. */
  manifest_summary: Record<KnowledgeDomain, string>;
}

const DEFAULT_IGNORE = [
  '!**/node_modules/**',
  '!**/.git/**',
  '!**/dist/**',
  '!**/build/**',
  '!**/.next/**',
  '!**/coverage/**',
  '!**/.harness/**',
];

function safeGlob(patterns: string[], cwd: string): string[] {
  const all = [...patterns, ...DEFAULT_IGNORE];
  try {
    return globbySync(all, {
      cwd,
      gitignore: false,
      dot: true,
      onlyFiles: true,
      followSymbolicLinks: false,
      suppressErrors: true,
    });
  } catch {
    return [];
  }
}

function manifestPath(domain: KnowledgeDomain): string {
  return `docs/harness/knowledge/${domain}/manifest.md`;
}

function firstSnippetLine(
  fullPath: string,
  re: RegExp,
): { line: number; snippet: string } | null {
  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      return { line: i + 1, snippet: lines[i].trim().slice(0, 200) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Domain scanners
// ---------------------------------------------------------------------------

function scanApi(cwd: string): {
  item: KnowledgeDomainItem;
  summary: string;
} {
  const candidates = safeGlob(
    [
      '**/routes/**/*.{ts,tsx,js,mjs,cjs,py,go,rb,java,kt}',
      '**/router/**/*.{ts,tsx,js,mjs,cjs,py,go,rb,java,kt}',
      '**/controllers/**/*.{ts,tsx,js,mjs,cjs,py,go,rb,java,kt}',
      '**/handlers/**/*.{ts,tsx,js,mjs,cjs,py,go,rb,java,kt}',
      '**/api/**/*.{ts,tsx,js,mjs,cjs,py,go,rb,java,kt}',
    ],
    cwd,
  );

  const rules: KnowledgeRule[] = [];
  const examples: KnowledgeExample[] = [];
  const endpointRe =
    /(app|router|api)\.(get|post|put|delete|patch)\s*\(|@(Get|Post|Put|Delete|Patch)Mapping|@app\.route|func\s+\w+\s*\(.*\*gin\.Context\)/;

  for (const rel of candidates.slice(0, 30)) {
    const abs = path.join(cwd, rel);
    const hit = firstSnippetLine(abs, endpointRe);
    if (hit) {
      examples.push({
        ref: `${rel}:${hit.line}`,
        description: hit.snippet,
      });
    }
  }

  if (candidates.length > 0) {
    rules.push({
      id: 'api/rule-1',
      text: `Project exposes HTTP endpoints from ${candidates.length} file(s) under routes/controllers/handlers/api directories. New endpoints should follow the same directory layout.`,
      status: 'active',
    });
  }
  if (examples.length >= 3) {
    rules.push({
      id: 'api/rule-2',
      text: 'Endpoint definitions use a consistent decorator/registration pattern (see examples). Match it for new routes.',
      status: 'active',
    });
  }

  const summary = candidates.length
    ? `# api\n\nDetected ${candidates.length} API-relevant file(s). ${examples.length} endpoint definition example(s) captured.\n`
    : '# api\n\nNo API surface detected.\n';

  return {
    item: {
      domain: 'api',
      manifest: manifestPath('api'),
      rules,
      examples: examples.slice(0, 10),
    },
    summary,
  };
}

function scanDb(cwd: string): {
  item: KnowledgeDomainItem;
  summary: string;
} {
  const migrations = safeGlob(
    [
      '**/migrations/**/*.{sql,ts,js,py,rb}',
      '**/migrate/**/*.{sql,ts,js,py,rb}',
      '**/db/migrations/**/*',
    ],
    cwd,
  );
  const schemas = safeGlob(
    ['**/schema.sql', '**/schema.prisma', '**/prisma/schema.prisma'],
    cwd,
  );
  const ormFiles = safeGlob(
    [
      '**/models/**/*.{ts,tsx,js,py,rb,java,kt}',
      '**/entities/**/*.{ts,tsx,js,py,java,kt}',
    ],
    cwd,
  );

  const rules: KnowledgeRule[] = [];
  const examples: KnowledgeExample[] = [];

  for (const m of migrations.slice(0, 5)) {
    examples.push({ ref: m, description: 'migration file' });
  }
  for (const s of schemas.slice(0, 3)) {
    examples.push({ ref: s, description: 'schema definition' });
  }
  for (const o of ormFiles.slice(0, 3)) {
    examples.push({ ref: o, description: 'ORM model/entity' });
  }

  if (migrations.length > 0) {
    rules.push({
      id: 'db/rule-1',
      text: `Schema changes go through migration files (${migrations.length} found). Add new migrations rather than editing existing ones.`,
      status: 'active',
    });
  }
  if (schemas.some((s) => s.endsWith('schema.prisma'))) {
    rules.push({
      id: 'db/rule-2',
      text: 'Project uses Prisma; `prisma/schema.prisma` is the single source of truth for the data model.',
      status: 'active',
    });
  } else if (schemas.some((s) => s.endsWith('schema.sql'))) {
    rules.push({
      id: 'db/rule-2',
      text: 'Project ships a `schema.sql` file; keep it in sync with migrations.',
      status: 'active',
    });
  }

  const detected = migrations.length + schemas.length + ormFiles.length;
  const summary = detected
    ? `# db\n\nDetected ${migrations.length} migration(s), ${schemas.length} schema file(s), ${ormFiles.length} model/entity file(s).\n`
    : '# db\n\nNo database layer detected.\n';

  return {
    item: {
      domain: 'db',
      manifest: manifestPath('db'),
      rules,
      examples: examples.slice(0, 10),
    },
    summary,
  };
}

function scanBusinessRules(cwd: string): {
  item: KnowledgeDomainItem;
  summary: string;
} {
  const candidates = safeGlob(
    [
      '**/services/**/*.{ts,tsx,js,py,go,rb,java,kt}',
      '**/domain/**/*.{ts,tsx,js,py,go,rb,java,kt}',
      '**/usecases/**/*.{ts,tsx,js,py,go,rb,java,kt}',
      '**/use-cases/**/*.{ts,tsx,js,py,go,rb,java,kt}',
      '**/business/**/*.{ts,tsx,js,py,go,rb,java,kt}',
      '**/rules/**/*.{ts,tsx,js,py,go,rb,java,kt}',
    ],
    cwd,
  );

  const rules: KnowledgeRule[] = [];
  const examples: KnowledgeExample[] = [];
  const logicRe =
    /\b(validate|policy|invariant|workflow|saga|guard|authorize|permission|rule|policy|business)\b/i;

  for (const rel of candidates.slice(0, 30)) {
    const abs = path.join(cwd, rel);
    const hit = firstSnippetLine(abs, logicRe);
    if (hit) {
      examples.push({
        ref: `${rel}:${hit.line}`,
        description: hit.snippet,
      });
    }
  }

  if (candidates.length > 0) {
    rules.push({
      id: 'business-rules/rule-1',
      text: `Domain logic lives under ${candidates.length} file(s) in services/domain/usecases. Place new business rules there, not in controllers.`,
      status: 'active',
    });
  }

  const summary = candidates.length
    ? `# business-rules\n\nDetected ${candidates.length} candidate file(s); ${examples.length} sample(s) match validation/policy/workflow patterns.\n`
    : '# business-rules\n\nNo dedicated business-rules layer detected.\n';

  return {
    item: {
      domain: 'business-rules',
      manifest: manifestPath('business-rules'),
      rules,
      examples: examples.slice(0, 10),
    },
    summary,
  };
}

function scanConfig(cwd: string): {
  item: KnowledgeDomainItem;
  summary: string;
} {
  const pkg = safeGlob(['package.json', '*/package.json'], cwd);
  const envFiles = safeGlob(
    ['.env', '.env.*', 'config/*.{json,yml,yaml,toml}', '*.config.{js,ts,mjs,cjs}'],
    cwd,
  );
  const lang = safeGlob(
    ['pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts'],
    cwd,
  );

  const rules: KnowledgeRule[] = [];
  const examples: KnowledgeExample[] = [];

  for (const p of pkg.slice(0, 3)) {
    examples.push({ ref: p, description: 'Node package manifest' });
  }
  for (const e of envFiles.slice(0, 5)) {
    examples.push({ ref: e, description: 'environment / config file' });
  }
  for (const l of lang.slice(0, 5)) {
    examples.push({ ref: l, description: 'language toolchain manifest' });
  }

  if (pkg.length > 0) {
    rules.push({
      id: 'config/rule-1',
      text: 'Node project: add new dependencies via package.json + lockfile rather than ad-hoc require/import.',
      status: 'active',
    });
  }
  if (envFiles.some((f) => /^\.env(\..+)?$/.test(path.basename(f)))) {
    rules.push({
      id: 'config/rule-2',
      text: 'Runtime configuration uses .env files; do not hardcode secrets or environment-dependent values in source.',
      status: 'active',
    });
  }
  if (lang.length > 0) {
    rules.push({
      id: 'config/rule-3',
      text: `Toolchain manifests detected (${lang.join(', ')}); update these for dependency / version changes.`,
      status: 'active',
    });
  }

  const summary = pkg.length + envFiles.length + lang.length
    ? `# config\n\nDetected ${pkg.length} package manifest(s), ${envFiles.length} env/config file(s), ${lang.length} toolchain manifest(s).\n`
    : '# config\n\nNo config layer detected.\n';

  return {
    item: {
      domain: 'config',
      manifest: manifestPath('config'),
      rules,
      examples: examples.slice(0, 10),
    },
    summary,
  };
}

function scanDeployment(cwd: string): {
  item: KnowledgeDomainItem;
  summary: string;
} {
  const docker = safeGlob(['Dockerfile', '**/Dockerfile', 'docker-compose*.{yml,yaml}'], cwd);
  const ci = safeGlob(
    [
      '.github/workflows/*.{yml,yaml}',
      '.gitlab-ci.{yml,yaml}',
      '.circleci/config.yml',
      'azure-pipelines.{yml,yaml}',
      'Jenkinsfile',
    ],
    cwd,
  );
  const platforms = safeGlob(
    [
      'fly.toml',
      'vercel.json',
      'netlify.toml',
      'render.yaml',
      'app.yaml',
      'Procfile',
      'kubernetes/**/*.{yml,yaml}',
      'k8s/**/*.{yml,yaml}',
      'helm/**/*.{yml,yaml}',
      'terraform/**/*.tf',
    ],
    cwd,
  );

  const rules: KnowledgeRule[] = [];
  const examples: KnowledgeExample[] = [];

  for (const d of docker.slice(0, 3)) {
    examples.push({ ref: d, description: 'container build/compose definition' });
  }
  for (const c of ci.slice(0, 5)) {
    examples.push({ ref: c, description: 'CI pipeline definition' });
  }
  for (const p of platforms.slice(0, 5)) {
    examples.push({ ref: p, description: 'deploy platform manifest' });
  }

  if (docker.length > 0) {
    rules.push({
      id: 'deployment/rule-1',
      text: 'Project ships container artifacts; keep Dockerfile / compose in sync with runtime config.',
      status: 'active',
    });
  }
  if (ci.length > 0) {
    rules.push({
      id: 'deployment/rule-2',
      text: `CI pipeline lives in ${ci[0]}; new test/lint/build steps must be wired here, not run only locally.`,
      status: 'active',
    });
  }
  if (platforms.length > 0) {
    rules.push({
      id: 'deployment/rule-3',
      text: `Deploy targets detected (${platforms.slice(0, 3).join(', ')}); changes that affect deploy config require updating these.`,
      status: 'active',
    });
  }

  const total = docker.length + ci.length + platforms.length;
  const summary = total
    ? `# deployment\n\nDetected ${docker.length} container file(s), ${ci.length} CI pipeline(s), ${platforms.length} platform manifest(s).\n`
    : '# deployment\n\nNo deployment artifacts detected.\n';

  return {
    item: {
      domain: 'deployment',
      manifest: manifestPath('deployment'),
      rules,
      examples: examples.slice(0, 10),
    },
    summary,
  };
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

const SCANNERS: Record<
  KnowledgeDomain,
  (cwd: string) => { item: KnowledgeDomainItem; summary: string }
> = {
  api: scanApi,
  db: scanDb,
  'business-rules': scanBusinessRules,
  config: scanConfig,
  deployment: scanDeployment,
};

export function scanKnowledge(
  projectRoot: string,
  options: { domains?: KnowledgeDomain[] } = {},
): KnowledgeScanResult {
  const list = options.domains?.length ? options.domains : KNOWLEDGE_DOMAINS;

  const items: KnowledgeDomainItem[] = [];
  const summary = {} as Record<KnowledgeDomain, string>;
  for (const d of KNOWLEDGE_DOMAINS) {
    summary[d] = '';
  }

  for (const d of list) {
    const r = SCANNERS[d](projectRoot);
    items.push(r.item);
    summary[d] = r.summary;
  }

  return {
    scanned_at: new Date().toISOString(),
    project_root: projectRoot,
    domains: items,
    manifest_summary: summary,
  };
}
