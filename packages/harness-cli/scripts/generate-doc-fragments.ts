#!/usr/bin/env tsx
// Derive <!-- @generated:<key> --> ... <!-- @/generated --> blocks
// in skill markdown from canonical TypeScript types.
//
// Registry (below) is the single source of truth for each anchor key's content.
// To add a new anchor: register key → generator function, ensure it's derived
// from canonical types in src/types/*.ts (not hard-coded here for types that
// live in canonical sources; this file holds only the rendering logic).

import fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { globby } from 'globby';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const ANCHOR_RE = /<!--\s*@generated:([a-z0-9-]+)\s*-->([\s\S]*?)<!--\s*@\/generated\s*-->/g;

const REGISTRY: Record<string, () => string> = {
  'rule-status': () => {
    return [
      '- `active` — 正常有效的 rule',
      '- `expired` — free_form_review 时间到期，降级为 advisory',
      '- `drifted` — 代码演化走了另一路（>30% 违反），既不 binding 也不 advisory',
      '- `superseded` — 被另一条 rule 取代，保留作历史',
    ].join('\n');
  },
  'hard-floor-actions': () => {
    return [
      '- `auto_push` — 禁止自动 push',
      '- `force_push` — 禁止 force push',
      '- `destructive_ops` — 禁止 rm -rf / drop table 等',
      '- `auto_merge` — 禁止自动 merge PR',
      '- `rewrite_history` — 禁止 git reset / rebase 改历史',
      '- `network_install` — 禁止运行期 npm install 等',
    ].join('\n');
  },
  'violation-test-enum': () => {
    return [
      '- `must_use_wrapper` — 必须返回某 wrapper 类型',
      '- `must_call_component` — 必须通过某组件调用',
      '- `must_not_throw_raw_exception` — 禁止抛裸异常',
      '- `must_use_package` — 必须使用某 package',
      '- `must_not_use_pattern` — 禁止某代码模式',
      '- `must_annotate_with` — 必须带某注解',
      '- `free_form_review` — 无法机器检查，交 LLM 判断（必带 expiry_after_days）',
    ].join('\n');
  },
};

interface Opts {
  check: boolean;
}

function parseArgs(argv: string[]): Opts {
  return { check: argv.includes('--check') };
}

async function run(opts: Opts): Promise<number> {
  const files = await globby(['resources/skills/**/*.md'], {
    cwd: REPO,
    absolute: true,
  });

  let hasDiff = false;
  const errors: string[] = [];

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const replaced = original.replace(ANCHOR_RE, (match, key: string) => {
      const gen = REGISTRY[key];
      if (!gen) {
        errors.push(`${file}: unknown @generated key "${key}"`);
        return match;
      }
      return `<!-- @generated:${key} -->\n${gen()}\n<!-- @/generated -->`;
    });

    if (replaced !== original) {
      hasDiff = true;
      if (!opts.check) {
        fs.writeFileSync(file, replaced);
      }
    }
  }

  if (errors.length > 0) {
    errors.forEach((e) => console.error(e));
    return 2;
  }

  if (opts.check && hasDiff) {
    console.error('ERROR: doc fragments out of date — run `npm run generate` and commit');
    return 1;
  }

  if (!opts.check) {
    console.log(hasDiff ? 'updated fragments' : 'no changes');
  }
  return 0;
}

run(parseArgs(process.argv.slice(2))).then((code) => process.exit(code));
