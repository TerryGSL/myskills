---
name: guard
version: 0.1.0
description: |
  Full safety mode: destructive command warnings + directory-scoped edits.
  Combines /careful (warns before rm -rf, DROP TABLE, force-push, etc.) with
  /freeze (blocks edits outside a specified directory). Use for maximum safety
  when touching prod or debugging live systems. Use when asked to "guard mode",
  "full safety", "lock it down", or "maximum safety". (gstack)
triggers:
  - full safety mode
  - guard against mistakes
  - maximum safety
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "bash ${CLAUDE_SKILL_DIR}/../careful/bin/check-careful.sh"
          statusMessage: "Checking for destructive commands..."
    - matcher: "Edit"
      hooks:
        - type: command
          command: "bash ${CLAUDE_SKILL_DIR}/../freeze/bin/check-freeze.sh"
          statusMessage: "Checking freeze boundary..."
    - matcher: "Write"
      hooks:
        - type: command
          command: "bash ${CLAUDE_SKILL_DIR}/../freeze/bin/check-freeze.sh"
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

# /guard — 完整安全模式

同时启用危险命令警告 + 目录级编辑边界。等价于 `/careful` + `/freeze` 一条命令开两层。

**依赖说明：** 本 skill 引用同级 `/careful` 和 `/freeze` 的 hook 脚本。
三个 skill 一起 vendor 在 myskills 顶层（`careful/`、`freeze/`、`guard/`），
通过 `harness install` symlink 任一个时另外两个会被自动带上。

```bash
mkdir -p ~/.harness/safety/analytics
echo '{"skill":"guard","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","repo":"'$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")'"}'  >> ~/.harness/safety/analytics/skill-usage.jsonl 2>/dev/null || true
```

## 启动流程

问用户要把编辑锁到哪个目录。用 AskUserQuestion：

- 问题："Guard 模式：编辑要锁在哪个目录？危险命令警告默认全开。该目录之外的文件会被 block。"
- 文本输入（非选择题）——用户输入路径。

拿到路径后：

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

告诉用户：
- "**Guard 模式已激活。** 两层防护同时在跑："
- "1. **危险命令警告** —— rm -rf / DROP TABLE / force-push 等执行前会提示（可覆盖）"
- "2. **编辑边界** —— 文件编辑锁定在 `<path>/`。该目录外的修改会被 block。"
- "解除编辑边界跑 `/unfreeze`；全部关闭直接结束会话。"

## 保护范围

危险命令完整模式表 + 安全放行清单见 `/careful`。
编辑边界的实现细节见 `/freeze`。
