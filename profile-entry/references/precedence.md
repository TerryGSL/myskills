# Aggression Mode 优先级契约

Single source of truth for how profile-entry resolves `mode` when multiple signals disagree.

## 硬规则

```
profile hard_floor policy
  >  per-invocation flag (/yolo | /safe)
  >  profile config default_mode
  >  built-in conservative fallback
```

## 逐条解释

### Tier 1：`hard_floor`（最高，永远禁止）

`profile.hard_floor` 列出的动作**永远禁止执行**，**无法被任何 flag 绕过**。

六种标准动作（来自 `packages/harness-cli/src/types/profile.ts` 的 `HardFloorAction`）：

- `auto_push` — 禁止自动 push
- `force_push` — 禁止 force push
- `destructive_ops` — 禁止 rm -rf / DROP TABLE 等不可逆操作
- `auto_merge` — 禁止自动 merge PR
- `rewrite_history` — 禁止 git reset / rebase 改历史
- `network_install` — 禁止运行期 npm install 等外部下载

Example：company-mt 的 `auto_push` 在 hard_floor 里。用户跑 `/yolo` 也**不能**让它自动 push。

### Tier 2：per-invocation flag

- `/yolo` → request aggressive mode
- `/safe` → request conservative mode
- `/quick` / `/fix` / `/refactor` → task-type override + implies standard mode

### Tier 3：profile default

profile yaml 里的 `default_mode: conservative | standard | aggressive`。

- `personal`：默认 `standard`
- `company-mt`：默认 `conservative`
- `default`（兜底）：`conservative`

### Tier 4：built-in fallback

一切没定时 → `conservative`。

## Hard-floor vs Flag 冲突处理

当 `/yolo` 请求的 aggressive 动作在 hard_floor 里：

**必须 echo 一次**：

```
Requested: /yolo (aggressive)
Effective: company-safe (profile policy: auto_push=false, destructive_ops=false)
Reason: company-mt hard_floor blocks auto_push
```

**硬约束**：不允许静默降级（silent downgrade）。用户必须看到"你请求的动作被 profile policy 拒绝了"。

## Mode Echo Discipline

只在以下四个 transition 时 echo 一次 mode：

1. Profile detection（首次）
2. Flag override 生效
3. Fast-path 自动降级到 quick
4. Hard-floor vs flag 冲突

其他情况**保持静默**（user 已经知道 mode，不需要每回复重述）。

## 实现位置

- Profile schema 真源：`packages/harness-cli/src/types/profile.ts`（`HardFloorAction` / `AggressionMode`）
- Schema JSON：`packages/harness-cli/resources/schemas/profile.schema.json`
- 本 spec 来自：`docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md:72-89`
