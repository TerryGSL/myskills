import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runScan } from '../../src/commands/scan.js';
import { runInit } from '../../src/commands/init.js';
import { KNOWLEDGE_DOMAINS } from '../../src/utils/knowledge-scanner.js';

function tmpProject(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-scan-json-'));
  spawnSync('git', ['init', '--quiet'], { cwd: d });
  return d;
}

describe('harness scan --json (PR C2 — 5-domain manifest)', () => {
  it('emits all 5 domains conforming to schema (no init required)', () => {
    const root = tmpProject();
    try {
      const r = runScan({ projectRoot: root, json: true });
      expect(r.exitCode).toBe(0);
      expect(r.action).toBe('json-manifest');
      expect(r.knowledge).toBeDefined();
      const k = r.knowledge!;
      expect(k.domains.map((d) => d.domain)).toEqual(KNOWLEDGE_DOMAINS);
      expect(k.project_root).toBe(root);
      expect(typeof k.scanned_at).toBe('string');
      // No scan-request.json should be written in JSON mode
      expect(fs.existsSync(path.join(root, '.harness/scan-request.json'))).toBe(
        false,
      );
    } finally {
      fs.removeSync(root);
    }
  });

  it('rejects unknown domain', () => {
    const root = tmpProject();
    try {
      const r = runScan({
        projectRoot: root,
        json: true,
        domain: 'frontend',
      });
      expect(r.exitCode).toBe(2);
      expect(r.action).toBe('blocked');
      expect(r.reason).toMatch(/unknown domain/);
    } finally {
      fs.removeSync(root);
    }
  });

  it('comma-separated --domain narrows the scan', () => {
    const root = tmpProject();
    try {
      const r = runScan({
        projectRoot: root,
        json: true,
        domain: 'api,deployment',
      });
      expect(r.exitCode).toBe(0);
      const names = r.knowledge!.domains.map((d) => d.domain).sort();
      expect(names).toEqual(['api', 'deployment']);
    } finally {
      fs.removeSync(root);
    }
  });

  it('does not require memory tree (preflight only applies to non-JSON path)', () => {
    const root = tmpProject();
    try {
      // No init; memory tree absent — JSON mode still works
      const r = runScan({ projectRoot: root, json: true });
      expect(r.exitCode).toBe(0);
      // Sanity: classic mode still blocked
      const r2 = runScan({ projectRoot: root });
      expect(r2.exitCode).toBe(2);
      expect(r2.action).toBe('blocked');
    } finally {
      fs.removeSync(root);
    }
  });

  it('after init, classic preflight + JSON mode coexist', () => {
    const root = tmpProject();
    try {
      runInit({ projectRoot: root, preset: 'personal' });
      const classic = runScan({ projectRoot: root });
      expect(classic.exitCode).toBe(0);
      expect(classic.action).toBe('request-written');
      const j = runScan({ projectRoot: root, json: true });
      expect(j.exitCode).toBe(0);
      expect(j.action).toBe('json-manifest');
      expect(j.knowledge!.domains.length).toBe(5);
    } finally {
      fs.removeSync(root);
    }
  });
});
