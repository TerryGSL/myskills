import Ajv from 'ajv/dist/2020.js';
import fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Profile, HardFloorAction } from '../../src/types/profile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Profile canonical schema', () => {
  const ajv = new Ajv({ allErrors: true });
  const schema = fs.readJsonSync(
    path.join(__dirname, '../../resources/schemas/profile.schema.json')
  );
  const validate = ajv.compile(schema);

  it('HardFloorAction has 6 values', () => {
    const all: HardFloorAction[] = [
      'auto_push',
      'force_push',
      'destructive_ops',
      'auto_merge',
      'rewrite_history',
      'network_install',
    ];
    expect(all).toHaveLength(6);
  });

  it('minimal personal profile validates', () => {
    const p: Profile = {
      name: 'harness',
      description: 'Personal',
      detection: { priority: 10, matchers: [{ type: 'path_glob', pattern: '~/**' }] },
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
    expect(validate(p)).toBe(true);
  });

  it('company-mt profile with full hard_floor validates', () => {
    const p: Profile = {
      name: 'company-mt',
      description: 'Meituan enterprise',
      detection: { priority: 30, matchers: [{ type: 'file_exists', pattern: 'pom.xml' }] },
      entry_skill: 'profile-entry',
      task_types: {
        quick: 'company-quick',
        bugfix: 'company-bugfix',
        feature: 'company-feature',
        refactor: 'company-refactor',
      },
      default_mode: 'conservative',
      hard_floor: [
        'auto_push',
        'force_push',
        'destructive_ops',
        'auto_merge',
        'rewrite_history',
        'network_install',
      ],
    };
    expect(validate(p)).toBe(true);
  });

  it('unknown hard_floor action rejected', () => {
    const p = {
      name: 'bad',
      description: 'x',
      detection: { priority: 1, matchers: [] },
      entry_skill: 'profile-entry',
      task_types: { quick: 'x', bugfix: 'x', feature: 'x', refactor: 'x' },
      default_mode: 'standard',
      hard_floor: ['nope_not_a_real_action'],
    };
    expect(validate(p)).toBe(false);
  });
});
