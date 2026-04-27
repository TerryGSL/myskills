import fs from 'fs-extra';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectProject } from '../utils/detect.js';
import { renderTemplate } from '../utils/template.js';
import { materializeFile } from '../utils/materialize.js';
import {
  readState,
  writeState,
  upsertRecord,
  MANAGED_FILES_PATH,
} from '../utils/managed-files.js';
import { sha256 } from '../utils/hash.js';
import { writeMarker } from '../utils/profile.js';
import { agentTypeFor, skillRootFor, AgentType } from '../utils/agent-paths.js';
import { ManagedFilesState, ManagedCategory } from '../types/managed-file.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESOURCES = path.resolve(__dirname, '../../resources');

export interface InitInput {
  projectRoot: string;
  preset: 'personal' | 'company-mt';
  agentType?: AgentType;
  force?: boolean;
}

export interface InitResult {
  exitCode: 0 | 1 | 2;
  filesWritten: string[];
  conflicts: string[];
  blockedBy?: string;
  profile: string;
}

interface TemplateSpec {
  sourceRelative: string; // relative to RESOURCES
  targetRelative: string; // relative to projectRoot
  category: ManagedCategory;
  renderVars?: Record<string, string>;
  asTemplate?: boolean; // if true, strip .template and substitute vars
}

/**
 * Build the list of files `harness init` will materialize for a given preset.
 * Round 3 MVP: minimum set (marker + config + memory + learnings + knowledge + CLAUDE.md).
 * Round 5 will expand templates/knowledge/5-domain/*.md.template triplets.
 */
function planFiles(input: InitInput, info: ReturnType<typeof detectProject>): TemplateSpec[] {
  const vars = {
    project_name: info.projectName ?? path.basename(input.projectRoot),
    project_type: info.projectType,
    project_description: `Auto-detected ${info.projectType} project`,
    tech_stack_oneliner: `${info.projectType}${info.buildFiles.length ? ` (${info.buildFiles.join(', ')})` : ''}`,
    root_fingerprint: info.buildFiles[0]
      ? `${info.buildFiles[0]}:name=${info.projectName ?? 'unknown'}`
      : 'unknown',
    preset: `preset:${input.preset}`,
    profile_name: input.preset === 'personal' ? 'harness' : input.preset,
    profile_resolved_by: 'marker',
    today: new Date().toISOString().slice(0, 10),
  };

  return [
    {
      sourceRelative: 'templates/root/CLAUDE.md.template',
      targetRelative: 'CLAUDE.md',
      category: 'agents',
      renderVars: vars,
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/root/harness.config.json.template',
      targetRelative: 'harness.config.json',
      category: 'config',
      renderVars: vars,
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/root/STATE.json.template',
      targetRelative: 'docs/STATE.json',
      category: 'docs',
      renderVars: vars,
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/root/WALKTHROUGH.md.template',
      targetRelative: 'docs/WALKTHROUGH.md',
      category: 'docs',
      renderVars: vars,
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/root/DESIGN.md.template',
      targetRelative: 'docs/DESIGN.md',
      category: 'docs',
      renderVars: vars,
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/memory/.harness-memory.yml.template',
      targetRelative: 'docs/memory/.harness-memory.yml',
      category: 'memory',
      renderVars: vars,
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/memory/MEMORY.md.template',
      targetRelative: 'docs/memory/MEMORY.md',
      category: 'memory',
      renderVars: vars,
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/memory/ERRORS.md.template',
      targetRelative: 'docs/memory/ERRORS.md',
      category: 'memory',
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/memory/harness_reviewer_scorecard.yml.template',
      targetRelative: 'docs/memory/harness_reviewer_scorecard.yml',
      category: 'memory',
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/learnings/LEARNINGS.md.template',
      targetRelative: '.harness/learnings/LEARNINGS.md',
      category: 'learnings',
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/learnings/ERRORS.md.template',
      targetRelative: '.harness/learnings/ERRORS.md',
      category: 'learnings',
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/learnings/FEATURE_REQUESTS.md.template',
      targetRelative: '.harness/learnings/FEATURE_REQUESTS.md',
      category: 'learnings',
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/knowledge/INDEX.md.template',
      targetRelative: 'docs/harness/knowledge/INDEX.md',
      category: 'knowledge',
      asTemplate: true,
    },
    {
      sourceRelative: 'templates/knowledge/TODO.md.template',
      targetRelative: 'docs/harness/knowledge/TODO.md',
      category: 'knowledge',
      asTemplate: true,
    },
    ...knowledgeDomainSpecs(vars),
    ...(input.preset === 'company-mt' ? companyMtPresetSpecs(vars) : []),
  ];
}

/**
 * Generic knowledge example scaffold.
 *
 * 设计原则（用户反馈：「目录可以建，文件可以建，但别先塞具体规则／具体内容；
 * 真规则要走 `harness scan` 扫描仓库后沉淀」）：
 *   - **不再**硬编码 5 个特定 domain（i18n / internal-components / 等）
 *     —— 那些是用户没说要的具体业务 placeholder
 *   - **改为**创建 1 个通用 `_example/` 骨架（manifest / evidence / gaps 三个
 *     `.md.example` 文件），仅含格式注释 + frontmatter 模板，**不含任何具体规则**
 *   - 真规则由 `harness scan` 扫描代码仓库后**自动沉淀**到真实 domain 目录
 *
 * 用户后续配置流程：
 *   1. 跑 `harness scan` 让 scanner 探测真实 domain（按项目代码结构）
 *   2. scanner 自动创建 `docs/harness/knowledge/<real-domain>/{manifest,evidence,gaps}.md`
 *   3. `_example/` 仍保留，作为格式参考（用户手动写 manifest 时对照）
 */
function knowledgeDomainSpecs(vars: Record<string, string>): TemplateSpec[] {
  const files = ['manifest', 'evidence', 'gaps'];
  return files.map((f) => ({
    sourceRelative: `templates/knowledge/_example/${f}.md.template`,
    targetRelative: `docs/harness/knowledge/_example/${f}.md.example`,
    category: 'knowledge',
    renderVars: vars,
    asTemplate: true,
  }));
}

/**
 * company-mt preset specs.
 *
 * 设计原则（用户反馈：「init 不要 seed 具体业务规则」）：
 *   - **保留** 4 个 overlay skill SKILL.md（这是 skill 骨架，非业务规则）
 *   - **不再** seed 4 个 reference 文件到 manifest.md / constraints/
 *     （java-rules / approval-flow / enterprise-sdk / i18n 都是 company 业务规则，
 *     用户没说要直接 seed 不该硬塞）
 *
 * 用户需要这些规则时的流程：
 *   1. 读 `presets/company-mt/references/{java-rules,approval-flow,...}.md` 作为参考
 *   2. 决定是否将其规则迁移到自己的 manifest.md（手动复制 + 改写）
 *   3. 或者跑 `harness scan` 让 scanner 重新探测真实项目结构后沉淀规则
 */
function companyMtPresetSpecs(_vars: Record<string, string>): TemplateSpec[] {
  const overlaySkills = ['company-quick', 'company-bugfix', 'company-feature', 'company-refactor'];
  return overlaySkills.map((s) => ({
    sourceRelative: `presets/company-mt/skills/${s}/SKILL.md`,
    targetRelative: `.claude/skills/${s}/SKILL.md`,
    category: 'skills',
    asTemplate: false,
  }));
}

/**
 * Ensure four empty memory subdirectories exist with README placeholders.
 */
function ensureMemorySubdirs(projectRoot: string): string[] {
  const subs = ['cases', 'decisions', 'constraints', 'archive'];
  const written: string[] = [];
  for (const sub of subs) {
    const dir = path.join(projectRoot, 'docs/memory', sub);
    fs.ensureDirSync(dir);
    const gitkeep = path.join(dir, '.gitkeep');
    if (!fs.existsSync(gitkeep)) {
      fs.writeFileSync(gitkeep, '');
      written.push(`docs/memory/${sub}/.gitkeep`);
    }
  }
  return written;
}

/**
 * Ensure .gitignore contains the private runtime paths.
 */
function ensureGitignore(projectRoot: string): boolean {
  const file = path.join(projectRoot, '.gitignore');
  const must = [
    '.harness/managed-files.json',
    '.harness/current.json',
    '.harness-context.json',
  ];
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = current.split('\n');
  let changed = false;
  for (const m of must) {
    if (!lines.some((l) => l.trim() === m)) {
      lines.push(m);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, lines.join('\n'));
  }
  return changed;
}

/**
 * Initialize `.harness/current.json` with schema version sentinel.
 */
function writeCurrent(projectRoot: string): void {
  const file = path.join(projectRoot, '.harness/current.json');
  fs.ensureDirSync(path.dirname(file));
  if (!fs.existsSync(file)) {
    fs.writeJsonSync(
      file,
      {
        schemaVersion: 1,
        workflow_schema_version: '1.0.0',
        currentFeature: null,
        currentStage: null,
        currentItem: null,
        updatedAt: new Date().toISOString(),
      },
      { spaces: 2 },
    );
  }
}

/**
 * Write `.harness-context.json` cache with detected build/test/lint commands
 * so downstream skills don't re-detect on every Round.
 */
function writeContext(projectRoot: string, info: ReturnType<typeof detectProject>): void {
  const file = path.join(projectRoot, '.harness-context.json');
  const commandSuggestions: Record<string, { build?: string; test?: string; lint?: string }> = {
    node: { build: 'npm run build', test: 'npm test', lint: 'npm run lint' },
    java: { build: './mvnw package -DskipTests', test: './mvnw test', lint: './mvnw spotless:check' },
    go: { build: 'go build ./...', test: 'go test ./...', lint: 'go vet ./...' },
    rust: { build: 'cargo build', test: 'cargo test', lint: 'cargo clippy' },
    python: { build: 'python -m build', test: 'pytest', lint: 'ruff check .' },
    unknown: {},
  };
  const cmds = commandSuggestions[info.projectType] ?? {};
  const context = {
    schemaVersion: 1,
    projectType: info.projectType,
    projectName: info.projectName,
    buildFiles: info.buildFiles,
    buildCommand: cmds.build ?? null,
    testCommand: cmds.test ?? null,
    lintCommand: cmds.lint ?? null,
    detectedAt: new Date().toISOString(),
  };
  fs.writeJsonSync(file, context, { spaces: 2 });
}

/**
 * Materialize a template file (renders vars) or copies verbatim.
 * Renders the template to a temporary path, then calls materializeFile to
 * apply four-state policy.
 */
function runOneSpec(
  input: InitInput,
  spec: TemplateSpec,
  profileName: string,
  state: ManagedFilesState,
): {
  action: string;
  exitCode: 0 | 1 | 2;
  blockBatch: boolean;
  message: string;
  state: ManagedFilesState;
} {
  const source = path.join(RESOURCES, spec.sourceRelative);
  if (!fs.existsSync(source)) {
    throw new Error(`bundled template missing: ${spec.sourceRelative}`);
  }

  // Render template to temp file, then feed to materializeFile
  const rawContent = fs.readFileSync(source, 'utf8');
  const finalContent = spec.asTemplate && spec.renderVars
    ? renderTemplate(rawContent, spec.renderVars)
    : rawContent;

  // Write rendered content to a stable temp location
  const tmpRendered = path.join(
    path.dirname(source),
    `.rendered-${path.basename(spec.targetRelative)}-${Date.now()}`,
  );
  fs.writeFileSync(tmpRendered, finalContent);

  try {
    const r = materializeFile({
      projectRoot: input.projectRoot,
      bundledPath: tmpRendered,
      targetRelative: spec.targetRelative,
      category: spec.category,
      strategy: spec.asTemplate ? 'generated' : 'copy',
      profile: profileName,
      state,
    });
    return r;
  } finally {
    fs.removeSync(tmpRendered);
  }
}

export function runInit(input: InitInput): InitResult {
  const { projectRoot, preset } = input;
  const agent = agentTypeFor(input.agentType);
  const info = detectProject(projectRoot);
  const profileName = preset === 'personal' ? 'harness' : preset;

  // Marker + current.json + context cache + gitignore (cheap, always OK to run)
  writeMarker(projectRoot, { profile: profileName, resolved_by: 'marker' });
  writeCurrent(projectRoot);
  writeContext(projectRoot, info);
  ensureGitignore(projectRoot);

  // Memory subdirs (4 .gitkeep)
  const gitkeeps = ensureMemorySubdirs(projectRoot);

  // Iterate bundled templates through four-state materialize
  const specs = planFiles(input, info);
  let state: ManagedFilesState = readState(projectRoot) ?? {
    schemaVersion: 1,
    managedFiles: [],
  };
  const filesWritten: string[] = [];
  const conflicts: string[] = [];
  let blockedBy: string | undefined;
  let exitCode: 0 | 1 | 2 = 0;

  for (const spec of specs) {
    const r = runOneSpec(input, spec, profileName, state);
    state = r.state;
    if (r.action === 'apply') filesWritten.push(spec.targetRelative);
    if (r.action === 'write-rej') {
      conflicts.push(spec.targetRelative);
      if (exitCode === 0) exitCode = 1;
    }
    if (r.action === 'abort-batch') {
      blockedBy = spec.targetRelative;
      exitCode = 2;
      break; // company-mt hard_floor
    }
  }

  // Persist state (even on abort; we want the partial record for debugging)
  writeState(projectRoot, state);

  // Skill-root directory gets ensured even if no skills shipped this round
  // (R5+ will actually deploy skills; for now just create the folder)
  fs.ensureDirSync(path.join(projectRoot, skillRootFor(agent)));

  return {
    exitCode,
    filesWritten: [...filesWritten, ...gitkeeps],
    conflicts,
    blockedBy,
    profile: profileName,
  };
}
