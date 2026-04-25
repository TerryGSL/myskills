# Aggression Mode — conservative / standard / aggressive + Hard-floor 关系

> **Source of truth**: `packages/harness-cli/src/types/constants.ts` (`AGGRESSION_MODES`) + `resources/schemas/profile.schema.json` (`default_mode`)。如本文档与代码不一致，以代码为准。

aggression mode 是 leaf skill 的"激进度"刻度，控制询问粒度、自动 push、auto-fix retry 次数。**永远不能突破 hard_floor**。

## 三档定义

| Mode | 行为风格 | 询问频次 | Auto-fix retry | Push 行为 |
|------|---------|--------|---------------|----------|
| `conservative` | 保守 — 不破坏 + 多确认 | 凡有歧义就问 | 1 次 | LOW 也降级到 MEDIUM 询问 |
| `standard` | 默认 — 自治 + 关键节点确认 | 仅 L/XL 方向问一次 | spec 2 / codex 3 / qa 2 | 按 push-decision.md 三档决策 |
| `aggressive` | 激进 — 全自治 + 极少询问 | 仅 hard block 升级才问 | 加倍：spec 3 / codex 4 / qa 3 | LOW + MEDIUM 自动 push；HIGH 仍 REFUSE |

详见 [autonomy.md](autonomy.md) 的"自治决策树"和 [push-decision.md](push-decision.md) 的"Override flags"。

## 解析顺序

每轮的 `resolved_mode` 按以下顺序决定（先命中先决定）：

1. 显式 flag：`/safe` → conservative；`/yolo` → aggressive
2. marker 文件覆盖：`<repo>/.harness-profile` 含 `mode:` 字段
3. profile 默认：`profile.default_mode`
4. 兜底：`standard`

## Hard-floor 关系（核心约束）

aggression mode 只能在 **profile 允许范围内** 调高激进度。**hard_floor 永远胜过 mode**：

```
final_behavior = mode_default_behavior MINUS hard_floor_restrictions
```

例：

- profile = `company/acme`，`hard_floor: [auto_push, force_push]`
- 用户 `/yolo`（aggressive）→ 仍然不能 auto push（auto_push 在 hard_floor）
- aggressive 只影响其它非 hard_floor 维度（如 retry 次数、询问频次）

详见 [hard-floor-enforcement.md](hard-floor-enforcement.md)。

## 与 leaf skill 的接口

leaf skill 通过 `resolved_mode` 字段读取（输入契约一部分）。各 leaf 的行为差异举例：

| Leaf | conservative | standard | aggressive |
|------|--------------|---------|----------|
| harness-quick | 改完先让用户看 → 再 commit | 自动 commit；按 push-decision 决定 push | 自动 commit + 自动 push（除 hard_floor 约束） |
| harness-bugfix | 每个 hypothesis 失败都汇报 | 3 次 hypothesis 失败升级 | 5 次 hypothesis 失败升级 |
| harness-feature | Stage 0/1 多次问用户 | Stage 0/1 一次性问 L/XL 方向 | Stage 0/1 用合理默认值不问 |
| harness-refactor | baseline diff 每条都让用户看 | baseline 命中才汇报 | baseline 重大变化才汇报 |

## 不可调维度（即使 aggressive 也守住）

无论何种 mode，以下行为永远成立（hard floor 之外的"系统级"约束）：

- 不写 `secrets` / `.env`
- 不跳过 reviewer 硬门（见 [reviewer-gates.md](reviewer-gates.md)）
- 不绕过 strict-reviewer BLOCKED 状态
- 不修改 git history（rewrite_history 在 hard_floor 即使个人项目也通常包含）
- 不删未知文件

## 实现位置

- Constants：`packages/harness-cli/src/types/constants.ts` `AGGRESSION_MODES`
- Profile 字段：`profile.schema.json` `default_mode`
- 解析逻辑：`packages/harness-cli/src/commands/route.ts`（计划中）
- Routing 集成：见 [routing.md](routing.md)
