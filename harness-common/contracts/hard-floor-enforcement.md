# Hard-floor Enforcement — 6 Flags 强制执法

> **Source of truth**: `packages/harness-cli/src/types/constants.ts` (`HARD_FLOOR_FLAGS`) + `resources/schemas/hard-floor.schema.json`。如本文档与代码不一致，以代码为准。

定义 6 个 hard_floor flag 的语义、执法点、降级禁令。**hard_floor 永远胜过 aggression mode 和用户 flag**，这是 unified fusion 的核心约束之一。

## 6 个 Hard-floor Flags

| Flag | 含义 | 触发拒绝条件 |
|------|------|-------------|
| `auto_push` | 禁止自动 push | leaf skill 评估 push risk = LOW 时仍 REFUSE |
| `force_push` | 禁止 force push | 任何 `git push --force` / `--force-with-lease` 都 REFUSE |
| `destructive_ops` | 禁止破坏性操作 | `rm -rf` / `DROP TABLE` / `truncate` 等 REFUSE |
| `auto_merge` | 禁止自动 merge | 自动 PR merge / squash REFUSE |
| `rewrite_history` | 禁止重写历史 | `git rebase -i` / `git commit --amend` 改公共分支 REFUSE |
| `network_install` | 禁止网络安装 | `npm install <pkg>` / `pip install <pkg>` 涉及 registry → REFUSE |

枚举真源：`HARD_FLOOR_FLAGS` 数组（6 项）。

## Profile 中的 hard_floor 字段

```yaml
# ~/.claude/profiles/<name>.yml
hard_floor:
  - auto_push
  - force_push
```

字段类型：`HARD_FLOOR_FLAGS` 子集（任意排列、可空）。Schema 校验 `hard-floor.schema.json` 限制只能取 6 个 enum 值。

## 执法点（5 处）

每个执法点必须独立检查 hard_floor，**不能假定上游已检查过**。

### 1. profile-entry / `harness route`（加载 leaf 前）

`harness route --json` 输出 `hard_floor` 字段。AI 在加载 leaf skill 前必须知晓这个列表。leaf skill 行为受其约束。

### 2. push-check（每次 commit 后）

见 [push-decision.md](push-decision.md) Step 1：

```
if "auto_push" in profile_hard_floor:
    print "Push: REFUSED (公司 profile hard_floor 禁止 auto_push)"
    return REFUSE
```

`force_push` 同理：任何 leaf 试图 force push → REFUSE。

### 3. install / setup

`harness install` 在配置 hook 时检测 `network_install`：

- in hard_floor → 拒绝从 registry 拉新依赖；只装 user-global symlink + 已有依赖
- not in hard_floor → 走完整 npm install 路径

### 4. pre-tool hook（check-dangerous）

`destructive_ops` / `rewrite_history` 由 [hooks.md](hooks.md) 的 `check-dangerous.sh` 拦截。配合 hook 脚本检查命令模式。

### 5. leaf skill 内（Stage 8 收尾时）

leaf skill 在结束 round 前再次校验：commit 行为是否符合 hard_floor；若发现违反 → 不写 round summary，BLOCKED 升级用户。

## 优先级（绝对）

```
hard_floor > aggression_mode > 用户 flag > 默认行为
```

例：

| 场景 | 行为 |
|------|------|
| profile=`company/acme`，`hard_floor=[auto_push]`，用户 `/yolo` | auto_push 仍 REFUSE（hard_floor 胜）|
| profile=`harness`，`hard_floor=[]`，用户 `/yolo` | LOW + MEDIUM 自动 push |
| profile=`harness`，`hard_floor=[force_push]`，用户显式 `git push --force` | REFUSE，要求人工确认且去除 hard_floor |

## 降级禁令

**hard_floor 不可静默降级**。任何执法点遇到违反 → 必须明确输出原因 + REFUSE，不允许：

- 静默忽略（行为继续但只 warn）
- 自动写出本次例外（除非用户显式输入命令解除 hard_floor）
- 自动 fallback 到非 hard_floor 路径

唯一解除路径：用户**手动**编辑 profile YAML 移除该 flag，或显式临时 override（如 `harness route --override-hard-floor=force_push`，需登录 + audit 记录）。

## hard_floor 与 push-decision 的接口

push-decision 收到 `profile_hard_floor` 列表（来自 resolved profile）。Step 1 公司硬底优先：

```
if "auto_push" in profile_hard_floor:
    return REFUSE
```

Step 4 override flags（`/yolo` / `/no-push`）**不能绕过 hard_floor**：

```
| flag | 行为 |
|------|------|
| `/yolo` | aggressive mode → MEDIUM 自动通过；HIGH 仍 REFUSE（hard_floor 不可绕过） |
```

## 工具集 install 脚本约束

所有 install 脚本（`packages/harness-cli/src/commands/install.ts` + bash fallback `harness/profile-bootstrap/lib/derive.sh` + 工具 wrapper 的 setup 脚本）必须用同一份 `HARD_FLOOR_FLAGS` 常量列表。任何脚本写死 4 个 flag 而不是 6 个 → drift，CI（`schema-drift.yml`）应拒绝。

## 失败处理

| 场景 | 动作 |
|------|------|
| profile 含未知 flag（非 6 个 enum 之一） | schema 校验阶段 BLOCKED，issue code = `unknown_hard_floor_flag` |
| hard_floor 字段缺失 | 当作空数组（不报错；profile schema 字段必填但允许 `[]`） |
| 多个 profile 同时激活、hard_floor 不一致 | 取并集（更保守） |

## Audit 要求

每次 hard_floor 触发 REFUSE 都必须记入 audit：

- 时间戳
- 触发的 flag
- 被拒动作
- 用户 / coordinator 上下文（哪个 round / leaf skill）

audit 写入 `docs/memory/harness_reviewer_scorecard.yml` 或独立 `audit log`（具体路径由 wrapper 决定）。

## 实现位置

- Constants：`packages/harness-cli/src/types/constants.ts` `HARD_FLOOR_FLAGS`
- Schema：`packages/harness-cli/resources/schemas/hard-floor.schema.json`
- profile schema 引用：`profile.schema.json` 的 `hard_floor` 字段
- push-check 执法：`packages/harness-cli/src/commands/push-check.ts`
- install 执法：`packages/harness-cli/src/commands/install.ts`
- hook 执法：`hooks/check-dangerous.sh`
- 路由集成：见 [routing.md](routing.md)
