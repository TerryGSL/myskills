/**
 * Golden conformance fixtures (PR A2.2 + PR C1+).
 *
 * Each fixture in tests/fixtures/golden/*.yml describes one input → expected_output pair
 * for a piece of the unified-fusion flow. Fixtures carry a `status` field:
 *
 *   - `active`               : run real assertions (spawn CLI / call lib / hand-check oracle).
 *   - `pending_until_PR-C<n>` : skipped via jest test.skip until the corresponding C-series PR
 *                               implements the runner. Once the runner exists, flip status to
 *                               `active` and extend this file to spawn the CLI / call the lib
 *                               and compare against `expected_output`.
 *
 * The `runner` field selects how a fixture is exercised:
 *
 *   - `manual`           : hand-checked oracle; this test only asserts shape (input + expected_output present).
 *   - `profile-resolve`  : exercises `harness profile-resolve --json` (PR C1 — wired below).
 *   - `push-check`       : exercises `harness push-check` command (already shipped in PR 5; runner stub here
 *                          will be wired up to the real CLI when the C-series fixture format stabilises).
 *   - `route`            : exercises `harness route --json` (PR C5).
 */
import * as fs from 'node:fs';
import fsx from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/golden');
const CLI_BIN = path.resolve(__dirname, '../bin/cli.js');
const REPO_ROOT = path.resolve(__dirname, '..');

interface GoldenFixture {
  description?: string;
  runner?: string;
  status?: string;
  input?: unknown;
  expected_output?: unknown;
}

interface ProfileResolveFixtureInput {
  cwd: string;
  marker_file: { profile: string; resolved_by: string; updated_at: string } | null;
  available_profiles: Array<Record<string, unknown>>;
}

const fixtureFiles = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.yml'))
  .sort();

function profileToYaml(p: Record<string, unknown>): string {
  // yaml.stringify produces valid YAML for the schema we own.
  return yaml.stringify(p);
}

function tmpDir(): string {
  return fsx.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-golden-'));
}

function runProfileResolveFixture(fixturePath: string, input: ProfileResolveFixtureInput): unknown {
  const home = tmpDir();
  try {
    const cwd = input.cwd.replace(/\{HOME\}/g, home);
    fsx.ensureDirSync(cwd);

    const profilesDir = path.join(home, '.claude', 'profiles');
    fsx.ensureDirSync(profilesDir);
    for (const p of input.available_profiles) {
      const name = String((p as { name?: unknown }).name ?? 'unnamed');
      fs.writeFileSync(path.join(profilesDir, `${name}.yml`), profileToYaml(p));
    }

    if (input.marker_file) {
      const m = input.marker_file;
      const body = `profile: ${m.profile}\nresolved_by: ${m.resolved_by}\nupdated_at: ${m.updated_at}\n`;
      fs.writeFileSync(path.join(cwd, '.harness-profile'), body);
    }

    const result = spawnSync(
      'node',
      [CLI_BIN, 'profile-resolve', '--json', '--profiles-dir', profilesDir, '--git-remote', '', cwd],
      {
        encoding: 'utf8',
        env: { ...process.env, HOME: home },
        cwd: REPO_ROOT,
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `CLI failed (fixture=${path.basename(fixturePath)}, exit=${result.status}): ${result.stderr}`,
      );
    }
    return JSON.parse(result.stdout);
  } finally {
    fsx.removeSync(home);
  }
}

describe('golden conformance fixtures', () => {
  it('discovers at least 20 golden fixtures', () => {
    expect(fixtureFiles.length).toBeGreaterThanOrEqual(20);
  });

  for (const fixtureFile of fixtureFiles) {
    const fixturePath = path.join(FIXTURES_DIR, fixtureFile);
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const fixture = yaml.parse(raw) as GoldenFixture;
    const desc = fixture?.description ?? '(no description)';
    const status = fixture?.status ?? 'active';

    if (typeof status === 'string' && status.startsWith('pending_until_')) {
      // Pending fixtures show up as a skip in jest output (visible TODO).
      // eslint-disable-next-line jest/no-disabled-tests
      test.skip(`${fixtureFile} [${status}] ${desc}`, () => {
        /* unblock when the corresponding PR-C ships its runner */
      });
      continue;
    }

    test(`${fixtureFile} [${status}] ${desc}`, () => {
      // Structural assertions: every fixture must have input + expected_output.
      expect(fixture).toBeDefined();
      expect(fixture.input).toBeDefined();
      expect(fixture.expected_output).toBeDefined();
      // Active fixtures must declare a runner (manual or a CLI command name).
      expect(typeof fixture.runner).toBe('string');
      expect((fixture.runner ?? '').length).toBeGreaterThan(0);

      if (fixture.runner === 'manual') {
        // hand-checked oracle — nothing more to do here
        return;
      }

      if (fixture.runner === 'profile-resolve') {
        const actual = runProfileResolveFixture(
          fixturePath,
          fixture.input as ProfileResolveFixtureInput,
        );
        expect(actual).toEqual(fixture.expected_output);
        return;
      }

      // Other active runners (push-check / route) get wired up in their respective C-series PRs.
      const knownRunners = new Set(['manual', 'profile-resolve', 'push-check', 'route']);
      expect(knownRunners.has(fixture.runner ?? '')).toBe(true);
    });
  }
});
