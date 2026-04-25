# push-decision — Git Push 风险评估规则

> **Source of truth**: `packages/harness-cli/src/types/constants.ts`。如本文档与代码不一致，以代码为准。

> 本文件由 leaf skill（harness-quick / harness-bugfix / harness-feature / harness-refactor）在 commit 之后调用。
> 完全规则化，**不调用 LLM** 当场推理。

## 输入

- `profile_hard_floor`: 列表（来自 resolved profile 的 `hard_floor` 字段）
- `git diff --stat HEAD~1 HEAD`: 本轮 commit 的改动
- `git diff HEAD~1 HEAD`: 完整 diff（用于 keyword 检查）
- 测试结果（feature/bugfix Stage 6 输出，如果可得）

## Step 1: 公司硬底优先

```
if "auto_push" in profile_hard_floor:
    print "Push: REFUSED (公司 profile hard_floor 禁止 auto_push)"
    return REFUSE
```

## Step 2: 改动 risk 评估（仅个人项目）

按以下顺序判断（先命中先决定）：

### HIGH（强制人工 push，不询问）

任一命中即评 HIGH：

| 条件 | 检测 |
|------|------|
| 涉及 secrets | diff 含 `.env` / `.secrets` / `*credentials*` 等文件名 |
| 改 dependencies | diff 含 `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` 的 dependencies / requires 段 |
| 改 db schema | diff 含 `migrations/` / `schema.sql` / `*.sql` |
| 改 CI/构建 | diff 含 `.github/workflows/` / `Dockerfile` / `Makefile` / `.gitlab-ci.yml` |
| 大改动 | files_changed > 3 |
| 测试失败 | 任一现有测试 fail |
| 破坏性 keyword | diff 含 `BREAKING` / `DROP TABLE` / `rm -rf` / `force_destroy` |
| 改公共导出 | diff 含 `index.ts` / `__init__.py` / `lib.rs` 等公共入口文件 |

### LOW（自动 push）

所有条件都满足才评 LOW：

| 条件 | 检测 |
|------|------|
| 文件类型 | 仅 `*.md` / `*.txt` / `*.po` / `*.json`（i18n） |
| 或 仅注释/docstring | diff 中所有非空行都以注释 marker 起始（`#` / `//` / `/* */` / `--`） |
| 或 新增独立模块 | 新文件，且 `git grep` 在现有代码中找不到 import 引用 |
| 或 单文件小改 | files_changed = 1 且 diff 行数 < 10 且全是 string literal 改动（`"..."` 或 `'...'` 内的内容） |

### MEDIUM（询问一次 push）

不命中 HIGH、不命中 LOW → 默认 MEDIUM。

## Step 3: 执行决策

```
HIGH:
  echo "❌ Push 被阻拦：原因 ${reason}。"
  echo "   请人工 push: git push origin ${branch}"
  return REFUSE

LOW:
  echo "✓ Risk: low (${reason})。自动 push。"
  git push origin ${branch}
  return AUTO_PUSHED

MEDIUM:
  echo "⚠ Risk: medium。是否 push？[y/N]"
  read answer
  if [[ "${answer}" == "y" ]]; then
    git push origin ${branch}
    return USER_PUSHED
  else
    echo "Push 跳过。手动: git push origin ${branch}"
    return SKIPPED
  fi
```

## Step 4: Override flags

| flag | 行为 |
|------|------|
| `/no-push` | 强制跳过 push（任何 risk 都不 push） |
| `/yolo` | aggressive mode → MEDIUM 自动通过；HIGH 仍然 REFUSE（hard_floor 不可绕过） |
| `/safe` | conservative mode → LOW 也降级为 MEDIUM 询问 |

## Step 5: commit message 启发式

特殊 commit message 规则：

- message 含 `wip` / `WIP` / `temp` → 强制 MEDIUM（即使 risk 算 low）
- message 含 `revert` / `rollback` → 强制 HIGH（拒绝 auto push，要求人工确认）

## codex 反对意见（已记录）

codex strict reviewer 反对“个人项目低 risk 自动 push”，理由：
- 与原 autonomy.md 第 4 项“绝不静默自动 push”冲突
- 不同 leaf skill 风险判断不一致

本规则采纳 user feedback（risk-based）的决策见 spec §3.4 末尾 + §7 风险表。
用户随时可在 `~/.claude/profiles/harness.yml` 加 `hard_floor: [auto_push]` 关掉自动行为。

## 测试

leaf skill 在调用本规则前，应能本地复现：

```bash
git diff --stat HEAD~1 HEAD     # files changed
git diff HEAD~1 HEAD             # full diff
.harness-status.json -> last_test_result
```

无以上输入时，默认评 MEDIUM（保守）。

## 引用上游

- 决策原则：spec `docs/superpowers/specs/2026-04-25-setup-zero-questionnaire-design.md` §3.4
- autonomy 改动：[../../harness-workflow/references/autonomy.md](../../harness-workflow/references/autonomy.md)
- profile schema：[../../profile-entry/references/profiles.md](../../profile-entry/references/profiles.md)
