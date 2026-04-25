import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  loadProfile,
  listProfiles,
  matchProfile,
  readMarker,
  writeMarker,
  validateProfile,
  MARKER_PATH,
} from '../../src/utils/profile.js';
import { Profile } from '../../src/types/profile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function loadFixture(name: string): { yamlText: string; parsed: unknown } {
  const yamlText = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
  const parsed = parseYaml(yamlText);
  return { yamlText, parsed };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-profile-'));
}

function mkProfile(name: string, priority = 10, matchers: Profile['detection']['matchers'] = []): string {
  const yaml = `name: ${name}
description: Test profile ${name}
detection:
  priority: ${priority}
  matchers:
${matchers.map((m) => `    - type: ${m.type}\n      pattern: "${m.pattern}"`).join('\n') || '    []'}
entry_skill: profile-entry
task_types:
  quick: ${name}-quick
  bugfix: ${name}-bugfix
  feature: ${name}-feature
  refactor: ${name}-refactor
default_mode: standard
hard_floor: []
`;
  return yaml;
}

describe('profile loader', () => {
  it('loadProfile parses valid YAML', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'harness.yml');
    fs.writeFileSync(file, mkProfile('harness'));
    const p = loadProfile(file);
    expect(p.name).toBe('harness');
    expect(p.entry_skill).toBe('profile-entry');
    expect(p.task_types.quick).toBe('harness-quick');
    fs.removeSync(dir);
  });

  it('loadProfile throws on invalid schema', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'bad.yml');
    fs.writeFileSync(file, 'name: bad\n'); // missing required fields
    expect(() => loadProfile(file)).toThrow();
    fs.removeSync(dir);
  });

  it('listProfiles reads all *.yml in a directory', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'a.yml'), mkProfile('a', 10));
    fs.writeFileSync(path.join(dir, 'b.yml'), mkProfile('b', 20));
    fs.writeFileSync(path.join(dir, 'notes.md'), '# not a profile');
    const profiles = listProfiles(dir);
    expect(profiles).toHaveLength(2);
    expect(profiles.map((p) => p.name).sort()).toEqual(['a', 'b']);
    fs.removeSync(dir);
  });
});

describe('profile matcher + tie-break', () => {
  it('highest priority wins', () => {
    const profiles: Profile[] = [
      JSON.parse(JSON.stringify({
        name: 'low',
        description: '',
        detection: { priority: 5, matchers: [{ type: 'path_glob', pattern: '/tmp/**' }] },
        entry_skill: 'profile-entry',
        task_types: { quick: 'lq', bugfix: 'lb', feature: 'lf', refactor: 'lr' },
        default_mode: 'standard',
        hard_floor: [],
      })),
      JSON.parse(JSON.stringify({
        name: 'high',
        description: '',
        detection: { priority: 20, matchers: [{ type: 'path_glob', pattern: '/tmp/**' }] },
        entry_skill: 'profile-entry',
        task_types: { quick: 'hq', bugfix: 'hb', feature: 'hf', refactor: 'hr' },
        default_mode: 'standard',
        hard_floor: [],
      })),
    ];
    const result = matchProfile(profiles, { cwd: '/tmp/foo', gitRemote: null });
    expect(result?.name).toBe('high');
  });

  it('tie-break by specificity (longer glob wins)', () => {
    const profiles: Profile[] = [
      {
        name: 'short',
        description: '',
        detection: { priority: 10, matchers: [{ type: 'path_glob', pattern: '/tmp/**' }] },
        entry_skill: 'profile-entry',
        task_types: { quick: 'x', bugfix: 'x', feature: 'x', refactor: 'x' },
        default_mode: 'standard',
        hard_floor: [],
      },
      {
        name: 'long',
        description: '',
        detection: { priority: 10, matchers: [{ type: 'path_glob', pattern: '/tmp/foo/**' }] },
        entry_skill: 'profile-entry',
        task_types: { quick: 'x', bugfix: 'x', feature: 'x', refactor: 'x' },
        default_mode: 'standard',
        hard_floor: [],
      },
    ];
    const result = matchProfile(profiles, { cwd: '/tmp/foo/bar', gitRemote: null });
    expect(result?.name).toBe('long');
  });

  it('returns null when no matcher hits', () => {
    const profiles: Profile[] = [
      {
        name: 'p',
        description: '',
        detection: { priority: 10, matchers: [{ type: 'path_glob', pattern: '/var/**' }] },
        entry_skill: 'profile-entry',
        task_types: { quick: 'x', bugfix: 'x', feature: 'x', refactor: 'x' },
        default_mode: 'standard',
        hard_floor: [],
      },
    ];
    expect(matchProfile(profiles, { cwd: '/tmp/foo', gitRemote: null })).toBeNull();
  });

  it('git_remote_regex matcher works', () => {
    const profiles: Profile[] = [
      {
        name: 'gh',
        description: '',
        detection: { priority: 10, matchers: [{ type: 'git_remote_regex', pattern: 'github.com:acme/.*' }] },
        entry_skill: 'profile-entry',
        task_types: { quick: 'x', bugfix: 'x', feature: 'x', refactor: 'x' },
        default_mode: 'standard',
        hard_floor: [],
      },
    ];
    const result = matchProfile(profiles, { cwd: '/tmp/x', gitRemote: 'git@github.com:acme/repo.git' });
    expect(result?.name).toBe('gh');
  });

  it('file_exists matcher checks cwd for file', () => {
    const root = tmpDir();
    fs.writeFileSync(path.join(root, 'pom.xml'), '');
    const profiles: Profile[] = [
      {
        name: 'java',
        description: '',
        detection: { priority: 10, matchers: [{ type: 'file_exists', pattern: 'pom.xml' }] },
        entry_skill: 'profile-entry',
        task_types: { quick: 'x', bugfix: 'x', feature: 'x', refactor: 'x' },
        default_mode: 'standard',
        hard_floor: [],
      },
    ];
    expect(matchProfile(profiles, { cwd: root, gitRemote: null })?.name).toBe('java');
    fs.removeSync(root);
  });
});

describe('.harness-profile marker', () => {
  it('readMarker returns null if absent', () => {
    const root = tmpDir();
    expect(readMarker(root)).toBeNull();
    fs.removeSync(root);
  });

  it('writeMarker then readMarker round-trip', () => {
    const root = tmpDir();
    writeMarker(root, { profile: 'harness', resolved_by: 'marker' });
    const m = readMarker(root);
    expect(m?.profile).toBe('harness');
    expect(m?.resolved_by).toBe('marker');
    expect(m?.updated_at).toMatch(/^\d{4}-/);
    fs.removeSync(root);
  });

  it('MARKER_PATH is .harness-profile (no dot-harness subdir)', () => {
    // Spec: project root level marker, not inside .harness/
    expect(MARKER_PATH).toBe('.harness-profile');
  });
});

describe('validateProfile (defensive)', () => {
  it('flags placeholder residue (REPLACE_ME / __X__)', () => {
    const { yamlText, parsed } = loadFixture('placeholder-residue-pack.yml');
    const violations = validateProfile(yamlText, parsed);
    expect(violations.some((v) => /Placeholder residue/.test(v))).toBe(true);
  });

  it('flags illegal matcher type not in MATCHER_TYPES whitelist', () => {
    const { yamlText, parsed } = loadFixture('illegal-matcher-pack.yml');
    const violations = validateProfile(yamlText, parsed);
    expect(violations.some((v) => /illegal/.test(v))).toBe(true);
  });

  it('flags every missing required field', () => {
    const { yamlText, parsed } = loadFixture('missing-fields-pack.yml');
    const violations = validateProfile(yamlText, parsed);
    // missing: detection / entry_skill / default_mode / hard_floor (task_types is present)
    expect(violations.length).toBeGreaterThanOrEqual(4);
    for (const k of ['detection', 'entry_skill', 'default_mode', 'hard_floor']) {
      expect(violations.some((v) => v.includes(`Missing required field: ${k}`))).toBe(
        true,
      );
    }
  });
});
