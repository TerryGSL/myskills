import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const SAMPLE = path.join(REPO, 'resources/skills/_sample/SAMPLE.md');
const TSX = path.resolve(REPO, '../../node_modules/.bin/tsx');

describe('generate-doc-fragments', () => {
  let original: string;

  beforeAll(() => {
    original = fs.readFileSync(SAMPLE, 'utf8');
  });

  afterAll(() => {
    fs.writeFileSync(SAMPLE, original);
  });

  it('replaces @generated:rule-status anchor with canonical values', () => {
    // Reset to placeholder state first
    fs.writeFileSync(SAMPLE, original);
    const r = spawnSync(TSX, ['scripts/generate-doc-fragments.ts'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);

    const content = fs.readFileSync(SAMPLE, 'utf8');
    expect(content).toMatch(/active.*expired.*drifted.*superseded/s);
    expect(content).toMatch(/auto_push.*force_push.*destructive_ops/s);
  });

  it('--check mode exits 1 when diff exists', () => {
    // Reset to placeholder state, then --check should detect diff
    fs.writeFileSync(SAMPLE, original);
    const r = spawnSync(TSX, ['scripts/generate-doc-fragments.ts', '--check'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/out of date|diff/i);
  });

  it('unknown @generated key exits non-zero', () => {
    fs.writeFileSync(SAMPLE, '<!-- @generated:unknown-key -->\nx\n<!-- @/generated -->\n');
    const r = spawnSync(TSX, ['scripts/generate-doc-fragments.ts'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(r.status).not.toBe(0);
    fs.writeFileSync(SAMPLE, original);
  });
});
