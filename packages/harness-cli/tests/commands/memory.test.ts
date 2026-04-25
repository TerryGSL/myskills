import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import { runMemoryCheck } from '../../src/commands/memory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-memory-cmd-'));
}

function writeFile(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.ensureDirSync(path.dirname(abs));
  fs.writeFileSync(abs, body, 'utf8');
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validateLayer = ajv.compile(
  fs.readJsonSync(
    path.resolve(__dirname, '..', '..', 'resources', 'schemas', 'memory.schema.json'),
  ),
);

describe('commands/memory check (PR C4)', () => {
  it('clean tree → exitCode 0, layers conform schema, current_violations empty', () => {
    const root = tmpProject();
    // Intact memory tree
    writeFile(root, 'docs/memory/.harness-memory.yml', 'schema_version: "1.0.0"\n');
    for (const sub of ['cases', 'decisions', 'constraints', 'archive']) {
      fs.ensureDirSync(path.join(root, 'docs/memory', sub));
    }
    writeFile(root, 'docs/memory/errors.md', '---\nwriter: user\n---\n');
    writeFile(root, '.harness/walkthrough.md', '---\nwriter: leaf\n---\n');
    writeFile(root, '.harness/current.json', '{}');

    const r = runMemoryCheck({ projectRoot: root });
    expect(r.exitCode).toBe(0);
    expect(r.current_violations).toEqual([]);
    for (const layer of r.layers) {
      const ok = validateLayer(layer);
      if (!ok) {
        throw new Error(JSON.stringify(validateLayer.errors));
      }
    }
  });

  it('violation present → exitCode 2', () => {
    const root = tmpProject();
    // No memory tree at all → missing workflow + session anchors get flagged
    const r = runMemoryCheck({ projectRoot: root });
    expect(r.exitCode).toBe(2);
    expect(r.current_violations.length).toBeGreaterThan(0);
    const walkthrough = r.current_violations.find(
      (v) => v.file === '.harness/walkthrough.md',
    );
    expect(walkthrough).toBeDefined();
  });
});
