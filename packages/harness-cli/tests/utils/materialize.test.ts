import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { materializeFile, MaterializeResult } from '../../src/utils/materialize.js';
import {
  readState,
  writeState,
  findRecord,
} from '../../src/utils/managed-files.js';
import { sha256 } from '../../src/utils/hash.js';
import { ManagedFilesState } from '../../src/types/managed-file.js';

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-mat-'));
}

function tmpResources(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-mat-res-'));
}

describe('materializeFile', () => {
  it('first-time init: writes file + registers record', () => {
    const project = tmpProject();
    const resources = tmpResources();
    fs.writeFileSync(path.join(resources, 'CLAUDE.md'), '# initial');
    const r = materializeFile({
      projectRoot: project,
      bundledPath: path.join(resources, 'CLAUDE.md'),
      targetRelative: 'CLAUDE.md',
      category: 'agents',
      strategy: 'copy',
      profile: 'personal',
    });
    expect(r.action).toBe('apply');
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8')).toBe('# initial');
    const state = readState(project)!;
    expect(findRecord(state, 'CLAUDE.md')?.sourceHash).toBe(sha256('# initial'));
    fs.removeSync(project);
    fs.removeSync(resources);
  });

  it('unchanged: noop', () => {
    const project = tmpProject();
    const resources = tmpResources();
    fs.writeFileSync(path.join(resources, 'CLAUDE.md'), '# v1');
    // First run → apply
    materializeFile({
      projectRoot: project,
      bundledPath: path.join(resources, 'CLAUDE.md'),
      targetRelative: 'CLAUDE.md',
      category: 'agents',
      strategy: 'copy',
      profile: 'personal',
    });
    // Second run without bundled change → noop
    const r = materializeFile({
      projectRoot: project,
      bundledPath: path.join(resources, 'CLAUDE.md'),
      targetRelative: 'CLAUDE.md',
      category: 'agents',
      strategy: 'copy',
      profile: 'personal',
    });
    expect(r.action).toBe('noop');
    fs.removeSync(project);
    fs.removeSync(resources);
  });

  it('update-available: apply new bundled', () => {
    const project = tmpProject();
    const resources = tmpResources();
    fs.writeFileSync(path.join(resources, 'CLAUDE.md'), '# v1');
    materializeFile({
      projectRoot: project,
      bundledPath: path.join(resources, 'CLAUDE.md'),
      targetRelative: 'CLAUDE.md',
      category: 'agents',
      strategy: 'copy',
      profile: 'personal',
    });
    fs.writeFileSync(path.join(resources, 'CLAUDE.md'), '# v2');
    const r = materializeFile({
      projectRoot: project,
      bundledPath: path.join(resources, 'CLAUDE.md'),
      targetRelative: 'CLAUDE.md',
      category: 'agents',
      strategy: 'copy',
      profile: 'personal',
    });
    expect(r.action).toBe('apply');
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8')).toBe('# v2');
    fs.removeSync(project);
    fs.removeSync(resources);
  });

  it('user-modified: skip (preserve user changes)', () => {
    const project = tmpProject();
    const resources = tmpResources();
    fs.writeFileSync(path.join(resources, 'CLAUDE.md'), '# v1');
    materializeFile({
      projectRoot: project,
      bundledPath: path.join(resources, 'CLAUDE.md'),
      targetRelative: 'CLAUDE.md',
      category: 'agents',
      strategy: 'copy',
      profile: 'personal',
    });
    // User hand-edits target
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# USER HAND-EDITED');
    const r = materializeFile({
      projectRoot: project,
      bundledPath: path.join(resources, 'CLAUDE.md'),
      targetRelative: 'CLAUDE.md',
      category: 'agents',
      strategy: 'copy',
      profile: 'personal',
    });
    expect(r.action).toBe('skip');
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8')).toBe('# USER HAND-EDITED');
    fs.removeSync(project);
    fs.removeSync(resources);
  });

  it('conflict (personal): write .rej, exit 1 indicated', () => {
    const project = tmpProject();
    const resources = tmpResources();
    fs.writeFileSync(path.join(resources, 'CLAUDE.md'), '# v1');
    materializeFile({
      projectRoot: project,
      bundledPath: path.join(resources, 'CLAUDE.md'),
      targetRelative: 'CLAUDE.md',
      category: 'agents',
      strategy: 'copy',
      profile: 'personal',
    });
    // User edits + bundled also changed
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# USER');
    fs.writeFileSync(path.join(resources, 'CLAUDE.md'), '# v2 new');
    const r = materializeFile({
      projectRoot: project,
      bundledPath: path.join(resources, 'CLAUDE.md'),
      targetRelative: 'CLAUDE.md',
      category: 'agents',
      strategy: 'copy',
      profile: 'personal',
    });
    expect(r.action).toBe('write-rej');
    expect(r.exitCode).toBe(1);
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8')).toBe('# USER');
    // .rej file must contain bundled content
    const rejFiles = fs.readdirSync(project).filter((f) => f.startsWith('CLAUDE.md.rej.'));
    expect(rejFiles).toHaveLength(1);
    expect(fs.readFileSync(path.join(project, rejFiles[0]), 'utf8')).toBe('# v2 new');
    fs.removeSync(project);
    fs.removeSync(resources);
  });

  it('conflict (company-mt): abort-batch, exit 2', () => {
    const project = tmpProject();
    const resources = tmpResources();
    fs.writeFileSync(path.join(resources, 'CLAUDE.md'), '# v1');
    materializeFile({
      projectRoot: project,
      bundledPath: path.join(resources, 'CLAUDE.md'),
      targetRelative: 'CLAUDE.md',
      category: 'agents',
      strategy: 'copy',
      profile: 'company-mt',
    });
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# USER');
    fs.writeFileSync(path.join(resources, 'CLAUDE.md'), '# v2');
    const r = materializeFile({
      projectRoot: project,
      bundledPath: path.join(resources, 'CLAUDE.md'),
      targetRelative: 'CLAUDE.md',
      category: 'agents',
      strategy: 'copy',
      profile: 'company-mt',
    });
    expect(r.action).toBe('abort-batch');
    expect(r.exitCode).toBe(2);
    expect(r.blockBatch).toBe(true);
    fs.removeSync(project);
    fs.removeSync(resources);
  });
});
