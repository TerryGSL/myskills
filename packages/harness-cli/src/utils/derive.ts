import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

/**
 * derive.ts — TS port of harness-init/lib/derive.sh
 *
 * Spec §A PR 4. Computes:
 *   - canonical (realpath) git repo root
 *   - path_glob (with $HOME → ~ replacement for portability)
 *   - git_remote_regex from ALL configured remotes (must agree on host/org)
 *   - slug (user-supplied > derived from git org > basename)
 *
 * Throws on:
 *   - not in a git repo
 *   - inconsistent host/org across remotes (fork scenario; user must pass --remote)
 *   - illegal slug (only [a-z0-9-]+ permitted)
 */

export interface DeriveResult {
  pathGlob: string;
  /** Empty string when no remote is configured. */
  remoteRegex: string;
  slug: string;
  repoRoot: string;
}

/**
 * Run a git subcommand without invoking a shell.
 * Returns trimmed stdout, or null when git exits non-zero.
 */
function runGit(args: string[]): string | null {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return (r.stdout ?? '').toString();
}

/**
 * Derive a profile from the current working directory's git repo.
 *
 * @param userSlug   Optional user-supplied slug (overrides derived).
 * @param remoteName Optional remote filter — when set, only that remote URL is
 *                   considered (origin / upstream). When unset, all remotes are
 *                   scanned and must agree.
 */
export function deriveProfile(userSlug?: string, remoteName?: string): DeriveResult {
  // 1. canonical repo root (no shell — execFile semantics via spawnSync)
  const top = runGit(['rev-parse', '--show-toplevel']);
  if (top === null) throw new Error('Not in a git repo');
  let repoRoot = top.trim();
  try {
    repoRoot = fs.realpathSync(repoRoot);
  } catch {
    // realpath failure on the toplevel is unusual but treat same as no-repo.
    throw new Error('Not in a git repo');
  }

  // 2. path_glob (~ 替换 $HOME 让 yml 可移植)
  const home = os.homedir();
  let pathGlob = `${repoRoot}/**`;
  if (pathGlob.startsWith(`${home}/`)) {
    pathGlob = `~${pathGlob.slice(home.length)}`;
  }

  // 3. 扫所有 remotes（or 仅 remoteName 当指定时）
  let remotesOutput = '';
  if (remoteName) {
    const url = runGit(['remote', 'get-url', remoteName]);
    if (url !== null) remotesOutput = url;
  } else {
    const all = runGit(['remote', '-v']);
    if (all !== null) remotesOutput = all;
  }

  // 提取唯一 URL 集合
  const urls = new Set<string>();
  if (remoteName) {
    const url = remotesOutput.trim();
    if (url) urls.add(url);
  } else {
    for (const line of remotesOutput.split('\n')) {
      // git remote -v 每行：  <name>\t<url> (fetch|push)
      const m = line.match(/^\S+\s+(\S+)\s+\(/);
      if (m) urls.add(m[1]);
    }
  }

  let remoteRegex = '';
  let derivedSlug = '';

  if (urls.size > 0) {
    const parsed: { host: string; org: string; repo: string }[] = [];
    for (const url of urls) {
      // SSH: git@host:org/repo(.git)?
      const ssh = url.match(/^[a-zA-Z0-9_]+@([^:]+):([^/]+)\/(.+)$/);
      // HTTPS: https?://host/org/repo(.git)?
      const https = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/(.+)$/);
      const m = ssh || https;
      if (m) {
        parsed.push({
          host: m[1],
          org: m[2],
          repo: m[3].replace(/\.git$/, ''),
        });
      }
    }

    if (parsed.length > 0) {
      const first = parsed[0];
      const allSame = parsed.every((p) => p.host === first.host && p.org === first.org);
      if (!allSame) {
        const summary = parsed.map((p) => `${p.host}/${p.org}`).join(', ');
        throw new Error(
          `Remotes inconsistent (host/org): ${summary}. Use --remote <name> to pick one.`,
        );
      }
      // Build regex: host[:/]org/repo(\.git)?$
      remoteRegex = `${escapeRegex(first.host)}[:/]${escapeRegex(first.org)}/${escapeRegex(first.repo)}(\\.git)?$`;
      derivedSlug = first.org;
    }
  }

  // 4. slug priority: user > derived > basename
  const slug = userSlug || derivedSlug || path.basename(repoRoot);

  // 5. slug 字符校验
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(
      `Slug "${slug}" contains illegal chars (allowed: a-z 0-9 -). Pass <slug> explicitly.`,
    );
  }

  return { pathGlob, remoteRegex, slug, repoRoot };
}

/**
 * Escape regex meta-characters in an arbitrary string so it can be embedded
 * literally into a RegExp pattern. The matching set mirrors derive.sh's
 * sed expression: `. [ \ * ^ $ ( ) + ? { |`.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.[\\*^$()+?{|]/g, '\\$&');
}
