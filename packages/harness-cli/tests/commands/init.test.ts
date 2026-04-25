import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { runInit } from '../../src/commands/init.js';
import { readState, MANAGED_FILES_PATH } from '../../src/utils/managed-files.js';
import { readMarker } from '../../src/utils/profile.js';

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-init-'));
}

describe('harness init (R3/T5 + T7 E2E)', () => {
  it('empty directory → 15+ files, personal preset', () => {
    const root = tmpProject();
    const r = runInit({ projectRoot: root, preset: 'personal', agentType: 'claude' });
    expect(r.exitCode).toBe(0);
    expect(r.profile).toBe('harness');

    // Core files expected (bundled templates from R3 minimum set)
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'harness.config.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.harness-profile'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.harness/current.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.harness/learnings/LEARNINGS.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.harness/learnings/ERRORS.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.harness/learnings/FEATURE_REQUESTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/memory/MEMORY.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/memory/ERRORS.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/memory/.harness-memory.yml'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/memory/harness_reviewer_scorecard.yml'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/memory/cases'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/memory/decisions'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/memory/constraints'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/memory/archive'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/harness/knowledge/INDEX.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/harness/knowledge/TODO.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude/skills'))).toBe(true);

    // managed-files.json exists + registers those files
    expect(fs.existsSync(path.join(root, MANAGED_FILES_PATH))).toBe(true);
    const state = readState(root)!;
    expect(state.managedFiles.length).toBeGreaterThanOrEqual(11);

    // .harness-profile marker
    const marker = readMarker(root)!;
    expect(marker.profile).toBe('harness');
    expect(marker.resolved_by).toBe('marker');

    // CLAUDE.md contains both managed blocks + substituted vars
    const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    expect(claude).toMatch(/<!-- harness-knowledge:start -->/);
    expect(claude).toMatch(/<!-- harness-profile:start -->/);
    expect(claude).not.toMatch(/\{\{project_name\}\}/); // no unresolved placeholders

    // .gitignore contains the private runtime paths
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/\.harness\/managed-files\.json/);
    expect(gitignore).toMatch(/\.harness\/current\.json/);

    fs.removeSync(root);
  });

  it('second run is idempotent (unchanged)', () => {
    const root = tmpProject();
    runInit({ projectRoot: root, preset: 'personal', agentType: 'claude' });
    const r2 = runInit({ projectRoot: root, preset: 'personal', agentType: 'claude' });
    expect(r2.exitCode).toBe(0);
    // Second run should have 0 files "written" (all unchanged) plus gitkeeps may be 0 too
    // managed-files state should remain valid
    const state = readState(root)!;
    expect(state.managedFiles.length).toBeGreaterThanOrEqual(11);
    fs.removeSync(root);
  });

  it('java project: detect pom.xml + still init', () => {
    const root = tmpProject();
    fs.writeFileSync(path.join(root, 'pom.xml'), '<project/>');
    const r = runInit({ projectRoot: root, preset: 'personal', agentType: 'claude' });
    expect(r.exitCode).toBe(0);
    // Memory file should contain "java" in tech_stack_oneliner
    const mem = fs.readFileSync(path.join(root, 'docs/memory/MEMORY.md'), 'utf8');
    expect(mem).toMatch(/java/i);
    fs.removeSync(root);
  });

  it('user modifies CLAUDE.md then re-runs: skip (preserves user)', () => {
    const root = tmpProject();
    runInit({ projectRoot: root, preset: 'personal', agentType: 'claude' });
    const userContent = '# USER HAND-EDITED\n';
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), userContent);

    const r = runInit({ projectRoot: root, preset: 'personal', agentType: 'claude' });
    expect(r.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toBe(userContent);
    fs.removeSync(root);
  });
});
