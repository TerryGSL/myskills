# harness 融合 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `harness/` 嵌套目录里 4 个新能力（profile-bootstrap / push-decision / context-monitor 自适应阈值 / setup 零问卷）融合进顶层 `harness-init` + `packages/harness-cli/` 主线，最后清理嵌套 `harness/`。

**Architecture:** 8 个 PR 严格串行（codex 6 轮审稿 PASS 的硬约束），不允许跨 PR 并行。每个 PR atomic + 含 rollback 步骤。每个 PR 内部不同文件改动可并行。

**Tech Stack:** TypeScript（packages/harness-cli/）/ jest / bash 脚本 / GitHub Actions / Markdown / git

**Spec：** `docs/superpowers/specs/2026-04-26-harness-fusion-design.md`（V6，codex R6 PASS）

**Key Hard Constraints**（来自 spec / codex 审稿）：
- 8 PR 严格串行，不允许跨 PR 并行
- 每个 PR commit message 含 `[depends on: PR N-1]` tag（除 PR 0）
- 每个 PR 必须 atomic + rollback 步骤明示
- 所有写文件必须 mktemp + mv（user-global / project 都遵守）

---

## PR 0：constants 单一来源 + schema drift CI

**Files:**
- Create: `packages/harness-cli/src/types/constants.ts`（MATCHER_TYPES / HARD_FLOOR_FLAGS / TASK_TYPES / PUSH_RISK_LEVELS / AGGRESSION_MODES as `as const`）
- Create: `packages/harness-cli/scripts/regen-schema.ts`（从 constants 重新生成 profile.schema.json + push-decision.schema.json）
- Create: `.github/workflows/schema-drift.yml`（CI: regen + git diff --exit-code resources/schemas/）
- Modify: `packages/harness-cli/src/utils/profile.ts`（matcher type switch 改用 import 的常量）
- Modify: `packages/harness-cli/package.json`（加 `regen:schema` npm script）
- Modify: `profile-entry/references/profile-resolution.md`（顶部加 source-of-truth header）
- Modify: `harness/harness-common/references/push-decision.md`（顶部加 source-of-truth header）

**实现要点**：
- `constants.ts` 5 组 enum 全部用 TypeScript `as const` + derived type
- `regen-schema.ts` patch 现有 `profile.schema.json` 而非完全重写（保留非 enum 字段）
- 同时新建 `push-decision.schema.json`（PR 5 会用到）
- CI workflow 仅在改 constants/regen/schemas 路径时触发；运行 `npx tsx scripts/regen-schema.ts && git diff --exit-code resources/schemas/`
- markdown source-of-truth header 句式：`> **Source of truth**: \`packages/harness-cli/src/types/constants.ts\`。如本文档与代码不一致，以代码为准。`

**Verify:**
- `cd packages/harness-cli && npx tsx scripts/regen-schema.ts` → 跑完 `git diff resources/schemas/` 应无 diff（说明现 schema 与 constants 一致）
- TS build 通过

**Commit message:**
```
feat(constants): single source of truth + schema drift CI [PR 0]

- src/types/constants.ts: MATCHER_TYPES / HARD_FLOOR_FLAGS / TASK_TYPES / PUSH_RISK_LEVELS / AGGRESSION_MODES
- scripts/regen-schema.ts: regenerate JSON schemas from constants
- .github/workflows/schema-drift.yml: CI git diff after regen
- utils/profile.ts: matcher type switch uses imported constants
- markdown contracts: source-of-truth header pointing to constants.ts

Codex R6 PASS spec §A PR 0.
```

**Rollback:** `git revert <pr-0-sha>`。无外部依赖。

---

## PR 1：contract drift cleanup（删 `always` 残留 + 文档对齐）

**Files:**
- Modify: `harness/setup/setup-harness.sh`（write_default_yml: type:always pattern:"*" → type:path_glob pattern:"**"）
- Modify: `harness/profile-bootstrap/SKILL.md`（Step 4 白名单删 always）
- Modify: `harness/hooks/context-monitor.sh`（顶部加 deps comment: `# requires: bash >= 3.2, python3, realpath`）
- Modify: `harness/setup/setup-harness.sh:185-190`（print_hook_snippet 末段 "无 task_type → 静默退出" → "无 task_type → default 70/85"）

**Verify:**
```bash
grep -rn "type: always\|always-match" harness/ packages/ profile-entry/ --include="*.md" --include="*.sh" --include="*.yml" --include="*.ts" 2>/dev/null
# 期望：仅历史 spec/plan 文档（不影响）或 0 hit
```

**Commit message:**
```
fix(contract-drift): remove 'always' matcher residue, align hook docs [PR 1] [depends on: PR 0]
```

**Rollback:** `git revert <pr-1-sha>`；不允许把用户 profile 改回 type:always；若需修复已生成文件，仅允许保持 type:path_glob 且 pattern:"**"。

---

## PR 2：harness install 命令 + Tier 3 工具探测披露

**Files:**
- Create: `packages/harness-cli/src/commands/install.ts`
- Create: `packages/harness-cli/tests/commands/install.test.ts`
- Modify: `packages/harness-cli/src/cli.ts`（注册 install 子命令）
- Modify: `harness-init/SKILL.md`（第二步 Tier 3 加披露 / 第七步引用 install --doctor）
- Modify: `harness/setup/setup-harness.sh`（thin wrapper 改造）

**install.ts 行为约束（强约束，spec §A PR 2）**：
- 默认行为 = `check + auto-fix`（不是 dry-run）
- `--doctor` = check only（不写）
- `--json` = 机器可读输出
- Step 1: profiles dir mkdir if missing
- Step 2: default.yml / harness.yml / company.yml.template 缺失项 atomic 写入（mktemp + mv）
- **Step 3 settings.json 三态分支（必须）**：
  - 不存在 → 写最小合法 JSON（mktemp + mv）
  - 存在但非合法 JSON → 备份为 `settings.json.bak.invalid` + exit 1
  - 存在且合法 → JSON.parse + merge `hooks.Stop[]` + 备份 `settings.json.bak` + atomic mv
- Step 4: skills symlink 检查 + 修复（覆盖坏链）
- Step 5: Tier 3 工具探测（`bash` / `python3` / `realpath`），缺失 warn-only（不 fail）
- **hook 路径定死为 `$REPO_ROOT/hooks/context-monitor.sh`**

**setup-harness.sh wrapper 行为**：
```
if command -v harness >/dev/null 2>&1; then
  exec harness install "$@"
fi
# else 走 bash fallback，且语义必须与 harness install 一致：
# 默认 check + auto-fix；--doctor = check only；不支持 --json 时显式报错并 exit 2
```

**harness-init/SKILL.md 第二步加 Tier 3 工具披露段**：
```
**Tier 3 工具依赖**：环境必须有 bash >= 3.2 / python3 / realpath。
`harness install --doctor` 跑环境探测时检查这 3 个工具，缺失即 warn（不 fail）。
```

**Verify:** `cd packages/harness-cli && npm test -- install.test` → 5 个 test pass

**Commit message:**
```
feat(install): user-global install command + Tier 3 disclosure [PR 2] [depends on: PR 1]
```

**Rollback:** `git revert <pr-2-sha>`；settings.json.bak 用于恢复。

---

## PR 3：matcher validation 增强 + placeholder residue check

**Files:**
- Modify: `packages/harness-cli/src/utils/profile.ts`（validateProfile 加 placeholder + matcher whitelist + required fields check）
- Create: `packages/harness-cli/tests/fixtures/{placeholder-residue,illegal-matcher,missing-fields}-pack.yml`
- Create: `packages/harness-cli/tests/utils/profile.test.ts`

**fixture 关键内容**：
- placeholder-residue-pack: `name: company-REPLACE_ME`, pattern 含 REPLACE_ME
- illegal-matcher-pack: `type: repo_path`（非白名单值）
- missing-fields-pack: 仅 name + description + task_types（缺 detection / entry_skill / default_mode / hard_floor）

**验证逻辑**（追加到 validateProfile）：
```typescript
if (/REPLACE_ME|__[A-Z_]+__/.test(yamlText)) violations.push('Placeholder residue ...');
for matcher in matchers: if !MATCHER_TYPES.includes(type) violations.push('illegal');
for k in [detection, entry_skill, default_mode, hard_floor, task_types]: if !(k in parsed) violations.push('missing');
```

**Verify:** `npm test -- profile.test` → 3 fixture 全 fail validation

**Commit message:**
```
test(profile): placeholder residue + illegal matcher + missing fields fixtures [PR 3] [depends on: PR 2]
```

**Rollback:** `git revert <pr-3-sha>`。

---

## PR 4：profile-bootstrap CLI 命令 + 跨 tier 双轨

**Files:**
- Create: `packages/harness-cli/src/utils/derive.ts`（移植 bash derive.sh）
- Create: `packages/harness-cli/src/commands/profile-bootstrap.ts`
- Create: `packages/harness-cli/tests/utils/derive.test.ts`（jest 6 个 test）
- Modify: `packages/harness-cli/src/cli.ts`（注册 profile-bootstrap 命令）
- Modify: `harness-init/SKILL.md`（第五步决策树加 entry / 第二步 Tier 3 章节加 derive 引用）
- Modify: `harness/profile-bootstrap/SKILL.md`（Step 1 加 CLI 引用，bash 作 Tier 3 fallback）

**derive.ts 算法（移植 derive.sh，对齐 spec §A PR 4）**：
1. canonical repo root：`git rev-parse --show-toplevel` → `realpath`
2. path_glob：仅 repo root（`${HOME}/...` → `~/...`），不爬父目录
3. 扫所有 remotes（`git remote -v`），所有 (host, org) 必须一致
4. origin/upstream 不一致 → throw（要求显式 `--remote`）
5. remote_regex：`<host>[:/]<org>/<repo>(\.git)?$`，正则字符转义
6. slug 字符校验 `[a-z0-9-]+`
7. **不自动派生 file_exists matcher**

**profile-bootstrap.ts 行为约束**：
- 必须在 git repo 内（`git rev-parse --is-inside-work-tree`）
- 公司类 slug（含 company / work / corp 或 `--workspace company`）→ `hard_floor: [auto_push, force_push, destructive_ops, auto_merge]`；否则 `hard_floor: []`
- monorepo 子包公告："Detected git toplevel: <path>; About to derive matcher for the WHOLE REPO; Continue? [y/N]"
- 写 yml: atomic（mktemp + mv）
- 写 `.harness-profile` marker: atomic
- 自动加 `.harness-profile` 到 `.gitignore`（grep 检查后 append）
- 写前调用 PR 3 的 validateProfile 校验（占位符残留 / 非法 matcher 类型 / 必需字段）→ 失败拒绝写

**harness/profile-bootstrap/SKILL.md Step 1 改为**：
```
# 优先调 harness profile-bootstrap CLI
harness profile-bootstrap [<slug>] [--remote origin|upstream]

# Tier 3 fallback rules: see harness-init/SKILL.md#第二步
# 若无 CLI：source lib/derive.sh && derive_profile "${user_slug}"
```

**Verify:** `npm test -- derive.test` → 6 个 test pass（SSH/HTTPS/inconsistent/no-repo/illegal-slug/no-remotes）

**Commit message:**
```
feat(profile-bootstrap): explicit CLI command + cross-tier dual-track [PR 4] [depends on: PR 3]
```

**Rollback:** `git revert <pr-4-sha>`；derive.sh / test-derive.sh 保留不变。

---

## PR 5：harness push-check CLI + push-decision 跨 tier 双轨

**Files:**
- Create: `packages/harness-cli/src/utils/push-decision.ts`（risk 评估规则引擎）
- Create: `packages/harness-cli/src/commands/push-check.ts`
- Create: `packages/harness-cli/tests/commands/push-check.test.ts`
- Modify: `packages/harness-cli/src/cli.ts`
- Move: `harness/harness-common/references/push-decision.md` → `harness-common/references/push-decision.md`
- Modify (顶层后的 push-decision.md): 加 source-of-truth header；§6 替换为单句 `Tier 3 fallback rules: see harness-init/SKILL.md#第二步`
- Modify: `harness-workflow/references/autonomy.md`（第 4 项改 risk-based）
- Modify: 4 个 leaf skill `harness-{quick,bugfix,feature,refactor}/skill.md`（commit 段改用单句指针）

**push-decision.ts assessPushRisk() 规则（强约束 spec §A PR 5）**：
- Step 1: `hard_floor` 含 `auto_push` → REFUSE（exit 2）
- Step 2 HIGH 条件（任一命中即 HIGH）：
  - 涉及 secrets（`.env` / `.secrets` / `*credentials*`）
  - 改 dependencies（package.json / pyproject.toml / go.mod / Cargo.toml 的 deps 段）
  - 改 db schema（migrations/ / schema.sql / *.sql）
  - 改 CI/构建（.github/workflows/ / Dockerfile / Makefile）
  - >3 文件
  - 测试 fail
  - 破坏性 keyword（BREAKING / DROP TABLE / rm -rf / force_destroy）
  - 改公共导出（index.ts / __init__.py / lib.rs）
- Step 3 LOW（必须全满足）：仅 md/txt/po/json 或 仅注释 或 新增独立模块（无 import）或 单文件 <10 行 string 改动
- Step 4 否则 MEDIUM
- **CLI 必须完整复刻三档行为**（不允许弱化为 advisory）

**leaf skill commit 段统一句式**：
```
commit 后调用 `harness push-check`；不可用时按 `harness-common/references/push-decision.md` 规则手算。
Tier 3 fallback rules: see harness-init/SKILL.md#第二步
```

**push-decision.md §6 改为单句指针**：
```
## §6 Tier 3 fallback

Tier 3 fallback rules: see harness-init/SKILL.md#第二步
```

**autonomy.md 第 4 项**：从"绝不静默自动 push"改为 risk-based（HIGH 拒绝 / MEDIUM 询问 / LOW 自动；公司 hard_floor 含 auto_push 永远走 HIGH）。

**Verify:** `npm test -- push-check` 全 pass

**Commit message:**
```
feat(push-check): risk-based CLI + cross-tier dual-track contract [PR 5] [depends on: PR 4]
```

**Rollback:** `git revert <pr-5-sha>`。

---

## PR 6：context-monitor 自适应迁顶层 hooks/ + symlink 备援

**Files:**
- Modify: 顶层 `hooks/context-monitor.sh`（替换为 `harness/hooks/context-monitor.sh` 自适应版本）
- Modify: `harness-workflow/references/hooks.md`（模板段同步自适应阈值）
- Replace: `harness/hooks/context-monitor.sh` 改为 symlink → `../../hooks/context-monitor.sh`

**自适应阈值（强约束 spec §A PR 6）**：
- quick: warn=80, crit=90
- bugfix: warn=70, crit=85
- feature/refactor: warn=60, crit=80
- 无 task_type: default 70/85（与 bugfix 同）
- env override: HARNESS_QUICK_CRIT_THRESHOLD 等

**SCRIPT_PATH 固定**：`$REPO_ROOT/hooks/context-monitor.sh`

**symlink 唯一**：`harness/hooks/context-monitor.sh` 必须是 symlink，不允许 stub 文件二选一。

**用户兼容**：PR 2 install 注册的 settings.json 已用同一绝对路径，PR 6 后无需重注册。

**Verify:**
```bash
ls -la harness/hooks/context-monitor.sh   # 应显示 -> ../../hooks/context-monitor.sh
diff <(readlink harness/hooks/context-monitor.sh | xargs -I {} realpath harness/hooks/{}) hooks/context-monitor.sh
```

**Commit message:**
```
feat(context-monitor): adaptive thresholds + top-level migration [PR 6] [depends on: PR 5]
```

**Rollback:** `git revert <pr-6-sha>`；用户已注册的 hook 路径仍稳定。

---

## PR 7：清理嵌套 harness/

**Files:**
- Create: `scripts/check-nested-harness-refs.sh`
- Delete: `harness/setup/`（已被 PR 2 install 替代）
- Delete: `harness/profile-bootstrap/SKILL.md`（已被 PR 4 CLI 替代；lib/ 保留为 Tier 3 oracle）
- Delete: `harness/harness-{quick,bugfix,feature,refactor}/SKILL.md`（顶层 skill.md 是 canonical）
- Delete: `harness/harness-common/references/push-decision.md`（已 PR 5 迁顶层）
- Delete: `harness/harness-workflow/references/autonomy.md`（已 PR 5 迁顶层）

**保留作历史档案 / Tier 3 oracle**：
- `harness/profile-bootstrap/lib/`（Tier 3 fallback + 测试 oracle）
- `harness/docs/superpowers/specs/`、`plans/`
- `harness/harness-workflow/specs/`、`plans/`
- `harness/hooks/context-monitor.sh`（PR 6 已改为 symlink）

**check-nested-harness-refs.sh 行为**：
```
grep -rl "harness/setup\|harness/hooks\|harness/profile-bootstrap\|harness/harness-common/references\|harness/harness-workflow/references" \
     --include="*.md" --include="*.sh" --include="*.ts" --include="*.yml" --include="*.json" \
     --exclude-dir=node_modules --exclude-dir=.legacy-backup-2026-04 --exclude-dir=docs/superpowers \
     . 2>/dev/null
# 必须 0 hit 才能继续
```

**Verify:**
- `./scripts/check-nested-harness-refs.sh` 0 hit
- 删除后跑一次 `git status` 确认 working tree clean

**Commit message:**
```
chore(cleanup): remove migrated nested harness/ entries [PR 7] [depends on: PR 6]
```

**Rollback:** `git revert <pr-7-sha>`；所有删除文件可从 git history 恢复。

---

## 实施顺序硬约束

```
PR 0 → PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 → PR 7
```

跨 PR **不允许并行**（codex R6 PASS spec §D 硬约束）。
PR 内部不同文件改动可并行。

总计：8 PR / ~12 新文件 / ~15 修改文件 / ~50 commits。
