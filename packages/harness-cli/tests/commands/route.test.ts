import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { runRoute } from '../../src/commands/route.js';
import { writeMarker } from '../../src/utils/profile.js';
import type { Profile } from '../../src/types/profile.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-route-'));
}

function profileYaml(p: Profile): string {
  const matchers = p.detection.matchers
    .map((m) => `    - type: ${m.type}\n      pattern: '${m.pattern.replace(/'/g, "''")}'`)
    .join('\n');
  const hf = p.hard_floor.length
    ? p.hard_floor.map((f) => `  - ${f}`).join('\n')
    : ' []';
  const hardFloorBlock = p.hard_floor.length ? `\n${hf}` : ' []';
  return `name: ${p.name}
description: ${p.description}
detection:
  priority: ${p.detection.priority}
  matchers:
${matchers}
entry_skill: profile-entry
task_types:
  quick: ${p.task_types.quick}
  bugfix: ${p.task_types.bugfix}
  feature: ${p.task_types.feature}
  refactor: ${p.task_types.refactor}
default_mode: ${p.default_mode}
hard_floor:${hardFloorBlock}
`;
}

function writeProfiles(dir: string, profiles: Profile[]): void {
  fs.ensureDirSync(dir);
  for (const p of profiles) {
    fs.writeFileSync(path.join(dir, `${p.name}.yml`), profileYaml(p));
  }
}

const baseTaskTypes = {
  quick: 'harness-quick',
  bugfix: 'harness-bugfix',
  feature: 'harness-feature',
  refactor: 'harness-refactor',
};

function harnessProfile(rootCwd: string): Profile {
  return {
    name: 'harness',
    description: 'personal',
    detection: {
      priority: 10,
      matchers: [{ type: 'path_glob', pattern: `${rootCwd}/**` }],
    },
    entry_skill: 'profile-entry',
    task_types: baseTaskTypes,
    default_mode: 'standard',
    hard_floor: [],
  };
}

function companyProfile(rootCwd: string): Profile {
  return {
    name: 'company-foo',
    description: 'company with hard_floor',
    detection: {
      priority: 100,
      matchers: [{ type: 'path_glob', pattern: `${rootCwd}/**` }],
    },
    entry_skill: 'profile-entry',
    task_types: baseTaskTypes,
    default_mode: 'conservative',
    hard_floor: ['auto_push', 'force_push'],
  };
}

describe('harness route (PR C5)', () => {
  it('1) marker present → resolves to that profile, ignores higher-priority matchers', () => {
    const root = tmpDir();
    const profDir = path.join(root, 'profiles');
    writeProfiles(profDir, [harnessProfile(root), companyProfile(root)]);
    writeMarker(root, { profile: 'harness', resolved_by: 'marker' });
    const r = runRoute({
      task: '加一个登录按钮',
      cwd: root,
      profilesDir: profDir,
      gitRemote: null,
      skipGit: true,
    });
    expect(r.resolved_profile).toBe('harness');
    expect(r.leaf_skill).toBe('harness-feature');
    expect(r.resolved_mode).toBe('standard');
    expect(r.hard_floor).toEqual([]);
    expect(r.fast_path_hit).toBe(false);
    expect(r.task_description).toBe('加一个登录按钮');
    expect(r.context_to_inject).toContain('Binding Rules');
    expect(r.context_to_inject).toContain('harness');
    fs.removeSync(root);
  });

  it('2) tie-break: longer pattern wins (specificity)', () => {
    const root = tmpDir();
    const inner = path.join(root, 'packages', 'harness-cli');
    fs.ensureDirSync(inner);
    const profDir = path.join(root, 'profiles');
    const broad: Profile = {
      ...harnessProfile(root),
      name: 'broad',
      detection: {
        priority: 10,
        matchers: [{ type: 'path_glob', pattern: `${root}/**` }],
      },
    };
    const narrow: Profile = {
      ...harnessProfile(root),
      name: 'narrow',
      detection: {
        priority: 10,
        matchers: [{ type: 'path_glob', pattern: `${inner}/**` }],
      },
    };
    writeProfiles(profDir, [broad, narrow]);
    const r = runRoute({
      task: '调整 schema',
      cwd: inner,
      profilesDir: profDir,
      gitRemote: null,
      skipGit: true,
    });
    expect(r.resolved_profile).toBe('narrow');
    expect(r.leaf_skill).toBe('harness-feature');
    fs.removeSync(root);
  });

  it('3) /yolo + company hard_floor → mode capped at conservative; hard_floor preserved', () => {
    const root = tmpDir();
    const profDir = path.join(root, 'profiles');
    writeProfiles(profDir, [companyProfile(root)]);
    writeMarker(root, { profile: 'company-foo', resolved_by: 'marker' });
    const r = runRoute({
      task: '加 feature',
      flags: ['yolo'],
      cwd: root,
      profilesDir: profDir,
      gitRemote: null,
      skipGit: true,
    });
    expect(r.resolved_profile).toBe('company-foo');
    expect(r.resolved_mode).toBe('conservative');
    expect(r.hard_floor).toEqual(['auto_push', 'force_push']);
    expect(r.leaf_skill).toBe('harness-feature');
    fs.removeSync(root);
  });

  it('4) bugfix keyword → leaf=harness-bugfix', () => {
    const root = tmpDir();
    const profDir = path.join(root, 'profiles');
    writeProfiles(profDir, [harnessProfile(root)]);
    writeMarker(root, { profile: 'harness', resolved_by: 'marker' });
    const r = runRoute({
      task: '修登录 bug',
      cwd: root,
      profilesDir: profDir,
      gitRemote: null,
      skipGit: true,
    });
    expect(r.leaf_skill).toBe('harness-bugfix');
    expect(r.resolved_profile).toBe('harness');
    fs.removeSync(root);
  });

  it('5) /refactor flag → leaf=harness-refactor (overrides keyword default)', () => {
    const root = tmpDir();
    const profDir = path.join(root, 'profiles');
    writeProfiles(profDir, [harnessProfile(root)]);
    writeMarker(root, { profile: 'harness', resolved_by: 'marker' });
    const r = runRoute({
      task: '把 push-check 拆成两个函数',
      flags: ['refactor'],
      cwd: root,
      profilesDir: profDir,
      gitRemote: null,
      skipGit: true,
    });
    expect(r.leaf_skill).toBe('harness-refactor');
    expect(r.resolved_mode).toBe('standard');
    fs.removeSync(root);
  });

  it('6) /fix flag → leaf=harness-bugfix; /quick flag → leaf=harness-quick', () => {
    const root = tmpDir();
    const profDir = path.join(root, 'profiles');
    writeProfiles(profDir, [harnessProfile(root)]);
    writeMarker(root, { profile: 'harness', resolved_by: 'marker' });
    const fix = runRoute({
      task: 'something',
      flags: ['fix'],
      cwd: root,
      profilesDir: profDir,
      gitRemote: null,
      skipGit: true,
    });
    expect(fix.leaf_skill).toBe('harness-bugfix');
    const quick = runRoute({
      task: 'rename a var',
      flags: ['quick'],
      cwd: root,
      profilesDir: profDir,
      gitRemote: null,
      skipGit: true,
    });
    expect(quick.leaf_skill).toBe('harness-quick');
    fs.removeSync(root);
  });

  it('7) /yolo without hard_floor → aggressive', () => {
    const root = tmpDir();
    const profDir = path.join(root, 'profiles');
    writeProfiles(profDir, [harnessProfile(root)]);
    writeMarker(root, { profile: 'harness', resolved_by: 'marker' });
    const r = runRoute({
      task: '加功能',
      flags: ['yolo'],
      cwd: root,
      profilesDir: profDir,
      gitRemote: null,
      skipGit: true,
    });
    expect(r.resolved_mode).toBe('aggressive');
    expect(r.hard_floor).toEqual([]);
    fs.removeSync(root);
  });

  it('8) JSON output conforms to route-output.schema.json shape', () => {
    const root = tmpDir();
    const profDir = path.join(root, 'profiles');
    writeProfiles(profDir, [harnessProfile(root)]);
    writeMarker(root, { profile: 'harness', resolved_by: 'marker' });
    const r = runRoute({
      task: '加一个按钮',
      cwd: root,
      profilesDir: profDir,
      gitRemote: null,
      skipGit: true,
    });
    expect(typeof r.leaf_skill).toBe('string');
    expect(typeof r.resolved_profile).toBe('string');
    expect(typeof r.resolved_mode).toBe('string');
    expect(typeof r.task_description).toBe('string');
    expect(Array.isArray(r.hard_floor)).toBe(true);
    expect(typeof r.knowledge_manifest).toBe('object');
    expect(typeof r.fast_path_hit).toBe('boolean');
    expect(typeof r.context_to_inject).toBe('string');
    fs.removeSync(root);
  });
});
