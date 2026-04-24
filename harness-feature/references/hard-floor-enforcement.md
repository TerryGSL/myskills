# Hard-Floor Enforcement in Stage 8

How `harness-feature` enforces `profile.hard_floor` during wrap-up.

## Hard-Floor 六种动作

| 动作 | Stage 8 行为 |
|------|------|
| `auto_push` | `git commit` 后**不** `git push`；提示用户手动 push |
| `force_push` | 整轮禁止（即使用户显式请求也拒绝） |
| `destructive_ops` | 禁止 `git reset --hard`、`rm -rf`、`DROP TABLE` 等不可逆命令 |
| `auto_merge` | 创建 PR 但不 auto-merge，即使 CI 全 pass |
| `rewrite_history` | 禁止 `git rebase`、`git amend`、交互式 rebase |
| `network_install` | Stage 8 不跑 `mvn install` / `npm install` 等触发外部 repo download |

## Profile 配置

- `personal`（harness）：`hard_floor: []`（空，用户自己决定）
- `company-mt`：`hard_floor` 默认含 `auto_push` / `force_push` / `destructive_ops` / `auto_merge` / `rewrite_history` / `network_install`（**全套 6 种**）
- `default`：保守起见 `hard_floor: [force_push, destructive_ops, rewrite_history]`

## 违反检测

Stage 8 在执行任何 git / shell 命令前检查：

```
要跑的命令 M 是否匹配 profile.hard_floor 的任一动作？
  是 → harness doctor 立即 BLOCKED，要求人工接管；把意图记到 learnings ERRORS
  否 → 允许执行
```

## 和 `/yolo` flag 的关系

`/yolo` flag 请求 aggressive 模式，**不能绕过 hard_floor**。

profile-entry 在 mode resolution 时已经剔除了 hard_floor 清单里的动作（见 `profile-entry/references/precedence.md`）。即：`/yolo` 传到 harness-feature 时，resolved_mode 虽然是 aggressive，但 hard_floor 仍在 input 里。

Stage 8 独立再验证一次 hard_floor（纵深防御）—— 避免 profile-entry 漏判。

## 日志与审计

每次 hard_floor 拒绝一个动作 → 写 `.harness/learnings/ERRORS.md`：

```
## [ERR-YYYYMMDD-XXX] stage-8-hard-floor
**Priority**: high
**Status**: resolved
### Error
Attempted <command> in Stage 8; blocked by profile.hard_floor[<action>]
### Context
profile: company-mt
resolved_mode: aggressive
hard_floor: [auto_push, force_push, ...]
### Suggested Fix
Action is blocked by policy. If needed, user must execute manually.
```

这条 entry 作为审计证据，证明 AI 没有静默违反。

## 例外：用户 explicit 授权

用户可通过明示语句授权单次 hard_floor 动作：

```
用户："这次 force push 我授权"
```

→ harness-feature 仍执行 hard_floor 检查，但额外记录"explicit user override"作为授权证据。
这个信息进 learnings + scorecard。

**不允许** sticky override（一次授权后续 round 自动沿用）。每轮需要新授权。
