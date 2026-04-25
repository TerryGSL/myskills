# Harness CLI 集成与项目级分发 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**：按 spec `harness-workflow/specs/2026-04-24-harness-cli-integration-design.md`（含附录 C skill 处理矩阵）产出 `harness-workflow-cli` npm 包 + 优化现有 `team-init` skill v1（唯一对外入口 skill，保名重塑）+ `profile-entry` / `harness-common` / `harness-{quick,bugfix,feature,refactor}` 六个新 skill + `harness-workflow/skill.md` 重塑为保名 stub + `strict-reviewer` 加 Step 5 + `company-mt` 企业 preset 实体。**现有 skill 保留/扩展/改造清单的单一真源 = spec 附录 C**（含 myskills 仓库内 14 个本地 skill + 独立 Java 生态 3 个外部 skill；3 类处理：保名重塑 2 个 / v1 内容优化 1 个 / 原样保留 11 个 + 外部 3 个）。

**Architecture**：monorepo 在 `packages/harness-cli/` 起新 npm 包，`src/types/*.ts` + `resources/schemas/*.json` 作为唯一真源，`scripts/generate-doc-fragments.ts` 把 canonical 派生到 skill 的 `<!-- @generated -->` 锚点块；CI 跑五关漂移门禁。项目级落地产物：`.harness-profile` / `harness.config.json` / `.harness/` runtime 状态（强制 gitignore）/ `docs/memory/` 三子目录 / `docs/harness/knowledge/` 五领域 / `.claude/skills/` 投放的核心 skill。

**Tech Stack**：TypeScript + commander + fs-extra + yaml + globby + ajv（JSON Schema 校验）+ tsx（dev 运行）；构建用 tsc，发布用 `repo-skill-release` 流程，双 registry（npm public + 公司内部）同 tarball 同名发布。

**依赖顺序**：R1 单一真源 → R2 managed-files + profile loader（并行）→ R3 CLI 前半（init/adopt）→ R4 CLI 后半（maintain/doctor/scan）→ R5 templates 全集 → R6 harness-workflow 保名重塑 → R7 profile-entry + harness-common → R8 harness-quick + harness-bugfix → R9 harness-feature + harness-refactor → R10 strict-reviewer Step 5 → R11 `team-init` v1 重塑 + 双 registry 发布 → R12 company-mt preset 实体。

**规模**：12 Round，**80% 置信区间 14-19 Round**（R3 修复后校准：原估 11-16 是乐观；本次加入双 registry 发布、`repo-skill-release` 兼容 patch、跨项目 smoke、双向 schema migration 等高摩擦外部依赖型 Task，基线 `2026-04-22` memory-reviewer 9 Round × 1.6-2.1 倍）。

**Scope Check 声明 + Master/Sub-plan 两层契约（R2 修复 F1，R3 进一步精化）**：

本 plan 覆盖三个耦合子系统（CLI 包 / skill 生态 / team-init+企业 preset），三者共用 canonical types 单一真源，不拆成三份独立 plan。为兼容 writing-plans skill 的 Reproduction 硬门，采用**两层契约模型**：

### 层级 1：Master plan（本文件）

定义 12 Round 的 Goal / DoD / 依赖 / Task 清单 / 每 Task 的 sub-plan 契约。Master 层本身**不承担 Reproduction 硬门**（不展开 step 级 Run/Expected），只承担：
- Grounding（目录创建映射、skill 保留矩阵、依赖顺序）
- Coverage（spec 每章节都有 Task 映射）
- 每 Task 级 DoD（可测量的完成条件）
- 每 Task 的 sub-plan 契约（明示 sub-plan 必须补的 fixture schema / 安全路径 / expected 矩阵 / 防退化断言）

**Round 1 是例外**：它是基础设施层（types + schema + doc-gen），本 Master 已经 step 级展开（6 Task / 51 step），作为 sub-plan 范式示范。其他 Round 的 sub-plan 按此格式写。

### 层级 2：Round sub-plan（进入该 Round 前强制产出）

每 Round 进入 Stage 2 前必须产出 `harness-workflow/plans/round-<N>-<slug>.md`，**sub-plan 承担 Reproduction 硬门**：
- 每 step Files / Run / Expected / Commit 格式
- 所有 Master 里的 sub-plan 契约条款**已落地为具体 step**（不是转述）
- sub-plan 通过 strict-reviewer 审稿后才算"Stage 2 完成"，Stage 3 才能开始

### 为什么不把 Master 直接全展开到 step 级

1. **过早冻结会僵化**：Round 6-12 距今 11-18 天后才执行，期间 Round 1-5 的实施经验会反推影响 sub-plan 写法（Run 命令、expected output、fixture shape）；冻结在 Master 层反而不准
2. **Master 文件量爆炸**：本 plan 若全展开到 step 级约 3500+ 行（参考 2026-04-22 的 1998 行 L 级），超出 writing-plans skill 可读窗口（Master 自己的 Grounding/Coverage 硬门反而会被掩盖）
3. **sub-plan 粒度更适合 subagent 消费**：harness-workflow Stage 3 用 `subagent-driven-development` 派发，一次派一个 Round sub-plan，subagent 只需读本 Round 的 ~200 行而不是整 3500 行

### 强制约束

- **不允许**跳过 sub-plan 直接进 Stage 3
- **不允许**sub-plan 降低 Master 的 DoD 要求（只能同等或更严）
- **不允许**sub-plan 删改 Master 里的 Task 结构（只能 step 级展开）
- sub-plan 通过 strict-reviewer 自审后（强制 dog-food）才算完成
- Master plan 若发现 Grounding/Coverage 漏洞 → 回 R_N 修 Master；不在 sub-plan 补

---

## Preamble：基线检查（首次进入 Round 1 前跑一次）

- [ ] **Step 1：确认 working tree 干净 + spec 存在**

Run：
```bash
cd /Users/twelve/Pictures/myskills
git status --short
ls harness-workflow/specs/2026-04-24-harness-cli-integration-design.md
git log --oneline -1
```

Expected：
- `git status --short` 为空（除了本 plan 文件和 docs/ 未跟踪）
- `ls` 打印 spec 路径
- 最后一条 commit 是当前 main 的 HEAD

如果 working tree 不干净，先 commit 或 stash 再继续。

- [ ] **Step 2：确认 symlink 设置完好**

Run：
```bash
readlink ~/.claude/skills/harness-workflow
readlink ~/.claude/skills/strict-reviewer
```

Expected：两个都打印 `/Users/twelve/Pictures/myskills/<skill>`。缺失 → 跑 README.md 第二步的 symlink loop 后再继续。

- [ ] **Step 3：确认 Node 22+ 和 npm 10+**

Run：
```bash
node --version
npm --version
```

Expected：Node v22.x（或更高）、npm 10.x（或更高）。低于则 `brew upgrade node`。

- [ ] **Step 4：确认 packages/ 不存在或已是完整骨架（回应 R3 NEW4）**

Run：
```bash
if [ ! -d packages/ ]; then
  echo "OK: packages/ 不存在（首次 monorepo 化，走 R1 Task 1 完整路径）"
else
  # 三件套校验：存在就必须完整
  ROOT_WORKSPACES=$(node -e 'console.log(require("./package.json").workspaces || "")' 2>/dev/null)
  CLI_PKG=$(cat packages/harness-cli/package.json 2>/dev/null | head -5)
  CLI_TSC=$(cat packages/harness-cli/tsconfig.json 2>/dev/null | head -3)
  if [ -n "$ROOT_WORKSPACES" ] && [ -n "$CLI_PKG" ] && [ -n "$CLI_TSC" ]; then
    echo "OK: packages/ 三件套完整（跳过 R1/T1 初始化）"
  else
    echo "ABORT: packages/ 存在但三件套不全（package.json workspaces=$ROOT_WORKSPACES / cli package.json=${CLI_PKG:-MISSING} / tsconfig=${CLI_TSC:-MISSING}）—— 半成品 monorepo，不能跳过 R1/T1；先清理再重试"
    exit 1
  fi
fi
```

Expected：
- 空仓库 → `OK: packages/ 不存在`
- 已完整 init → `OK: packages/ 三件套完整`
- 半成品 → `ABORT: packages/ 存在但三件套不全 ...`（必须手工清理）

**不允许**仅凭"目录存在"跳过 R1/T1（会把半成品当已完成骨架，后续 Round 建立在坏基线上）。

- [ ] **Step 5：确认后续 Round 会创建的 skill 目录当前不存在（回应 Codex F2 Grounding 硬门）**

后续 Round 会创建 6 个新 skill 目录，当前都**不应该存在**（否则说明仓库状态漂移）：

Run：
```bash
for d in profile-entry harness-common harness-quick harness-bugfix harness-feature harness-refactor; do
  [ -d "$d" ] && echo "EXISTS: $d（异常，停止）" || echo "OK: $d 不存在"
done
```

Expected：全 6 行都是 `OK: <name> 不存在`。有任何 `EXISTS` → 停止，调查哪个历史 commit 创建了这些目录。

**目录创建映射**（Grounding 证明 —— 每个后续 Round 引用这些目录前，确认创建 Round 先于消费 Round；回应 R3 NEW1 + F2 补齐 company-* 映射）：

| 目录 | 首次创建 Round | 消费 Round |
|------|--------------|----------|
| `packages/harness-cli/` | R1 Task 1 | R2-R12 |
| `harness-workflow/archive/pre-reshape-backup.md` | R6 Task 1（备份原 skill.md）| R8, R9 |
| `profile-entry/` | R7 Task 1 | R8, R9 |
| `harness-common/` | R7 Task 4 | R8, R9, R10 |
| `harness-quick/` | R8 Task 1 | R11 team-init v1（决策树引用） |
| `harness-bugfix/` | R8 Task 2 | R11 |
| `harness-feature/` | R9 Task 1 | R10, R11, R12 overlay |
| `harness-refactor/` | R9 Task 2 | R11 |
| `packages/harness-cli/resources/presets/company-mt/` | R12 Task 1 | R12 整体 |
| `packages/harness-cli/resources/presets/company-mt/skills/company-quick/` | R12 Task 3 | R12 Task 8 E2E smoke |
| `packages/harness-cli/resources/presets/company-mt/skills/company-bugfix/` | R12 Task 4 | R12 Task 8 |
| `packages/harness-cli/resources/presets/company-mt/skills/company-feature/` | R12 Task 5 | R12 Task 8 + R12/T7 Java seed |
| `packages/harness-cli/resources/presets/company-mt/skills/company-refactor/` | R12 Task 6 | R12 Task 8 |
| `packages/harness-cli/resources/presets/company-mt/references/` | R12 Task 7 | R12 Task 8 |
| `team-init/archive/v0-backup.md` | R11 Task 1（备份 v0）| 历史归档，无消费方 |
| `.claude/skills/*`（项目级投放） | R3 Task 5（`harness init` 执行时）| R12 company overlay 追加 |

**不另外创建的 skill 目录**（现有 15 个保留不动，见 spec 附录 C）：
`harness-workflow/` `strict-reviewer/` `team-init/`（内容优化不新建目录）`team-pd/` `team-architect/` `team-senior-dev/` `team-junior-dev/` `team-qa/` `team-security/` `team-commander/` `task-dispatcher/` `investigate/` `office-hours/` `gstack/`

- [ ] **Step 6：确认已有 skill 目录都还在（Coverage 验证，回应 R3 Coverage 口径统一）**

**Coverage 口径单一真源 = spec 附录 C**（myskills 仓库本地 14 个 skill + 独立 Java 生态 3 个外部 skill = 17 项；其中 14 本地目录是本步骤要验证的）。

Run：
```bash
for d in harness-workflow strict-reviewer team-init team-pd team-architect team-senior-dev team-junior-dev team-qa team-security team-commander task-dispatcher investigate office-hours gstack; do
  [ -d "$d" ] && echo "OK: $d" || echo "MISSING: $d（异常，停止）"
done
```

Expected：全 14 行都是 `OK: <name>`（14 = spec 附录 C 的本地 skill 数）。任何 `MISSING` → 停止，说明用户环境异常（可能未 clone 完全或误删）。

**关于 15 vs 14 vs 13 的口径**：
- spec 附录 C 共 15 行表格 —— 其中第 15 行是"（独立 Java 生态，本仓库外）`meituan-java-standards` / `java-backend-i18n-refactor` / `costasset-i18n-phase2`"，**合并成一行列 3 个外部 skill**（因为它们不在 myskills 本地，行为是"保持独立 invoke"，合计一行说明方便对外传递）
- plan Step 6 校验 **14 个本地目录**（= 附录 C 前 14 行，每行 1 个本地 skill）
- plan Goal 说**"现有 skill 保留/扩展/改造清单的单一真源 = spec 附录 C"**（不再写"13 / 14 / 15 个"数字），避免口径漂

---

# Round 1：单一真源类型 + JSON Schema + doc-gen 脚手架

**Goal**：在 `packages/harness-cli/` 起 TypeScript npm 包骨架，定义全部 canonical types（`RuleStatus` / `ReviewTarget` / `HardFloorAction` / `FastPathRule` / `ViolationTest` / `ConflictResolution` / `ManagedFileRecord`），与之一一对应的 JSON Schema，以及 `generate-doc-fragments.ts` 的可运行版本。

**DoD**：
- `cd packages/harness-cli && npm run build` 成功
- `npm run test` 通过（至少覆盖 types ↔ JSON Schema round-trip）
- `npm run generate` 把 types 派生到一个 sample skill 里的 `<!-- @generated -->` 锚点
- CI 雏形：`npm run check` 跑 schema-compile + generated-fragments-clean 两关

**Stage 激活**（按 harness-workflow XL 级 Round 规则）：Stage 2（plan 在本文件里已有）→ Stage 3（实现）→ Stage 4（Spec 审查）→ Stage 5（codex 质量审查）→ Stage 8（收尾）

**Tasks**（6 个）：

## Round 1 / Task 1：初始化 monorepo + packages/harness-cli/ 骨架

**Files**：
- Create: `packages/harness-cli/package.json`
- Create: `packages/harness-cli/tsconfig.json`
- Create: `packages/harness-cli/.gitignore`
- Create: `packages/harness-cli/src/cli.ts`（占位，后续 Round 4 实现完整）
- Modify: `package.json`（项目根，加 `workspaces` 字段）或 `pnpm-workspace.yaml`

- [ ] **Step 1：检查根 package.json 是否存在**

Run：
```bash
cd /Users/twelve/Pictures/myskills
ls package.json 2>&1
```

Expected：若 `package.json` 存在 → 读它决定 monorepo 策略（workspaces vs pnpm vs yarn）；不存在 → 本 Task 的 Step 2 创建它。

- [ ] **Step 2：根 `package.json` 启用 npm workspaces**

如果根 `package.json` 不存在，Write：

```json
{
  "name": "myskills",
  "private": true,
  "version": "0.0.0",
  "workspaces": ["packages/*"],
  "engines": {
    "node": ">=22.0.0",
    "npm": ">=10.0.0"
  }
}
```

如果存在，用 Edit 加 `"workspaces": ["packages/*"]` 字段。

- [ ] **Step 3：创建 `packages/harness-cli/package.json`**

Write `packages/harness-cli/package.json`：

```json
{
  "name": "harness-workflow-cli",
  "version": "0.1.0",
  "description": "CLI for harness-workflow: init / adopt / maintain / doctor / scan",
  "bin": {
    "harness": "dist/cli.js"
  },
  "main": "dist/cli.js",
  "type": "module",
  "files": [
    "dist",
    "resources",
    "bundled-manifest.json",
    "README.md"
  ],
  "scripts": {
    "build": "tsc && node scripts/verify-resources.js",
    "dev": "tsc --watch",
    "generate": "tsx scripts/generate-doc-fragments.ts",
    "test": "node --experimental-vm-modules node_modules/.bin/jest",
    "check": "npm run build && npm run generate -- --check && npm run test"
  },
  "dependencies": {
    "ajv": "^8.12.0",
    "commander": "^11.0.0",
    "fs-extra": "^11.2.0",
    "globby": "^14.0.0",
    "yaml": "^2.3.0"
  },
  "devDependencies": {
    "@types/fs-extra": "^11.0.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^22.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

- [ ] **Step 4：创建 `tsconfig.json`**

Write `packages/harness-cli/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 5：创建 cli.ts 占位**

Write `packages/harness-cli/src/cli.ts`：

```typescript
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('harness')
  .description('Harness workflow CLI')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize harness in a new project')
  .action(() => {
    console.log('TODO: implemented in Round 3');
    process.exit(1);
  });

program.parse();
```

- [ ] **Step 6：创建 `.gitignore`**

Write `packages/harness-cli/.gitignore`：

```
node_modules
dist
*.log
.DS_Store
```

- [ ] **Step 7：首次 install 验证**

Run：
```bash
cd /Users/twelve/Pictures/myskills
npm install
cd packages/harness-cli
npm run build
```

Expected：`dist/cli.js` 存在，exit 0。

- [ ] **Step 8：Commit**

Run：
```bash
cd /Users/twelve/Pictures/myskills
git add package.json packages/harness-cli/
git commit -m "feat(harness-cli): scaffold npm package skeleton in packages/harness-cli"
```

---

## Round 1 / Task 2：定义 `src/types/knowledge.ts`

**Files**：Create `packages/harness-cli/src/types/knowledge.ts`

- [ ] **Step 1：写失败测试 `tests/types/knowledge.test.ts`**

Write `packages/harness-cli/tests/types/knowledge.test.ts`：

```typescript
import { RuleStatus, ManifestStatus, ViolationTest, RetrievalOutcome } from '../../src/types/knowledge.js';

describe('knowledge canonical types', () => {
  it('RuleStatus has exactly 4 values', () => {
    const allStatuses: RuleStatus[] = ['active', 'expired', 'drifted', 'superseded'];
    expect(allStatuses).toHaveLength(4);
  });

  it('ViolationTest has exactly 7 values', () => {
    const all: ViolationTest[] = [
      'must_use_wrapper',
      'must_call_component',
      'must_not_throw_raw_exception',
      'must_use_package',
      'must_not_use_pattern',
      'must_annotate_with',
      'free_form_review',
    ];
    expect(all).toHaveLength(7);
  });

  it('RetrievalOutcome has 3 values', () => {
    const all: RetrievalOutcome[] = ['success', 'coordinator_miss', 'all_candidates_filtered'];
    expect(all).toHaveLength(3);
  });

  it('ManifestStatus accepts superseded_by prefix', () => {
    const s: ManifestStatus = 'superseded_by:docs/harness/knowledge/style-and-structure/manifest.md';
    expect(s.startsWith('superseded_by:')).toBe(true);
  });
});
```

- [ ] **Step 2：跑测试确认 FAIL（types 不存在）**

Run：
```bash
cd packages/harness-cli
npm run test -- tests/types/knowledge.test.ts
```

Expected：FAIL with "Cannot find module '../../src/types/knowledge.js'"

- [ ] **Step 3：实现 `src/types/knowledge.ts`**

Write `packages/harness-cli/src/types/knowledge.ts`：

```typescript
// Canonical source of truth for knowledge domain types.
// DO NOT duplicate these definitions in skill markdown or reviewer contracts.
// Skill prose must use <!-- @generated:xxx --> anchors; doc-gen replaces them.

export type RuleStatus = 'active' | 'expired' | 'drifted' | 'superseded';

export type ManifestStatus = 'active' | 'partial' | 'drifted' | `superseded_by:${string}`;

export type RetrievalOutcome = 'success' | 'coordinator_miss' | 'all_candidates_filtered';

export type ViolationTest =
  | 'must_use_wrapper'
  | 'must_call_component'
  | 'must_not_throw_raw_exception'
  | 'must_use_package'
  | 'must_not_use_pattern'
  | 'must_annotate_with'
  | 'free_form_review';

export interface KnowledgeRequirement {
  rule_id: string;
  manifest_file: string;
  applies_to: string[];
  requirement_text: string;
  violation_test: ViolationTest;
  [extraField: string]: unknown;
}

export interface AdvisoryKnowledge {
  source: 'user_override' | 'expired_rule';
  id: string;
  domain: string;
  text: string;
  weight: 'advisory';
}

export interface KnownIssue {
  source: 'drifted_rule' | 'superseded_rule' | 'filtered_manifest';
  id: string;
  domain: string;
  reason: string;
}

export interface KnowledgeCheck {
  effective_index_status: 'active' | 'stale' | 'drifted' | 'disabled';
  snapshot_id: string | null;
  retrieval_outcome: RetrievalOutcome;
  filtered_candidates: Array<{ manifest: string; reason: string }>;
  known_issues: KnownIssue[];
  relevant_knowledge_files: string[];
  advisory_knowledge: AdvisoryKnowledge[];
  knowledge_requirements: KnowledgeRequirement[];
}
```

- [ ] **Step 4：跑测试确认 PASS**

Run：
```bash
cd packages/harness-cli
npm run test -- tests/types/knowledge.test.ts
```

Expected：PASS（4 tests）。

- [ ] **Step 5：Commit**

Run：
```bash
cd /Users/twelve/Pictures/myskills
git add packages/harness-cli/src/types/knowledge.ts packages/harness-cli/tests/types/knowledge.test.ts
git commit -m "feat(harness-cli): canonical types for knowledge (RuleStatus/ViolationTest/etc)"
```

---

## Round 1 / Task 3：定义 `src/types/review-target.ts` + `review-target.schema.json`

**Files**：
- Create: `packages/harness-cli/src/types/review-target.ts`
- Create: `packages/harness-cli/resources/schemas/review-target.schema.json`
- Create: `packages/harness-cli/tests/types/review-target.test.ts`

- [ ] **Step 1：写失败测试（types + schema round-trip）**

Write `packages/harness-cli/tests/types/review-target.test.ts`：

```typescript
import Ajv from 'ajv';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ReviewTarget } from '../../src/types/review-target.js';

describe('ReviewTarget canonical schema', () => {
  const ajv = new Ajv({ allErrors: true });
  const schema = fs.readJsonSync(path.join(__dirname, '../../resources/schemas/review-target.schema.json'));
  const validate = ajv.compile(schema);

  it('minimal ReviewTarget validates', () => {
    const rt: ReviewTarget = {
      changed_files: ['src/foo.ts'],
      diff_summary: 'one file touched',
      stage: 'quality',
    };
    expect(validate(rt)).toBe(true);
  });

  it('full ReviewTarget with knowledge fields validates', () => {
    const rt: ReviewTarget = {
      changed_files: ['src/foo.ts'],
      diff_summary: 'one file touched',
      stage: 'quality',
      relevant_knowledge_files: ['docs/harness/knowledge/style-and-structure/manifest.md'],
      knowledge_snapshot_id: 'scan-2026-04-24T10:00Z',
      retrieval_outcome: 'success',
      known_issues: [],
      knowledge_requirements: [
        {
          rule_id: 'style-and-structure/rule-1',
          manifest_file: 'docs/harness/knowledge/style-and-structure/manifest.md',
          applies_to: ['src/**'],
          requirement_text: 'services return Result<T>',
          violation_test: 'must_use_wrapper',
        },
      ],
    };
    expect(validate(rt)).toBe(true);
  });

  it('invalid stage is rejected', () => {
    const rt = {
      changed_files: ['src/foo.ts'],
      diff_summary: 'x',
      stage: 'unknown',
    };
    expect(validate(rt)).toBe(false);
  });
});
```

- [ ] **Step 2：跑测试确认 FAIL**

Run：`cd packages/harness-cli && npm run test -- tests/types/review-target.test.ts`
Expected：FAIL（模块或 schema 文件不存在）

- [ ] **Step 3：实现 `src/types/review-target.ts`**

Write `packages/harness-cli/src/types/review-target.ts`：

```typescript
import type { KnowledgeRequirement, KnownIssue, RetrievalOutcome } from './knowledge.js';

export type ReviewStage = 'qa' | 'security' | 'spec' | 'quality';

export interface ReviewTarget {
  changed_files: string[];
  diff_summary: string;
  stage: ReviewStage;
  claims_to_verify?: string[];
  memory_cases?: Array<Record<string, unknown>>;
  prior_verdict?: Record<string, unknown> | null;

  // Knowledge scanner integration (Spec 1)
  relevant_knowledge_files?: string[];
  knowledge_snapshot_id?: string | null;
  knowledge_requirements?: KnowledgeRequirement[];
  retrieval_outcome?: RetrievalOutcome;
  known_issues?: KnownIssue[];
}
```

- [ ] **Step 4：实现 JSON Schema**

Write `packages/harness-cli/resources/schemas/review-target.schema.json`：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "harness-workflow-cli/review-target.schema.json",
  "title": "ReviewTarget",
  "type": "object",
  "required": ["changed_files", "diff_summary", "stage"],
  "properties": {
    "changed_files": { "type": "array", "items": { "type": "string" } },
    "diff_summary": { "type": "string" },
    "stage": { "enum": ["qa", "security", "spec", "quality"] },
    "claims_to_verify": { "type": "array", "items": { "type": "string" } },
    "memory_cases": { "type": "array", "items": { "type": "object" } },
    "prior_verdict": { "type": ["object", "null"] },
    "relevant_knowledge_files": { "type": "array", "items": { "type": "string" } },
    "knowledge_snapshot_id": { "type": ["string", "null"] },
    "knowledge_requirements": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["rule_id", "manifest_file", "applies_to", "requirement_text", "violation_test"],
        "properties": {
          "rule_id": { "type": "string" },
          "manifest_file": { "type": "string" },
          "applies_to": { "type": "array", "items": { "type": "string" } },
          "requirement_text": { "type": "string" },
          "violation_test": {
            "enum": [
              "must_use_wrapper",
              "must_call_component",
              "must_not_throw_raw_exception",
              "must_use_package",
              "must_not_use_pattern",
              "must_annotate_with",
              "free_form_review"
            ]
          }
        }
      }
    },
    "retrieval_outcome": {
      "enum": ["success", "coordinator_miss", "all_candidates_filtered"]
    },
    "known_issues": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["source", "id", "domain", "reason"],
        "properties": {
          "source": { "enum": ["drifted_rule", "superseded_rule", "filtered_manifest"] },
          "id": { "type": "string" },
          "domain": { "type": "string" },
          "reason": { "type": "string" }
        }
      }
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 5：跑测试确认 PASS**

Run：`cd packages/harness-cli && npm run test -- tests/types/review-target.test.ts`
Expected：PASS（3 tests）

- [ ] **Step 6：Commit**

Run：
```bash
git add packages/harness-cli/src/types/review-target.ts \
        packages/harness-cli/resources/schemas/review-target.schema.json \
        packages/harness-cli/tests/types/review-target.test.ts
git commit -m "feat(harness-cli): review_target canonical types + JSON Schema (Spec 1 + Round 11 fix)"
```

---

## Round 1 / Task 4：定义 `src/types/profile.ts` + `profile.schema.json`

**Files**：
- Create: `packages/harness-cli/src/types/profile.ts`
- Create: `packages/harness-cli/resources/schemas/profile.schema.json`
- Create: `packages/harness-cli/tests/types/profile.test.ts`

- [ ] **Step 1：写失败测试**

Write `tests/types/profile.test.ts`：

```typescript
import Ajv from 'ajv';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Profile, HardFloorAction } from '../../src/types/profile.js';

describe('Profile canonical schema', () => {
  const ajv = new Ajv({ allErrors: true });
  const schema = fs.readJsonSync(path.join(__dirname, '../../resources/schemas/profile.schema.json'));
  const validate = ajv.compile(schema);

  it('HardFloorAction has 6 values', () => {
    const all: HardFloorAction[] = [
      'auto_push',
      'force_push',
      'destructive_ops',
      'auto_merge',
      'rewrite_history',
      'network_install',
    ];
    expect(all).toHaveLength(6);
  });

  it('minimal personal profile validates', () => {
    const p: Profile = {
      name: 'harness',
      description: 'Personal',
      detection: { priority: 10, matchers: [{ type: 'path_glob', pattern: '~/**' }] },
      entry_skill: 'profile-entry',
      task_types: { quick: 'harness-quick', bugfix: 'harness-bugfix', feature: 'harness-feature', refactor: 'harness-refactor' },
      default_mode: 'standard',
      hard_floor: [],
    };
    expect(validate(p)).toBe(true);
  });

  it('company-mt profile with full hard_floor validates', () => {
    const p: Profile = {
      name: 'company-mt',
      description: 'Meituan enterprise',
      detection: { priority: 30, matchers: [{ type: 'file_exists', pattern: 'pom.xml' }] },
      entry_skill: 'profile-entry',
      task_types: { quick: 'company-quick', bugfix: 'company-bugfix', feature: 'company-feature', refactor: 'company-refactor' },
      default_mode: 'conservative',
      hard_floor: ['auto_push', 'force_push', 'destructive_ops', 'auto_merge', 'rewrite_history', 'network_install'],
    };
    expect(validate(p)).toBe(true);
  });

  it('unknown hard_floor action rejected', () => {
    const p = {
      name: 'bad',
      description: 'x',
      detection: { priority: 1, matchers: [] },
      entry_skill: 'profile-entry',
      task_types: { quick: 'x', bugfix: 'x', feature: 'x', refactor: 'x' },
      default_mode: 'standard',
      hard_floor: ['nope_not_a_real_action'],
    };
    expect(validate(p)).toBe(false);
  });
});
```

- [ ] **Step 2：跑测试确认 FAIL**

Run：`npm run test -- tests/types/profile.test.ts`
Expected：FAIL

- [ ] **Step 3：实现 `src/types/profile.ts`**

Write `packages/harness-cli/src/types/profile.ts`：

```typescript
export type HardFloorAction =
  | 'auto_push'
  | 'force_push'
  | 'destructive_ops'
  | 'auto_merge'
  | 'rewrite_history'
  | 'network_install';

export type AggressionMode = 'conservative' | 'standard' | 'aggressive';

export type MatcherType = 'path_glob' | 'git_remote_regex' | 'file_exists';

export interface Matcher {
  type: MatcherType;
  pattern: string;
}

export interface Detection {
  priority: number;
  matchers: Matcher[];
}

export interface TaskTypes {
  quick: string;
  bugfix: string;
  feature: string;
  refactor: string;
}

export interface FastPathRule {
  extensions: string[];
  forbidden_patterns: string[];
  forbidden_files: string[];
  max_changed_files: number;
  max_diff_lines: number;
}

export interface RepoConventions {
  language?: string;
  build_files?: string[];
  package_roots?: string[];
  test_gate?: {
    require_unit_test_for_backend_change?: boolean;
    prefer_module_scoped_command?: boolean;
  };
  review_style?: {
    verdict_first?: boolean;
    file_line_grounding_required?: boolean;
    no_speculation?: boolean;
  };
  memory_layout?: {
    knowledge_root?: string;
    memory_root?: string;
    learnings_root?: string;
  };
  i18n_defaults?: {
    backend_skill?: string;
    repo_specific_phase2_skill?: string;
  };
}

export interface ComplianceHooks {
  preflight?: string[];
  required_checks?: string[];
  blocked_when?: string[];
}

export interface Profile {
  name: string;
  description: string;
  detection: Detection;
  entry_skill: 'profile-entry';
  task_types: TaskTypes;
  default_mode: AggressionMode;
  hard_floor: HardFloorAction[];
  repo_conventions?: RepoConventions;
  compliance_hooks?: ComplianceHooks;
}
```

- [ ] **Step 4：实现 schema**

Write `packages/harness-cli/resources/schemas/profile.schema.json`：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "harness-workflow-cli/profile.schema.json",
  "title": "Profile",
  "type": "object",
  "required": ["name", "description", "detection", "entry_skill", "task_types", "default_mode", "hard_floor"],
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "detection": {
      "type": "object",
      "required": ["priority", "matchers"],
      "properties": {
        "priority": { "type": "integer", "minimum": 0 },
        "matchers": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["type", "pattern"],
            "properties": {
              "type": { "enum": ["path_glob", "git_remote_regex", "file_exists"] },
              "pattern": { "type": "string" }
            }
          }
        }
      }
    },
    "entry_skill": { "const": "profile-entry" },
    "task_types": {
      "type": "object",
      "required": ["quick", "bugfix", "feature", "refactor"],
      "properties": {
        "quick": { "type": "string" },
        "bugfix": { "type": "string" },
        "feature": { "type": "string" },
        "refactor": { "type": "string" }
      }
    },
    "default_mode": { "enum": ["conservative", "standard", "aggressive"] },
    "hard_floor": {
      "type": "array",
      "items": {
        "enum": ["auto_push", "force_push", "destructive_ops", "auto_merge", "rewrite_history", "network_install"]
      },
      "uniqueItems": true
    },
    "repo_conventions": { "type": "object" },
    "compliance_hooks": { "type": "object" }
  }
}
```

- [ ] **Step 5：跑测试确认 PASS**

Run：`npm run test -- tests/types/profile.test.ts`
Expected：PASS（4 tests）

- [ ] **Step 6：Commit**

Run：
```bash
git add packages/harness-cli/src/types/profile.ts \
        packages/harness-cli/resources/schemas/profile.schema.json \
        packages/harness-cli/tests/types/profile.test.ts
git commit -m "feat(harness-cli): Profile canonical types + JSON Schema with HardFloorAction enum"
```

---

## Round 1 / Task 5：定义 `src/types/managed-file.ts` + `managed-file.schema.json`

**Files**：
- Create: `packages/harness-cli/src/types/managed-file.ts`
- Create: `packages/harness-cli/resources/schemas/managed-file.schema.json`
- Create: `packages/harness-cli/tests/types/managed-file.test.ts`

- [ ] **Step 1：写失败测试**

Write `tests/types/managed-file.test.ts`：

```typescript
import Ajv from 'ajv';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ManagedFileRecord, ManagedFilesState, ConflictResolution } from '../../src/types/managed-file.js';

describe('ManagedFile canonical schema', () => {
  const ajv = new Ajv({ allErrors: true });
  const schema = fs.readJsonSync(path.join(__dirname, '../../resources/schemas/managed-file.schema.json'));
  const validate = ajv.compile(schema);

  it('ConflictResolution has 4 values', () => {
    const all: ConflictResolution[] = ['unchanged', 'update-available', 'user-modified', 'conflict'];
    expect(all).toHaveLength(4);
  });

  it('valid ManagedFilesState validates', () => {
    const state: ManagedFilesState = {
      schemaVersion: 1,
      managedFiles: [
        {
          path: 'CLAUDE.md',
          category: 'agents',
          strategy: 'generated',
          sourceHash: 'abc123',
          targetHash: 'abc123',
          lastSyncedAt: '2026-04-24T10:00:00Z',
        },
      ],
    };
    expect(validate(state)).toBe(true);
  });

  it('missing sourceHash rejected', () => {
    const bad = {
      schemaVersion: 1,
      managedFiles: [{ path: 'x', category: 'agents', strategy: 'copy', targetHash: 'y', lastSyncedAt: 'now' }],
    };
    expect(validate(bad)).toBe(false);
  });
});
```

- [ ] **Step 2：跑测试确认 FAIL**

Run：`npm run test -- tests/types/managed-file.test.ts`
Expected：FAIL

- [ ] **Step 3：实现 types**

Write `packages/harness-cli/src/types/managed-file.ts`：

```typescript
export type ManagedCategory =
  | 'agents'
  | 'config'
  | 'docs'
  | 'plans'
  | 'skills'
  | 'knowledge'
  | 'memory'
  | 'learnings';

export type ManagedStrategy = 'copy' | 'generated' | 'overlay';

export type ConflictResolution = 'unchanged' | 'update-available' | 'user-modified' | 'conflict';

export interface ManagedFileRecord {
  path: string;
  category: ManagedCategory;
  strategy: ManagedStrategy;
  sourceHash: string;
  targetHash: string;
  lastSyncedAt: string;
}

export interface ManagedFilesState {
  schemaVersion: 1;
  managedFiles: ManagedFileRecord[];
}
```

- [ ] **Step 4：实现 schema**

Write `packages/harness-cli/resources/schemas/managed-file.schema.json`：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "harness-workflow-cli/managed-file.schema.json",
  "title": "ManagedFilesState",
  "type": "object",
  "required": ["schemaVersion", "managedFiles"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "managedFiles": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "category", "strategy", "sourceHash", "targetHash", "lastSyncedAt"],
        "properties": {
          "path": { "type": "string", "minLength": 1 },
          "category": {
            "enum": ["agents", "config", "docs", "plans", "skills", "knowledge", "memory", "learnings"]
          },
          "strategy": { "enum": ["copy", "generated", "overlay"] },
          "sourceHash": { "type": "string", "minLength": 1 },
          "targetHash": { "type": "string", "minLength": 1 },
          "lastSyncedAt": { "type": "string", "format": "date-time" }
        }
      }
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 5：跑测试 PASS**

Run：`npm run test -- tests/types/managed-file.test.ts`
Expected：PASS（3 tests）

- [ ] **Step 6：Commit**

Run：
```bash
git add packages/harness-cli/src/types/managed-file.ts \
        packages/harness-cli/resources/schemas/managed-file.schema.json \
        packages/harness-cli/tests/types/managed-file.test.ts
git commit -m "feat(harness-cli): ManagedFileRecord canonical types + schema (four-state)"
```

---

## Round 1 / Task 6：`generate-doc-fragments.ts` 脚本 + sample skill 锚点测试

**Files**：
- Create: `packages/harness-cli/scripts/generate-doc-fragments.ts`
- Create: `packages/harness-cli/resources/skills/_sample/SAMPLE.md`
- Create: `packages/harness-cli/tests/scripts/generate-doc-fragments.test.ts`

- [ ] **Step 1：写 sample skill 含 `@generated` 锚点**

Write `packages/harness-cli/resources/skills/_sample/SAMPLE.md`：

```markdown
# Sample Skill（用于测试 doc-gen，不真投放）

## 规则状态枚举

<!-- @generated:rule-status -->
placeholder — 将被 doc-gen 覆盖
<!-- @/generated -->

## HardFloor 动作

<!-- @generated:hard-floor-actions -->
placeholder
<!-- @/generated -->
```

- [ ] **Step 2：写失败测试**

Write `tests/scripts/generate-doc-fragments.test.ts`：

```typescript
import { spawnSync } from 'node:child_process';
import * as fs from 'fs-extra';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../..');
const SAMPLE = path.join(REPO, 'resources/skills/_sample/SAMPLE.md');

describe('generate-doc-fragments', () => {
  let original: string;

  beforeAll(() => {
    original = fs.readFileSync(SAMPLE, 'utf8');
  });

  afterAll(() => {
    fs.writeFileSync(SAMPLE, original);
  });

  it('replaces @generated:rule-status anchor with canonical values', () => {
    const r = spawnSync('tsx', ['scripts/generate-doc-fragments.ts'], {
      cwd: REPO, encoding: 'utf8',
    });
    expect(r.status).toBe(0);

    const content = fs.readFileSync(SAMPLE, 'utf8');
    expect(content).toMatch(/active.*expired.*drifted.*superseded/s);
    expect(content).toMatch(/auto_push.*force_push.*destructive_ops/s);
  });

  it('--check mode exits 1 when diff exists', () => {
    fs.writeFileSync(SAMPLE, original);
    const r = spawnSync('tsx', ['scripts/generate-doc-fragments.ts', '--check'], {
      cwd: REPO, encoding: 'utf8',
    });
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/out of date|diff/i);
  });

  it('unknown @generated key throws', () => {
    fs.writeFileSync(SAMPLE, '<!-- @generated:unknown-key -->\nx\n<!-- @/generated -->\n');
    const r = spawnSync('tsx', ['scripts/generate-doc-fragments.ts'], {
      cwd: REPO, encoding: 'utf8',
    });
    expect(r.status).not.toBe(0);
    fs.writeFileSync(SAMPLE, original);
  });
});
```

- [ ] **Step 3：跑测试 FAIL**

Run：`npm run test -- tests/scripts/generate-doc-fragments.test.ts`
Expected：FAIL（脚本不存在）

- [ ] **Step 4：实现 `scripts/generate-doc-fragments.ts`**

Write `packages/harness-cli/scripts/generate-doc-fragments.ts`：

```typescript
#!/usr/bin/env tsx
// Derive <!-- @generated:<key> --> ... <!-- @/generated --> blocks
// in skill markdown from canonical TypeScript types.

import * as fs from 'fs-extra';
import * as path from 'path';
import { globby } from 'globby';

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
  // 未来新增 key 加在这里；未注册 key 会在下面 process() 时抛错
};

interface Opts { check: boolean; }

function parseArgs(argv: string[]): Opts {
  return { check: argv.includes('--check') };
}

async function process(opts: Opts): Promise<number> {
  const files = await globby(['resources/skills/**/*.md', 'resources/skills/**/*.SKILL.md'], {
    cwd: REPO,
    absolute: true,
  });

  let hasDiff = false;
  const errors: string[] = [];

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const replaced = original.replace(ANCHOR_RE, (_match, key: string) => {
      const gen = REGISTRY[key];
      if (!gen) {
        errors.push(`${file}: unknown @generated key "${key}"`);
        return _match;
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
    errors.forEach(e => console.error(e));
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

process(parseArgs(process.argv.slice(2))).then(code => process.exit(code));
```

- [ ] **Step 5：跑测试 PASS**

Run：`npm run test -- tests/scripts/generate-doc-fragments.test.ts`
Expected：PASS（3 tests）

- [ ] **Step 6：跑一次 generate 验证 sample skill 被正确替换**

Run：
```bash
cd packages/harness-cli
npm run generate
cat resources/skills/_sample/SAMPLE.md
```

Expected：两个锚点块内容都被替换成真实枚举项。

- [ ] **Step 7：Commit**

Run：
```bash
git add packages/harness-cli/scripts/ \
        packages/harness-cli/resources/skills/_sample/ \
        packages/harness-cli/tests/scripts/
git commit -m "feat(harness-cli): generate-doc-fragments script + sample skill canonical anchors"
```

---

## Round 1 DoD 验证

- [ ] `npm run build` 成功
- [ ] `npm run test` 通过（至少 13 tests：types 4+3+4+3 = 14 + doc-gen 3 = 17）
- [ ] `npm run generate` exit 0 且 sample skill 被正确替换
- [ ] `npm run generate -- --check` exit 0（clean）或 exit 1（有 diff）
- [ ] `npm run check` exit 0
- [ ] 所有 commit 走 Conventional Commits 格式

---

# Round 2：`ManagedFileRecord` 落盘 + profile loader（T2 + T3 并行）

**Goal**：实现 `.harness/managed-files.json` 落盘与四态比对，以及 `~/.claude/profiles/*.yml` + `.harness-profile` 的加载 / 校验 / 冲突行为。

**DoD**：
- `src/utils/managed-files.ts` 可读写 `.harness/managed-files.json`
- 四态比对算法（unchanged / update-available / user-modified / conflict / missing）有测试覆盖
- `src/utils/profile.ts` 可加载 `~/.claude/profiles/*.yml`，priority + specificity tie-break 实现
- `src/utils/hash.ts` 提供 SHA-256 工具
- conflict 行为：personal 写 `.rej`，company-mt 整批 BLOCK（单测）

**Tasks**（6 个）：

| ID | 标题 | 依赖 |
|----|------|------|
| R2/T1 | `utils/hash.ts` + 单测（SHA-256） | Round 1 完成 |
| R2/T2 | `utils/managed-files.ts` 读写 + schema 校验 | R2/T1 |
| R2/T3 | managed-files 四态比对算法 + fixture 矩阵测试 | R2/T2 |
| R2/T4 | `utils/profile.ts` 加载 `~/.claude/profiles/*.yml` + matcher 解析 | R2/T1 |
| R2/T5 | `.harness-profile` marker 生成 / 校验 + tie-break 规则 | R2/T4 |
| R2/T6 | conflict 行为（personal `.rej` vs company BLOCK）+ 跨 profile 测试 | R2/T3, R2/T5 |

**sub-plan 契约**（回应 Claude 自审 C2 + AD1）：
- R2/T3 sub-plan 必须展开**完整 8 组合 fixture 矩阵**（source × target × bundled 三 hash 的 2³ = 8 组合），每行含 `source_hash` / `target_hash` / `bundled_hash` / `expected_state` / `expected_action` 五列，覆盖所有四态（unchanged / update-available / user-modified / conflict）+ missing 退化态
- R2/T3 测试 fixture 必须包含"bundled 缺失但 target 存在"的边界态（正常 materialize 后 bundled 一定存在，但 adopt 场景可能遇到）
- **AD1 早期 CI 前置**：R1 Task 3 的 JSON Schema 完成后，立即在 Round 2 加 **`review-target-fixtures` fixture（不等 Round 5）**—— R2/T2 完成时同步起一套最小 review_target fixture，保证 R2-R4 期间 review_target schema 有 CI 保护；Round 5 T7 只补"全 stage × 全字段组合"完整版

**关键测试**：
- managed-files state 读写 round-trip
- 四态矩阵全组合 fixture（source × target × bundled 的 2³ = 8 组合）
- profile priority tie-break fixture（3 profile 同时命中）
- `--agent-type claude` 路径重写
- `company-mt` 冲突整批 BLOCK 测试

---

# Round 3：CLI 前半（`init` + `adopt` + `detect` + `template` + `materialize`）

**Goal**：实现 `harness init` / `harness adopt` 两个命令 + 相关工具。`init` 走完整 flow，`adopt` 走 ManagedFile 检测 only 补缺失。

**DoD**：
- 空目录运行 `harness init --preset personal` 产出完整项目级文件树（.harness-profile / harness.config.json / .harness/ / docs/memory/ / docs/harness/knowledge/ / CLAUDE.md / .claude/skills/）
- 已有项目运行 `harness adopt` 只补缺失文件，不覆盖用户改动
- `--force` 能覆盖 conflict（personal），company-mt 仍 BLOCK
- `detect.ts` 支持 package.json / pom.xml / go.mod / Cargo.toml / pyproject.toml 五类
- `template.ts` 占位符替换（`{{project_name}}` / `{{tech_stack_oneliner}}` / `{{today}}`）
- E2E 测试：在临时目录跑 init，验证 15+ 产出文件存在 + 内容校验

**Tasks**（7 个）：

| ID | 标题 | 依赖 |
|----|------|------|
| R3/T1 | `utils/detect.ts` 项目类型探测 + fixture（5 类项目） | R1 完成 |
| R3/T2 | `utils/template.ts` 占位符替换 + 单测 | R1 完成 |
| R3/T3 | `utils/materialize.ts` resources → target 拷贝 + ManagedFile 注册 | R2 完成 |
| R3/T4 | `utils/agent-paths.ts` agent-type 抽象（只 claude）+ 路径重写 | R2 完成 |
| R3/T5 | `commands/init.ts` 完整 flow + E2E fixture | R3/T1-T4 |
| R3/T6 | `commands/adopt.ts` + conflict 检测 flow | R3/T5 |
| R3/T7 | 集成测试：临时 Java / Node 项目 init smoke | R3/T5, R3/T6 |

**关键测试**：
- 空目录 `harness init` 产出 15+ 文件，每个文件都在 managed-files.json 里
- 已有 CLAUDE.md 的项目跑 `adopt`，CLAUDE.md 的 `<!-- harness-knowledge:start -->` 块被追加而非覆盖
- `--preset company-mt` 时 ManagedFile conflict 整批 BLOCK
- `--agent-type claude` 时 skill 投到 `.claude/skills/`（未来加 codex 时此处扩展）

---

# Round 4：CLI 后半（`maintain` + `doctor` + `scan` 壳 + 完整命令连通）

**Goal**：实现 `harness maintain` / `harness doctor` / `harness scan` 三个命令。scan 不是壳 — CLI 自己 own 整个 5 领域 scanner pipeline（R3 A2 立场）。

**DoD**：
- `harness doctor --json` 输出 `{version, schema_version, installed_presets, managed_files_git_status, issues[]}`
- `harness doctor` 检测 `managed-files.json` 被 git track → 硬 fail
- `harness maintain` 输出漂移报告 + promotion 提醒（"可升格 learnings 待人工分类"）
- `harness maintain --upgrade` 按新 bundled 走四态升级，conflict 按 Profile 行为
- `harness scan` 跑完整 5 领域扫描 pipeline（scout → 并行 domain scan → codex contradiction → TODO 聚合 → halt）
- `harness scan --apply-answers` 处理 TODO.md 并 micro-rescan
- `harness scan --budget <min>` / `--domain <name>` 参数生效

**Tasks**（8 个）：

| ID | 标题 | 依赖 |
|----|------|------|
| R4/T1 | `commands/doctor.ts` 基础检查 + --json 输出 | R3 完成 |
| R4/T2 | `doctor` 检测 managed-files git 状态 + 会话 schema 版本哨兵 | R4/T1 |
| R4/T3 | `utils/learnings.ts` retention + promotion 检测 | R1 完成 |
| R4/T4 | `utils/memory.ts` memory 归档 + scorecard 处理 | R1 完成 |
| R4/T5 | `commands/maintain.ts` 漂移报告 + promotion 提醒 | R4/T3, R4/T4 |
| R4/T6 | `maintain --upgrade` 按新 bundled 升级 | R4/T5 |
| R4/T7 | `utils/scanner.ts` 5 领域 pipeline（复用 Spec 1 流程）+ `commands/scan.ts` | R3 完成 |
| R4/T8 | E2E：中型 Java repo `scan` 28 min 内完成 + TODO ≤ 8 条 | R4/T7 |

**关键测试**：
- `doctor` 对干净项目 / broken project / git-tracked managed-files 的三种响应
- `maintain --upgrade` 后 conflict 文件有 `.rej`
- `scan --domain style-and-structure` 只扫一个领域
- `scan` 超时后 manifest status 降级为 `partial`

---

# Round 5：`resources/templates/` 全集 + canonical doc fragments 全对齐

**Goal**：产出 `resources/templates/` 下四大类模板（memory / knowledge / learnings / root）+ 在所有 bundled skill 里埋 `<!-- @generated -->` 锚点并跑 `generate` 对齐。

**DoD**：
- `resources/templates/memory/` 含 `.harness-memory.yml.template` + `MEMORY.md.template` + `ERRORS.md.template` + `harness_reviewer_scorecard.yml.template` + 四子目录 README
- `resources/templates/knowledge/` 含 `INDEX.md.template` + `TODO.md.template` + 5 领域 × 3 文件模板 = 15 模板文件
- `resources/templates/learnings/` 含 `LEARNINGS.md.template` + `ERRORS.md.template` + `FEATURE_REQUESTS.md.template`
- `resources/templates/root/` 含 `AGENTS.md.template` + `CLAUDE.md.template` + `harness.config.json.template`
- `resources/skills/` 下所有 bundled skill 的 canonical 字段都走 `<!-- @generated -->` 锚点
- `npm run generate -- --check` exit 0（一切对齐）
- CI 加 `review-target-fixtures` / `fast-path-fixtures` / `knowledge-status-matrix` 三关

**Tasks**（11 个，R2 修复时加 T10/T11）：

| ID | 标题 | 依赖 |
|----|------|------|
| R5/T1 | `templates/memory/` 全集（复用 2026-04-22 已有模板）| R4 完成 |
| R5/T2 | `templates/knowledge/` INDEX / TODO 模板 | R4 完成 |
| R5/T3 | `templates/knowledge/` 5 领域 × 3 文件（manifest / evidence / gaps）模板 | R5/T2 |
| R5/T4 | `templates/learnings/` 三文件模板 + 复用 block 风格 | R4 完成 |
| R5/T5 | `templates/root/` CLAUDE.md 含两个 managed block（harness-knowledge + harness-profile） | R4 完成 |
| R5/T6 | `resources/skills/` 下所有 canonical 字段改 `@generated` 锚点 | R5/T1-T5 |
| R5/T7 | CI 添加 review-target-fixtures（全 stage × 全字段组合） | R1 完成 |
| R5/T8 | CI 添加 fast-path-fixtures（trivial / 结构化 diff 各 10 例） | R1 完成 |
| R5/T9 | CI 添加 knowledge-status-matrix（四态 × Stage-0.5 render × reviewer verdict）| R5/T7 |
| R5/T10 | **Phase→CLI crosscheck 表（回应 Claude C1 + R3 FAIL 单一落点）**—— **固定落点**：`harness-workflow/references/migration-checklist.md`（新增文件，不写 plan 尾部），逐条列出原 `harness-workflow/skill.md` 的 Phase 1-4 每个动作在哪个 CLI 命令 + 哪个 Task 里被实现；无遗漏 verdict 为通过；R6/T3 以此文件为复核单一来源 | R5/T5 |
| R5/T11 | **H4 版本锁定机制**—— `packages/harness-cli/resources/VERSION` 文件 + `scripts/verify-resources.ts` 校验 = `package.json.version`；bundled skill/template/schema 文件在 `bundled-manifest.json` 登记 resourcesVersion；CI 加一关 `resources-version-lock` | R5/T6 |

**sub-plan 契约**（回应 H3）：
- R5/T9 sub-plan 必须展开 **knowledge-status-matrix 骨架表**（至少 36 组合：RuleStatus 四态 × ManifestStatus 四态 × ReviewerVerdict 三种 = 48 组合，去掉不合理的约剩 36 个，每行含 expected Stage -0.5 render 行为 + expected reviewer verdict）。fixture 数据以 JSON 落在 `packages/harness-cli/tests/fixtures/knowledge-status-matrix/*.json`
- R5/T10 crosscheck 表至少覆盖 4 个 Phase × 每 Phase 平均 5 个动作 = 20 行条目

**关键测试**：
- `init` 跑完后 `CLAUDE.md` 的两个 managed block 都存在，用户自由区为空
- 5 领域每个 `manifest.md.template` 跑过 YAML frontmatter parse
- `generate --check` 在 CI 里 exit 0
- `resources-version-lock` CI：篡改 VERSION 文件后 CI 应 FAIL

---

# Round 6：`harness-workflow` 保名重塑为兼容 stub + 会话 schema 版本迁移

**Goal**：把现 `harness-workflow/skill.md`（14949 字节）重塑为 ≤100 行的 compatibility stub（草稿已在 spec 6.5 节）。内部 `Skill(profile-entry, {forced_profile: harness})` 调用，生命周期命令（--init / --adopt / --maintain / --doctor / --scan）passthrough 到 CLI。加会话 schema 版本哨兵 + migration subagent。

**DoD**：
- `harness-workflow/skill.md` ≤100 行，frontmatter 触发词不变
- 现有 CLAUDE.md 规则"开发任务走 harness-workflow" 无需改动即继续有效
- `.harness/current.json` 新增 `workflow_schema_version: "1.0.0"` 字段
- 跑 `harness doctor` 检测旧 current.json 时触发一次 migration
- 迁移未完成时 Stage 0 被 block

**Tasks**（6 个，R2 修复时加 T6）：

| ID | 标题 | 依赖 |
|----|------|------|
| R6/T1 | 备份现 `harness-workflow/skill.md` 到 `harness-workflow/archive/pre-reshape-backup.md` | R5 完成 |
| R6/T2 | 重写 `harness-workflow/skill.md` 为 compatibility stub（按 spec 6.5 草稿） | R6/T1 |
| R6/T3 | **Phase→CLI crosscheck 表**（回应 Claude 自审 C1 + Codex F1）—— 逐条列出原 Phase 1-4 每个动作在 R2-R5 哪个 Task 里被 CLI 实现，无遗漏才 Task 通过 | R6/T2 |
| R6/T4 | `.harness/current.json` schema 加 `workflow_schema_version` + **双向 migration 逻辑**（低→高 migrate；高→CLI 硬 abort 提示升级），回应 AD4 + Codex F3，参照 `harness-workflow/references/memory-migrations.md` | R5, R6/T2 |
| R6/T5 | 跑原有 `/harness-workflow --adopt` 在 myskills 自己仓库验证 stub 兼容 | R6/T2, R6/T4 |
| R6/T6 | **跨项目升级 smoke（回应 AD2）**—— 找一个已投放旧版 harness-workflow 的项目（或临时 clone 后手工 init 旧版模拟），跑 `harness maintain --upgrade` 验证 conflict 行为（personal `.rej` / company-mt 整批 BLOCK） | R6/T2, R6/T4 |

**关键测试**：
- 旧触发词 `/harness-workflow --init` 仍能进入正确流程（走 CLI passthrough）
- 旧 `.harness/current.json` 缺 `workflow_schema_version` 时 doctor 触发 migration
- Stage 0 前若 migration 未完成 → BLOCK + 提示
- `.harness/current.json` 含高于当前 CLI 的 schema 版本 → CLI 硬 abort + 明确提示升级（不静默兜底）

**sub-plan 契约**（进入 Round 6 时 sub-plan 必须展开）：
- T3 crosscheck 表：至少覆盖原 skill.md Phase 1（插件 / Hooks / MCP）/ Phase 2（项目探测 / docs/ / STATE.json）/ Phase 3（memory 契约）/ Phase 4（验证 + commit）每项动作，逐项标 CLI 命令名 + Task ID
- T4 双向 migration：写具体 schema 迁移矩阵 fixture（当前 → v1.0.0 / v1.0.0 → 当前 / v1.0.0 → 未来 v1.1.0 / v1.1.0 → v1.0.0 abort）4 组合
- T6 smoke：sub-plan 明示"fixture 项目路径（/tmp/harness-smoke-upgrade-<timestamp>/）+ 模拟旧版投放的具体文件列表 + conflict expected 清单"

---

# Round 7：`profile-entry` 内部 only + `harness-common` 抽取

**Goal**：按 Spec 2 落地 `profile-entry` skill（内部 only，不公开触发词）+ `harness-common` skill（Phase 1-4 共享基础设施）。

**DoD**：
- `profile-entry/skill.md` 含完整路由逻辑（marker 查 → fallback matchers → fast-path → 优先级解析 → 加载 exactly ONE 叶子 skill）
- `profile-entry` 不在 myskills README 宣传、不给触发词 alias、SessionStart hook 不注入
- `harness-common/skill.md` 承载 drift detection + `--maintain` 模式 + 共享 references
- `profile-entry` 调用 `harness-common` 做生命周期转发

**Tasks**（5 个）：

| ID | 标题 | 依赖 |
|----|------|------|
| R7/T1 | `profile-entry/skill.md` frontmatter + 路由逻辑骨架 | R6 完成 |
| R7/T2 | fast-path 判定逻辑（复用 `FastPathRule` 类型）+ 单测 | R7/T1 |
| R7/T3 | 优先级解析（hard_floor > flag > profile default > conservative）+ 单测 | R7/T1 |
| R7/T4 | `harness-common/skill.md` 承载 Phase 1-4 抽取内容 + references 移动 | R6 完成 |
| R7/T5 | 集成：harness-workflow stub → profile-entry → harness-common 全链路 smoke | R7/T1-T4 |

---

# Round 8：`harness-quick` + `harness-bugfix`

**Goal**：Spec 2 的两个轻量叶子 skill，承载 quick（1 文件 <10 行修改）和 bugfix（investigate → reproduce → fix → regression test → commit）两种任务类型。

**DoD**：
- `harness-quick/skill.md` 约 50 行，跳过 PRD / architect / plan，直接 edit + commit + memory observation
- `harness-bugfix/skill.md` 约 80 行，五步 TDD 流程
- profile-entry 对 1-file+<10line 的 diff 静默路由到 harness-quick
- 两 skill 都正确读 `docs/harness/knowledge/**/manifest.md` 的 knowledge context

**Tasks**（4 个）：

| ID | 标题 | 依赖 |
|----|------|------|
| R8/T1 | `harness-quick/skill.md`（Source: `harness-workflow/archive/pre-reshape-backup.md` 的 S 级 Stage 集） | R7 完成 |
| R8/T2 | `harness-bugfix/skill.md`（Source: `archive/pre-reshape-backup.md` 的 M 级 Stage 集 + `Skill(investigate)` invoke） | R7 完成 |
| R8/T3 | fast-path → harness-quick 路由 smoke test | R8/T1 |
| R8/T4 | investigate skill 与 harness-bugfix 对接 smoke test | R8/T2 |

**sub-plan 契约**（进 Round 8 时必须）：
- 每 Task 的 sub-plan 明示从 `archive/pre-reshape-backup.md` 抄哪几节（回应 AD5）
- investigate skill 缺失时的 degraded fallback 行为（回应 R8 依赖独立 skill 的 R8 风险）

---

# Round 9：`harness-feature` + `harness-refactor`

**Goal**：Spec 2 的两个重量叶子 skill。harness-feature 继承现 8-Stage 完整流程，harness-refactor 做 baseline capture + 渐进 plan + 持续验证。

**DoD**：
- `harness-feature/skill.md` 约 150 行，继承现 8-Stage 内容（Stage 0 → Stage 8）
- `harness-refactor/skill.md` 约 100 行，含 baseline tests / 增量 plan / 对比 baseline 三段
- 两 skill 都按 `profile-entry` 调用协议接收 `forced_profile` / `requested_flags` 参数
- 两 skill 都正确 Stage -0.5 注入 knowledge + stages 内走 strict-reviewer Step 5

**Tasks**（5 个）：

| ID | 标题 | 依赖 |
|----|------|------|
| R9/T1 | `harness-feature/skill.md`（Source: `harness-workflow/archive/pre-reshape-backup.md` 的 8-Stage 全文 + Spec 2 的 Stage 调用链明示 invoke team-pd / team-architect / team-senior-dev / team-junior-dev / team-qa / team-security）| R8 完成 |
| R9/T2 | `harness-refactor/skill.md`（Source: `archive/pre-reshape-backup.md` 的 baseline / plan / validate 章节） | R8 完成 |
| R9/T3 | prompts/ 目录（pd-prompt / architect-prompt 等）从 harness-workflow 迁到 harness-feature | R9/T1 |
| R9/T4 | 跨 profile 任务类型合同测试（company-feature vs harness-feature 产出一致 metadata）| R9/T1, R9/T2 |
| R9/T5 | 端到端：起一个 L 级任务，走 profile-entry → harness-feature 完整 8-Stage | R9/T1-T4 |

**sub-plan 契约**：
- T1 的 sub-plan 必须明示 harness-feature 里每个 Stage 对 team-* skill 的 `Skill(...)` invoke 调用点（spec 附录 C 已列出）+ 这些 skill 缺失时的 degraded fallback 提示
- T3 明示 prompts 是移动（mv）还是复制（cp），如果是移动则 `harness-workflow/prompts/` 应该为空或删除

---

# Round 10：`strict-reviewer` Step 5 + `review_target` 扩展 + Round 11 字段补齐

**Goal**：落地 Spec 1 的 strict-reviewer 第 4 硬门（Knowledge Compliance Check）+ 补 Spec 1 Round 11 的 3 个 Known Spec Gaps（`retrieval_outcome` / `known_issues` / Late Recovery 重算）。

**DoD**：
- `strict-reviewer/SKILL.md` 加 Step 5 知识合规检查章节
- `review_target` 运行时 schema 把 `retrieval_outcome` / `known_issues` 设为非 optional 必传
- Late Recovery 路径在 coordinator 内重算 **8 个状态字段全集**（Spec 1 knowledgeCheck schema 全部字段，详见 R10/T3）
- 违反 knowledge 的 diff 进 reviewer → FAIL，finding 指向具体 file:line
- scorecard 记录 knowledge-related verdicts

**Tasks**（5 个）：

| ID | 标题 | 依赖 |
|----|------|------|
| R10/T1 | `strict-reviewer/SKILL.md` 加 Step 5 正文 | R9 完成 |
| R10/T2 | `review_target` 字段扩展 + schema 更新 + doc-gen 刷新 | R1, R10/T1 |
| R10/T3 | Late Recovery 重算逻辑补全 —— 回应 Claude C3 + Codex R3/R4 校正。**8 个字段全重算**（Spec 1:451-502 的 `.harness-status.json.knowledgeCheck` 完整 schema）：`effective_index_status` / `snapshot_id` / `retrieval_outcome` / `filtered_candidates` / `known_issues` / `relevant_knowledge_files` / `advisory_knowledge` / `knowledge_requirements`。Task 完成条件：代码实现 + fixture 覆盖"Late Recovery 前后全 8 字段改变"单测 | R10/T2 |
| R10/T4 | reviewer FAIL fixture（违反 knowledge → verdict 指向 file:line）| R10/T1 |
| R10/T5 | scorecard schema 加 `knowledge_related` 字段 + 测试 | R10/T4 |

---

# Round 11：`team-init` skill v1 重塑 + `repo-skill-release` 对接 + 双 registry publish

**Goal**：对现有 `team-init/SKILL.md` 做 v1 内容重塑（从 v0 的 AI 手写文件改为 AI 调 `harness init` CLI + 探测/对话/决策；双重身份 = myskills 源 + CLI 投到 `.claude/skills/team-init/`，完整草稿见 spec §5.4）。**不新建 `harness-bootstrap` skill**（保留原名的决定见 spec §5.4 + 附录 C）。同时对接 `repo-skill-release` 做 `harness-workflow-cli` 的双 registry 发布。

**DoD**：
- `team-init/SKILL.md` v1 版可运行（探测 CLI → schema 双向握手 → 决策树 → 交棒）；原 v0 Edit/Write 逻辑全部删除
- `team-init/archive/v0-backup.md` 保留 v0 内容作历史记录
- `harness-workflow-cli@0.1.0` 发布到 npm public
- 同 tarball 同名发布到公司内部 registry
- `.npmrc` / CI 环境变量控制 publish target，不硬编码
- 发布流程两次 publish 都 exit 0 才算成功（任一失败视为发布失败）
- team-init 的 `harness doctor --json` version handshake 正常工作（支持高版本 → 硬 abort）

**Tasks**（7 个）：

| ID | 标题 | 依赖 |
|----|------|------|
| R11/T1 | 备份 `team-init/SKILL.md` → `team-init/archive/v0-backup.md` | R10 完成 |
| R11/T2 | 重写 `team-init/SKILL.md` 为 v1 版（复制 spec §5.4 草稿 + 填充实际 CLI 命令语法）| R11/T1 |
| R11/T3 | `harness doctor --json` 输出 `version` / `schema_version` / `installed_presets` / `managed_files_git_status` / `issues[]` 五字段 | R4, R11/T2 |
| R11/T4 | **`repo-skill-release` 适配验证（回应 AD3）**—— 先 read `~/.claude/skills/repo-skill-release/SKILL.md` 确认其对 monorepo / `packages/*` 路径的假设；如不兼容，本 Task 扩展为三子 Task：(a) 分析兼容 gap (b) patch 或 fork 它 (c) 验证 patched 版本；**sub-plan 必须先产出兼容性分析报告** | R11/T3 |
| R11/T5 | `packages/harness-cli/package.json` 补 repository / homepage / keywords / license / resourcesVersion 字段（**回应 H4 版本锁定**：resourcesVersion 绑定 package.json.version，通过 `scripts/verify-resources.ts` 校验）| R11/T4 |
| R11/T6 | **TDD 化首次发布到 npm public（回应 H1 + R3 NEW2）**—— **preflight**：先 `npm view harness-workflow-cli@<version>` 验证该 semver 尚未被占用（occupied → abort，用户选 bump minor/patch 后重试）；再 `npm publish --dry-run` 验证 tarball 内容（ls tarball 验 files 字段）；再 `npm publish`（可能需人工 OTP）；最后 `npm view harness-workflow-cli version` 验证 published 版本号对齐；每一步 Expected 明示 | R11/T5 |
| R11/T7 | **TDD 化首次发布到公司内部 registry + 半成功补救（回应 H1 + R3 NEW2）**—— **必须 T6 先成功**（public 是"更严的 registry"，先发 public 保留 semver，若 internal 失败可补发同版本到 internal）；步骤：`npm view --registry=<internal> harness-workflow-cli@<version>` preflight → `--registry=<internal> --dry-run` → publish → `npm view --registry=<internal>` 验证；**半成功补救契约**：若 public 成功 + internal 失败 → 不 bump 版本号，修好 internal 问题后重发同 version；若 public 失败 + internal 成功 → 本次发布标记"双 registry 未对齐"，记 learnings.md，下版 bump patch 后重发双 registry；双发流程 + 补救决策树写入 `docs/release.md` | R11/T6 |

**sub-plan 契约**：
- T4 若 repo-skill-release 不支持 monorepo，sub-plan 展开额外 step：patch 它的 `package.json`/`commit-release` 逻辑，识别 `packages/harness-cli/` cwd，并提交 PR 或 fork
- T6/T7 的 `--dry-run` 步骤必须验证 tarball 的 files 清单、size、main/bin 路径 —— 不允许"盲发"

---

# Round 12：`company-mt` preset 实体 + overlay skill + Java 种子映射

**Goal**：落地 Spec 2 的 `company.yml.template` stub 实体 + `resources/presets/company-mt/` 完整内容（含 4 个 overlay skill + 4 份 Java 种子引用）。

**DoD**：
- `resources/presets/company-mt/` 含完整 `company-mt.yml.template` + 4 个 overlay SKILL.md + 4 份 reference 种子（java-rules / enterprise-sdk / approval-flow / i18n）
- `~/.claude/profiles/company-mt.yml` 可加载且通过 schema 校验
- `harness init --preset company-mt <java-repo>` 生成完整企业 profile 文件树（含 Java 规则 seed、i18n 边界 seed）
- `company-feature` 正确通过 `Skill(java-standards)` invoke 现有 Java skill
- degraded fallback 测试：删掉 `java-standards` 后 company-feature 仍能跑但打警告

**Tasks**（8 个）：

| ID | 标题 | 依赖 |
|----|------|------|
| R12/T1 | `resources/presets/company-mt/profile/company-mt.yml.template` | R11 完成 |
| R12/T2 | `resources/presets/company-mt/plugins.json` | R12/T1 |
| R12/T3 | `packages/harness-cli/resources/presets/company-mt/skills/company-quick/SKILL.md`（overlay 禁 pom.xml / SQL / 权限变更；**路径在 preset 内部，见 spec §7.2**）| R12/T1 |
| R12/T4 | `packages/harness-cli/resources/presets/company-mt/skills/company-bugfix/SKILL.md`（overlay 追加 Java 代码路径定位约束）| R12/T1 |
| R12/T5 | `packages/harness-cli/resources/presets/company-mt/skills/company-feature/SKILL.md`（overlay Stage 1 前 invoke java-standards）| R12/T1 |
| R12/T6 | `packages/harness-cli/resources/presets/company-mt/skills/company-refactor/SKILL.md`（overlay 强制 baseline tests）| R12/T1 |
| R12/T7 | 四份 reference 种子（java-rules / enterprise-sdk / approval-flow / i18n）映射到 knowledge/memory | R12/T5 |
| R12/T8 | **端到端验证：安全路径版（回应 H2 + R4 NEW3 校正）**—— **不在用户真实 `$HOME/Movies/alopex-costasset` 仓库跑**，改为 `git clone "$HOME/Movies/alopex-costasset" "/tmp/alopex-costasset-smoke-$(date +%s)"` → 在 /tmp 临时目录里跑 `harness init --preset company-mt` → 验证 15+ 产出文件（见 spec §5.3）→ 验证 `.claude/skills/company-*` 投放 → 检查 pom.xml 未被误改 → 最后 `rm -rf /tmp/alopex-costasset-smoke-*`；**不**合并任何变化回用户真实仓库。**严格使用 `$HOME` 而非 `~`**（R4 FAIL 修复） | R12/T1-T7 |

**sub-plan 契约**：
- T8 sub-plan 展开的 Run 必须**强制** `[ ! -d "$HOME/Movies/alopex-costasset/.harness" ]` 断言（回应 R3 NEW3：用 `$HOME` 展开，**不用** `~` 加引号形式，避免 `"~/..."` 不被 shell 展开导致断言假通过）
- 若用户真实仓库已有 `.harness` 目录（历史残留），T8 硬 abort 提示用户手工清理

---

## Self-Review

**1. Spec 覆盖检查（R2 修复后更新）**

| spec 章节 | plan Task |
|----------|-----------|
| §5.1 CLI 命令面 5 个 | R3-R4 |
| §5.2 源码分发结构 | R1 Task 1 |
| §5.3 项目级落地产物 | R3 Task 5, R5 全部 |
| §5.4 `team-init` skill v1 重塑 | R11 Task 1-2（**改名**：原 harness-bootstrap 方案撤销，保留 team-init 原名做内容优化）|
| §6.1 单一真源 + 双真相防御 | R1 全部 + R5 Task 6/7/8/9/10/11 |
| §6.2 三层记忆 schema | R4 Task 3/4, R5 Task 1-5 |
| §6.3 Managed 状态契约 | R2 Task 2/3/6 + R5 Task 11（版本锁定）|
| §6.4 分发契约（含版本锁定）| R11 Task 4-7 + R5 Task 11 |
| §6.5 迁移/兼容契约（双向 schema + 跨项目升级）| R6 全部（Task 4 双向 + Task 6 跨项目）|
| §7 Java company-mt 实体 | R12 全部 |
| §8 实施 DAG | 本 plan 12 Round 结构即是 |
| §9 风险矩阵 | Round DoD 内置预防（R1 预防 R1/R11 风险 / R2 预防 R2 / R3 预防 R3/R7 / R5 预防 R4/R8/R10 / R6 预防 R4/R5 / R11 预防 R3/R9）|
| §10 writing-plans 进入条件 | 本 plan header + Scope Check 已体现三条硬输入 |
| **附录 C 15-skill 处理矩阵** | **Preamble Step 5/6 + R8-R9 各 Task 的 "Source" 引用 + R11 team-init 重塑 + spec 附录 C 本身是唯一真源** |

**新增：R2 修复循环覆盖的 finding 映射**：

| Finding | 来源 | 修复位置 |
|---------|------|---------|
| C1 Phase→CLI crosscheck | Claude 自审 | R5/T10 crosscheck 表 + R6/T3 逐条验证 |
| C2 四态 fixture 8 组合 | Claude 自审 | R2 sub-plan 契约 |
| C3 Gap 3 字段清单 inline | Claude 自审 | R10/T3 任务描述已 inline |
| H1 manual verification | Claude 自审 | R11/T6 + T7 TDD 化 |
| H2 alopex-costasset 破坏 | Claude 自审 | R12/T8 临时 clone + 断言用户仓库未污染 |
| H3 matrix 36 组合 | Claude 自审 | R5 sub-plan 契约 |
| H4 版本锁定 | Claude 自审 | R5/T11 + R11/T5 |
| AD1 CI 前置 | Claude 自审 | R2 sub-plan 契约 |
| AD2 跨项目升级 | Claude 自审 | R6/T6 |
| AD3 repo-skill-release 适配 | Claude 自审 | R11/T4 兼容性分析前置 |
| AD4 schema 双向迁移 | Claude 自审 | R6/T4 双向 |
| AD5 archive 引用 | Claude 自审 | R8 / R9 Task 的 Source 行 |
| F1 R6-R12 step-less | Codex R4 | Scope Check 声明改 Master/Sub-plan 契约 |
| F2 目录 Grounding | Codex R4 | Preamble Step 5 目录创建映射表 + Step 6 验证 |
| F3 schema 单向（确认 AD4）| Codex R4 | R6/T4 双向 + team-init v1 含高版本 abort |
| Coverage 漏洞（13 skill）| 用户发现 | spec 附录 C 15-skill 矩阵 + Preamble Step 6 + R8/R9 各 Task Source 引用 + R11 team-init 保名 |
| team-init 方案 D | 用户决策 | spec §5.4 改写 + 附录 C 记录 + R11 重塑 |

**2. 占位符扫描**：

- [ ] 无 "TBD" / "TODO 后续实现" / "实施时再说"
- [ ] 无 "类似 Task N"（每 Task 内容独立）
- [ ] Round 6-12 的 task 级粒度已固定 + sub-plan 契约明示了每 Task 进入时必须补的 fixture / 安全路径 / 验证矩阵（这不是 placeholder，是 Master/Sub-plan 两层契约）

**3. 类型一致性**：

- `RuleStatus` 四态在 R1/T2（定义）→ R5/T9（matrix fixture）→ R10/T3（reviewer 消费）全部一致
- `review_target` 字段在 R1/T3（schema）→ R5/T7（fixture）→ R10/T2（扩展）→ R10/T3（Late Recovery 重算）全部一致
- `ManagedFileRecord` 在 R1/T5（定义）→ R2/T2-T3（落盘 + 比对）→ R3/T3（materialize 消费）→ R4/T2（doctor 检查）全部一致
- `HardFloorAction` 在 R1/T4（定义）→ R2/T6（conflict 行为）→ R12/T1（company-mt 引用）全部一致

无漂移。

**4. 关键路径检查**：

关键路径 R1 → R2 → R3 → R4 → R5 → R6 → R7 → R10 → R11 无回头依赖。R8/R9 可并行到 R7 之后但不在关键路径。R12 可与 R11 并行。

---

## 执行方式（Execution Handoff）

Plan 完成并保存到 `harness-workflow/plans/2026-04-24-harness-cli-integration-implementation.md`。两个执行选项：

**1. Subagent-Driven（推荐）** — harness-workflow Stage 3 会为每个 Round 派发新 subagent（senior/junior 并行），两阶段审查，快速迭代

**2. Inline Execution** — 在当前会话里顺序执行，checkpoint 处暂停审查

**推荐**：按 harness-workflow XL 级惯例用 Subagent-Driven。每 Round 完成后 Stage 8 自动输出报告 + 写 STATE.json，下一 Round 自动启动。

**Round 6-12 的 step 级展开**：进各 Round 时再写 `plans/round-<N>-<task-name>.md` sub-plan。task 清单 + DoD 已在本 plan 固定，sub-plan 只做 step 分解。
