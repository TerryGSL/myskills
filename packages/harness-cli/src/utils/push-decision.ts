import { spawnSync } from 'node:child_process';
import { type PushRiskLevel } from '../types/constants.js';

export interface RiskAssessment {
  level: PushRiskLevel;
  reasons: string[];
  action: 'refuse' | 'ask' | 'auto';
  exit_code: 0 | 1 | 2;
}

export interface AssessInput {
  hardFloor: string[];
  cwd?: string;
  // 测试时可注入；实际从 git 读
  diffStat?: string;
  diffFull?: string;
  testsFailed?: boolean;
}

export function assessPushRisk(input: AssessInput): RiskAssessment {
  // Step 1: 公司硬底优先
  if (input.hardFloor.includes('auto_push')) {
    return {
      level: 'high',
      reasons: ['hard_floor includes auto_push (company profile)'],
      action: 'refuse',
      exit_code: 2,
    };
  }

  // Step 2: 收集 diff（测试可注入；实际跑 git）
  const cwd = input.cwd || process.cwd();
  let diffStat = input.diffStat ?? '';
  let diffFull = input.diffFull ?? '';
  if (input.diffStat === undefined && input.diffFull === undefined) {
    const stat = spawnSync('git', ['diff', '--stat', 'HEAD~1', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    });
    const full = spawnSync('git', ['diff', 'HEAD~1', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    });
    if (stat.status !== 0 || full.status !== 0) {
      return {
        level: 'medium',
        reasons: ['No diff available; defaulting to medium'],
        action: 'ask',
        exit_code: 1,
      };
    }
    diffStat = stat.stdout;
    diffFull = full.stdout;
  }

  // Parse files from diff --stat output
  const fileLines = diffStat.split('\n').filter((l) => /^\s*\S+\s+\|/.test(l));
  const filesList = fileLines
    .map((l) => (l.match(/^\s*(\S+)\s+\|/) || [])[1])
    .filter((s): s is string => Boolean(s));
  const filesChanged = filesList.length;

  const reasons: string[] = [];

  // HIGH conditions (any hit → high)
  if (filesList.some((f) => /\.env|\.secrets|credentials/i.test(f))) {
    reasons.push('Touches secrets');
  }
  if (
    /(\bpackage\.json|pyproject\.toml|go\.mod|Cargo\.toml).*("?dependencies"?|requires)/s.test(
      diffFull,
    )
  ) {
    reasons.push('Modifies dependencies');
  }
  if (filesList.some((f) => /migrations\/|schema\.sql|\.sql$/.test(f))) {
    reasons.push('Modifies db schema');
  }
  if (
    filesList.some((f) =>
      /\.github\/workflows\/|Dockerfile|Makefile|\.gitlab-ci\.yml/.test(f),
    )
  ) {
    reasons.push('Modifies CI/build');
  }
  if (filesChanged > 3) {
    reasons.push(`>3 files changed (${filesChanged})`);
  }
  if (input.testsFailed) {
    reasons.push('Tests failed');
  }
  if (/\bBREAKING\b|DROP TABLE|rm -rf|force_destroy/.test(diffFull)) {
    reasons.push('Contains destructive keyword');
  }
  if (
    filesList.some((f) =>
      /(?:^|\/)index\.ts$|(?:^|\/)__init__\.py$|(?:^|\/)lib\.rs$/.test(f),
    )
  ) {
    reasons.push('Modifies public exports');
  }

  if (reasons.length > 0) {
    return { level: 'high', reasons, action: 'refuse', exit_code: 2 };
  }

  // LOW conditions
  const onlyDocs =
    filesList.length > 0 && filesList.every((f) => /\.(md|txt|po|json)$/.test(f));
  const diffLines = diffFull.split('\n').length;
  const singleSmall = filesChanged === 1 && diffLines < 12;

  if (onlyDocs) {
    return {
      level: 'low',
      reasons: ['Only md/txt/po/json (i18n)'],
      action: 'auto',
      exit_code: 0,
    };
  }
  if (singleSmall) {
    return {
      level: 'low',
      reasons: ['Single file < 10 lines'],
      action: 'auto',
      exit_code: 0,
    };
  }

  // MEDIUM 默认
  return {
    level: 'medium',
    reasons: ['General business change'],
    action: 'ask',
    exit_code: 1,
  };
}
