import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { deriveProfile } from '../../src/utils/derive.js';

/**
 * derive.ts unit tests — mirrors the 6 test cases from
 * harness/profile-bootstrap/lib/test-derive.sh so the bash
 * oracle and TS port stay in lockstep.
 */

function git(args: string[], cwd: string): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  }
}

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `derive-test-${prefix}-`));
}

const cleanup: string[] = [];
const ORIGINAL_CWD = process.cwd();

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
});

afterAll(() => {
  for (const d of cleanup) {
    try {
      fs.removeSync(d);
    } catch {
      // best-effort cleanup
    }
  }
});

describe('deriveProfile', () => {
  it('SSH github + user-supplied slug → slug=acme, regex contains acme/api', () => {
    const dir = tmpDir('ssh');
    cleanup.push(dir);
    git(['init', '-q'], dir);
    git(['remote', 'add', 'origin', 'git@github.com:acme/api.git'], dir);
    process.chdir(dir);
    const r = deriveProfile('acme');
    expect(r.slug).toBe('acme');
    expect(r.remoteRegex).toContain('acme');
    expect(r.remoteRegex).toContain('api');
    expect(r.remoteRegex).toMatch(/github\\\.com/);
  });

  it('HTTPS gitlab + auto-derived slug uses git org', () => {
    const dir = tmpDir('https');
    cleanup.push(dir);
    git(['init', '-q'], dir);
    git(['remote', 'add', 'origin', 'https://gitlab.com/foo/bar.git'], dir);
    process.chdir(dir);
    const r = deriveProfile();
    expect(r.slug).toBe('foo');
    expect(r.remoteRegex).toContain('foo');
    expect(r.remoteRegex).toContain('bar');
  });

  it('inconsistent origin / upstream throws', () => {
    const dir = tmpDir('inconsistent');
    cleanup.push(dir);
    git(['init', '-q'], dir);
    git(['remote', 'add', 'origin', 'git@github.com:user/fork.git'], dir);
    git(['remote', 'add', 'upstream', 'git@github.com:company/orig.git'], dir);
    process.chdir(dir);
    expect(() => deriveProfile()).toThrow(/inconsistent/i);
  });

  it('non-git directory throws "not in a git repo"', () => {
    const dir = tmpDir('nogit');
    cleanup.push(dir);
    process.chdir(dir);
    expect(() => deriveProfile()).toThrow(/not in a git repo/i);
  });

  it('illegal slug "My_Slug" throws', () => {
    const dir = tmpDir('illegal');
    cleanup.push(dir);
    git(['init', '-q'], dir);
    git(['remote', 'add', 'origin', 'git@github.com:org/repo.git'], dir);
    process.chdir(dir);
    expect(() => deriveProfile('My_Slug')).toThrow(/illegal/i);
  });

  it('no remote → remoteRegex empty, slug from user / basename', () => {
    const dir = tmpDir('noremote');
    cleanup.push(dir);
    git(['init', '-q'], dir);
    process.chdir(dir);
    const r = deriveProfile('myrepo');
    expect(r.slug).toBe('myrepo');
    expect(r.remoteRegex).toBe('');
  });
});
