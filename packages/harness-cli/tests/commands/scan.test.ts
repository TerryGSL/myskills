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
  it('empty project → 0 domains（不假塞 placeholder，no init required）', () => {
    const root = tmpProject();
    try {
      const r = runScan({ projectRoot: root, json: true });
      expect(r.exitCode).toBe(0);
      expect(r.action).toBe('json-manifest');
      expect(r.knowledge).toBeDefined();
      const k = r.knowledge!;
      // 用户反馈"我没说就别塞" — empty project 跑 detector 没证据 → 不 emit domain
      expect(k.domains).toEqual([]);
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

  it('comma-separated --domain narrows scope; 空项目仍 0 domain（不假塞）', () => {
    const root = tmpProject();
    try {
      const r = runScan({
        projectRoot: root,
        json: true,
        domain: 'api,deployment',
      });
      expect(r.exitCode).toBe(0);
      // 空项目即使指定 --domain，detector 找不到证据 → 不 emit
      expect(r.knowledge!.domains).toEqual([]);
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
      // init 后 docs/memory 等存在但代码层面没 api/db/deployment evidence
      // → detector 无证据 → 0 domain（不假塞）
      expect(j.knowledge!.domains.length).toBe(0);
    } finally {
      fs.removeSync(root);
    }
  });
});
