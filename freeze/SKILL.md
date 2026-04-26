---
name: freeze
version: 0.1.0
description: |
  Restrict file edits to a specific directory for the session. Blocks Edit and
  Write outside the allowed path. Use when debugging to prevent accidentally
  "fixing" unrelated code, or when you want to scope changes to one module.
  Use when asked to "freeze", "restrict edits", "only edit this folder",
  or "lock down edits". (gstack)
triggers:
  - freeze edits to directory
  - lock editing scope
  - restrict file changes
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
hooks:
  PreToolUse:
    - matcher: "Edit"
      hooks:
        - type: command
          command: "bash ${CLAUDE_SKILL_DIR}/bin/check-freeze.sh"
          statusMessage: "Checking freeze boundary..."
    - matcher: "Write"
      hooks:
        - type: command
          command: "bash ${CLAUDE_SKILL_DIR}/bin/check-freeze.sh"
          statusMessage: "Checking freeze boundary..."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

> **Vendored from gstack@ed1e4be2 (2026-04-26)**.
> Path references rewritten to harness-native locations (state files now under `~/.harness/safety/` instead of the upstream-default state directory)
> Originally lived in gstack submodule; now part of harness namespace.
> Upgrades to upstream are manual: re-clone gstack temporarily, diff, sync changes if relevant.

> **Harness governance note**：当本仓库的 active profile 在 `hard_floor` 列表里含
> `destructive_ops` / `rewrite_history` / `auto_push` / `force_push` 时，本 skill 的
> "可 override 警告" 行为**失效**——hard_floor 优先级最高（参 `harness-common/contracts/hard-floor-enforcement.md`）。
> 命中 hard_floor 的操作直接 REFUSE，不再询问 / 不可被 flag 绕过。
> 本 skill 的 override 通道仅在 hard_floor **不含**对应 flag 时生效。

# /freeze — 编辑边界锁定

把文件编辑锁在指定目录里。任何 Edit / Write 操作只要 file_path 不在允许的目录下，
就会被**直接 block**（不是仅警告）。

```bash
mkdir -p ~/.harness/safety/analytics
echo '{"skill":"freeze","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","repo":"'$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")'"}'  >> ~/.harness/safety/analytics/skill-usage.jsonl 2>/dev/null || true
```

## 启动流程

问用户要锁定到哪个目录。用 AskUserQuestion：

- 问题："要把编辑锁在哪个目录？该目录之外的文件会被 block。"
- 文本输入（非选择题）——用户输入路径。

拿到用户给的路径后：

1. 解析为绝对路径：
```bash
FREEZE_DIR=$(cd "<user-provided-path>" 2>/dev/null && pwd)
echo "$FREEZE_DIR"
```

2. 确保路径以 `/` 结尾，写入 freeze 状态文件：
```bash
FREEZE_DIR="${FREEZE_DIR%/}/"
STATE_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.harness/safety}"
mkdir -p "$STATE_DIR"
echo "$FREEZE_DIR" > "$STATE_DIR/freeze-dir.txt"
echo "Freeze boundary set: $FREEZE_DIR"
```

告诉用户："编辑现在锁定在 `<path>/`。该目录之外的 Edit / Write 都会被 block。
要换边界，重新跑 `/freeze`；要解除，跑 `/unfreeze` 或结束会话。"

## 工作原理

hook 从 Edit/Write 的 tool input JSON 里读 `file_path`，检查路径是否以 freeze 目录开头。
不是 → 返回 `permissionDecision: "deny"`，操作被 block。

freeze 边界通过状态文件在 session 内持久化。hook 在每次 Edit/Write 调用时读取一次。

## 注意

- freeze 目录尾部强制 `/`，避免 `/src` 误匹配 `/src-old`
- 只对 Edit / Write 生效——Read / Bash / Glob / Grep 不受影响
- 防的是**误编辑**，不是安全边界——`sed` 之类的 bash 命令仍可改边界外文件
- 关闭：跑 `/unfreeze` 或结束会话
