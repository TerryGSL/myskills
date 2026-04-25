/**
 * Golden conformance fixtures (PR A2.2).
 *
 * Each fixture in tests/fixtures/golden/*.yml describes one input → expected_output pair
 * for a piece of the unified-fusion flow. Fixtures carry a `status` field:
 *
 *   - `active`               : run real assertions now (PR A2.2 stage: structural-only).
 *   - `pending_until_PR-C<n>` : skipped via jest test.skip until the corresponding C-series PR
 *                               implements the runner. Once the runner exists, flip status to
 *                               `active` and extend this file to spawn the CLI / call the lib
 *                               and compare against `expected_output`.
 *
 * The `runner` field selects how a fixture is exercised:
 *
 *   - `manual`           : hand-checked oracle; this test only asserts shape (input + expected_output present).
 *   - `profile-resolve`  : exercises `harness` profile resolution (PR C1).
 *   - `push-check`       : exercises `harness push-check` command (already shipped in PR 5; runner stub here
 *                          will be wired up to the real CLI when the C-series fixture format stabilises).
 *   - `route`            : exercises `harness route --json` (PR C5).
 *
 * For the current PR (A2.2) all fixtures only need to exist on disk with a valid YAML shape.
 * Pending fixtures are recorded as `test.skip` so they show up in jest output as a TODO list,
 * not silent placeholders.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/golden');

interface GoldenFixture {
  description?: string;
  runner?: string;
  status?: string;
  input?: unknown;
  expected_output?: unknown;
}

const fixtureFiles = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.yml'))
  .sort();

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

      // PR A2.2 stops at structural assertions. Real CLI invocation lands when the
      // matching C-series PR ships (see comment block at top of file).
      if (fixture.runner === 'manual') {
        // hand-checked oracle — nothing more to do here
        return;
      }
      // Other active runners (e.g. push-check) will spawn the CLI in a follow-up PR.
      // For now, just confirm the runner name is one we recognise.
      const knownRunners = new Set([
        'manual',
        'profile-resolve',
        'push-check',
        'route',
      ]);
      expect(knownRunners.has(fixture.runner ?? '')).toBe(true);
    });
  }
});
