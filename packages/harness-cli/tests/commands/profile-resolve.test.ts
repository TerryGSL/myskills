import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { runProfileResolve } from '../../src/commands/profile-resolve.js';
import { writeMarker } from '../../src/utils/profile.js';
import type { Profile } from '../../src/types/profile.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-resolve-'));
}

function profileYaml(p: Profile): string {
  // Hand-written so test isn't coupled to YAML serializer formatting.
  // Use single-quoted YAML strings so backslashes don't need escaping (regex patterns).
  const matchers = p.detection.matchers
    .map((m) => `    - type: ${m.type}\n      pattern: '${m.pattern.replace(/'/g, "''")}'`)
    .join('\n');
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
hard_floor: []
`;
}

function writeProfiles(dir: string, profiles: Profile[]): void {
  fs.ensureDirSync(dir);
  for (const p of profiles) {
    fs.writeFileSync(path.join(dir, `${p.name}.yml`), profileYaml(p));
  }
}

const harnessProfile: Profile = {
  name: 'harness',
  description: 'personal',
  detection: {
    priority: 10,
    matchers: [{ type: 'path_glob', pattern: '~/Music/myskills/**' }],
  },
  entry_skill: 'profile-entry',
  task_types: {
    quick: 'harness-quick',
    bugfix: 'harness-bugfix',
    feature: 'harness-feature',
    refactor: 'harness-refactor',
  },
  default_mode: 'standard',
  hard_floor: [],
};

const defaultProfile: Profile = {
  name: 'default',
  description: 'fallback',
  detection: {
    priority: 0,
    matchers: [{ type: 'path_glob', pattern: '/__never_matches_anything__/**' }],
  },
  entry_skill: 'profile-entry',
  task_types: {
    quick: 'harness-quick',
    bugfix: 'harness-bugfix',
    feature: 'harness-feature',
    refactor: 'harness-refactor',
  },
  default_mode: 'conservative',
  hard_floor: [],
};

describe('harness profile-resolve (PR C1)', () => {
  it('1) marker present → resolved_by=marker, matched_pattern=null', () => {
    const root = tmpDir();
    const profDir = path.join(root, 'profiles');
    writeProfiles(profDir, [harnessProfile]);
    writeMarker(root, { profile: 'harness', resolved_by: 'marker' });
    const r = runProfileResolve({ cwd: root, profilesDir: profDir, gitRemote: null });
    expect(r.profile_name).toBe('harness');
    expect(r.resolved_by).toBe('marker');
    expect(r.matched_pattern).toBeNull();
    fs.removeSync(root);
  });

  it('2) no marker, path_glob matcher hits → resolved_by=matcher, matched_pattern set', () => {
    const root = tmpDir();
    const profDir = path.join(root, 'profiles');
    // Build a profile whose path_glob will literally match `root` (uses root prefix).
    const p: Profile = {
      ...harnessProfile,
      detection: {
        priority: 10,
        matchers: [{ type: 'path_glob', pattern: `${root}/**` }],
      },
    };
    writeProfiles(profDir, [p]);
    const r = runProfileResolve({ cwd: root, profilesDir: profDir, gitRemote: null });
    expect(r.profile_name).toBe('harness');
    expect(r.resolved_by).toBe('matcher');
    expect(r.matched_pattern).toBe(`${root}/**`);
    fs.removeSync(root);
  });

  it('3) git_remote_regex matcher hits → matched_pattern is the regex', () => {
    const root = tmpDir();
    const profDir = path.join(root, 'profiles');
    const p: Profile = {
      ...harnessProfile,
      name: 'gh-acme',
      detection: {
        priority: 10,
        matchers: [{ type: 'git_remote_regex', pattern: 'github\\.com[:/]acme/.*' }],
      },
    };
    writeProfiles(profDir, [p]);
    const r = runProfileResolve({
      cwd: root,
      profilesDir: profDir,
      gitRemote: 'git@github.com:acme/repo.git',
    });
    expect(r.profile_name).toBe('gh-acme');
    expect(r.resolved_by).toBe('matcher');
    expect(r.matched_pattern).toBe('github\\.com[:/]acme/.*');
    fs.removeSync(root);
  });

  it('4) tie at same priority + same specificity → throws', () => {
    const root = tmpDir();
    const profDir = path.join(root, 'profiles');
    const a: Profile = {
      ...harnessProfile,
      name: 'aprof',
      detection: {
        priority: 10,
        matchers: [{ type: 'path_glob', pattern: `${root}/**` }],
      },
    };
    const b: Profile = {
      ...harnessProfile,
      name: 'bprof',
      detection: {
        priority: 10,
        matchers: [{ type: 'path_glob', pattern: `${root}/**` }],
      },
    };
    writeProfiles(profDir, [a, b]);
    expect(() =>
      runProfileResolve({ cwd: root, profilesDir: profDir, gitRemote: null }),
    ).toThrow(/tie/);
    fs.removeSync(root);
  });

  it('5) no marker + no matcher hits + default profile → fall back to default', () => {
    const root = tmpDir();
    const profDir = path.join(root, 'profiles');
    writeProfiles(profDir, [defaultProfile]);
    const r = runProfileResolve({ cwd: root, profilesDir: profDir, gitRemote: null });
    expect(r.profile_name).toBe('default');
    expect(r.resolved_by).toBe('matcher');
    expect(r.matched_pattern).toBeNull();
    fs.removeSync(root);
  });
});
