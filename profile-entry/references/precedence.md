# Precedence 契约 — Aggression Mode 解析规则

**角色**：定义 aggression mode 的解析优先级链，列出 hard_floor 可约束的操作项，给出 flag 清单与三维正交表，说明冲突公告格式。

**被引用自**：[../SKILL.md](../SKILL.md) Step 4

Single source of truth for how profile-entry resolves `mode` when multiple signals disagree.

---

## 硬规则（Single Precedence Rule）

```
profile hard_floor policy
  >  per-invocation flag (/yolo | /safe)
  >  profile config default_mode
  >  built-in conservative fallback
```

**解读**：
- **profile hard_floor**（最高）：合规硬底。profile 作者明确禁止的操作，任何 flag 都无法覆盖。
- **调用 flag**：用户在本次调用中显式传入的 `/yolo` / `/safe` 等 flag，覆盖 profile 默认，但受 hard_floor 约束。
- **profile default_mode**：profile 配置文件中的 `default_mode` 字段，无 flag 时生效。
- **内置 conservative**（最低兜底）：若 profile 未配置 `default_mode`，则自动使用最保守模式。

### 为什么 hard_floor 高于 flag

公司 profile 的 `auto_push=false` 是**合规硬底**，不是偏好设置。团队代码审查流程、CI/CD 权限控制、合规审计都依赖"永不自动 push"这一假设。若 `/yolo` 能绕过，则合规保证形同虚设。

**设计原则**：flag 表达用户**意图**，hard_floor 表达**不可让渡的约束**。两者不冲突时 flag 生效；冲突时 hard_floor 胜出，且必须公开。

---

## 逐 Tier 解释

### Tier 1：`hard_floor`（最高，永远禁止）

`profile.hard_floor` 列出的动作**永远禁止执行**，**无法被任何 flag 绕过**。

六种标准动作（来自 `packages/harness-cli/src/types/profile.ts` 的 `HardFloorAction`）：

| 操作项 | 被禁止的具体行为 |
|--------|-----------------|
| `auto_push` | 执行 `git push`（无论是否 force），推送前必须人工确认 |
| `force_push` | 执行 `git push --force` 或 `--force-with-lease` |
| `destructive_ops` | 删除文件（`rm -rf`）、数据库 DROP、不可逆 truncate |
| `auto_merge` | 自动合并 Pull Request（包括 squash merge、rebase merge） |
| `rewrite_history` | `git reset` / `rebase` 等改写历史 |
| `network_install` | 运行期 `npm install` / `pip install` 等外部下载 |

**说明**：`auto_push` 已覆盖普通 push；`force_push` 单独列出是因为某些 profile 可能允许普通 push 但禁止 force push。

Example：company-mt 的 `auto_push` 在 hard_floor 里。用户跑 `/yolo` 也**不能**让它自动 push。

### Tier 2：per-invocation flag

| Flag | 影响维度 | 解析后效果 |
|------|----------|-----------|
| `/yolo` | aggression mode | 请求 `aggressive` 模式（受 hard_floor 约束） |
| `/safe` | aggression mode | 请求 `conservative` 模式 |
| `/quick` | task_type + mode | task_type = `quick`，隐含 `standard` mode |
| `/fix` | task_type + mode | task_type = `bugfix`，隐含 `standard` mode |
| `/refactor` | task_type + mode | task_type = `refactor`，隐含 `standard` mode |

**注意**：task_type flag（`/quick` `/fix` `/refactor`）优先级高于 fast-path 自动检测，但不影响 aggression mode 解析（mode 仍按 precedence 链独立计算）。

### Tier 3：profile default

profile yaml 里的 `default_mode: conservative | standard | aggressive`。

- `personal` / `harness`：默认 `standard`
- `company-mt`：默认 `conservative`
- `default`（兜底）：`conservative`

### Tier 4：built-in fallback

一切没定时 → `conservative`。

---

## 三维正交完整表格

三个维度**彼此独立解析**：Profile × Task type × Aggression mode。

### Profile × Aggression mode

| Profile | default_mode | hard_floor | /yolo 效果 | /safe 效果 |
|---------|-------------|------------|-----------|-----------|
| `default` | conservative | 无 | aggressive ✓ | conservative |
| `harness` | standard | 无 | aggressive ✓ | conservative |
| `company-*` | conservative | auto_push, force_push, destructive_ops, auto_merge | 公告降级，effective = conservative | conservative |

### Task type × Aggression mode × 行为差异

| Task type | conservative | standard | aggressive |
|-----------|-------------|----------|-----------|
| `quick` | 直接改 + 等用户确认再 commit | 直接改 + commit | 直接改 + commit + 可选 push（若无 auto_push 限制） |
| `bugfix` | investigate 后等确认，不跑测试 fix | investigate + fix + 回归测试 + commit | 同 standard + 自动运行测试 + commit |
| `feature` | 每 stage 等人工确认 | 完整 8-Stage，关键节点确认 | 完整 8-Stage，非破坏性步骤自动执行 |
| `refactor` | 每步等确认，不执行 | baseline → 增量 commit，每批等确认 | baseline → 增量 commit，自动验证 |

### Profile × Task type × leaf sub-skill（harness profile 示例）

| Profile \ Task type | quick | bugfix | feature | refactor |
|--------------------|-------|--------|---------|----------|
| `default` | harness-quick | harness-bugfix | harness-feature | harness-refactor |
| `harness` | harness-quick | harness-bugfix | harness-feature | harness-refactor |
| `company-*` | company-quick | company-bugfix | company-feature | company-refactor |

---

## Hard_floor 冲突公告格式

当调用 flag 请求的操作被 hard_floor 约束时，**必须**在响应第一行输出以下格式（**永不静默降级**）：

```
Requested: /yolo (aggressive)
Effective: company-safe (profile policy: auto_push=false, destructive_ops=false)
Reason: company-mt profile hard-floor blocks auto_push
```

**格式规则**：
- `Requested`：用户传入的原始 flag（含括号里的请求 mode）
- `Effective`：实际生效的 mode 名称 + 触发的 hard_floor 条目（括号内）
- `Reason`：固定写明 "<profile 名> profile hard-floor blocks <action>"
- 三行作为一个代码块输出，置于响应最顶部
- 后续 turn 不重复此公告，除非用户再次传入被限制的 flag

**硬约束**：不允许静默降级（silent downgrade）。用户必须看到"你请求的动作被 profile policy 拒绝了"。

## Mode Echo Discipline

只在以下四个 transition 时 echo 一次 mode（其余 turn 保持静默）：

1. Profile detection（首次进入该 profile）
2. Flag override 生效（用户传入任何 flag 时）
3. Fast-path 自动降级到 quick（task_type 被自动降为 quick 时）
4. Hard-floor vs flag 冲突（flag 被 hard_floor 压制时）

其他情况**保持静默**（user 已经知道 mode，不需要每回复重述）。

---

## 实现位置

- Profile schema 真源：`packages/harness-cli/src/types/profile.ts`（`HardFloorAction` / `AggressionMode`）
- Schema JSON：`packages/harness-cli/resources/schemas/profile.schema.json`
- 本 spec 来自：`docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md:72-89`
