# Hooks — Stop Hook 自适应阈值 + 跨工具 Hook 模板

> **Source of truth**: `packages/harness-cli/src/types/constants.ts` (`TASK_TYPES`) + `hooks/context-monitor.sh`。如本文档与代码不一致，以代码为准。

定义跨工具的 hook 契约：context monitor 自适应阈值（task_type 感知）+ 7 类 hook 的标准模板。各工具 wrapper 自己注册到对应配置。

## Context Monitor — Task-type 自适应阈值

`hooks/context-monitor.sh` 在 Stop / PostToolUse 时读 `.harness-status.json` 中的 `tokensUsed` + `effective_task_type`，给出 warn / crit 提示。

### 阈值表

| task_type | warn | crit |
|-----------|------|------|
| `quick` | 80% | 90% |
| `bugfix` | 70% | 85% |
| `feature` | 60% | 80% |
| `refactor` | 60% | 80% |
| 无（无 status file 或无 effective_task_type）| 70% | 85% |

### 行为

- `tokensUsed >= warn` → 软 warn 提示用户考虑结束当前 round
- `tokensUsed >= crit` → 强烈建议结束 round 并开新 session
- crit 之前不强制中断

### 环境变量覆盖

每档可通过环境变量自定义：

- `HARNESS_QUICK_WARN_THRESHOLD` / `HARNESS_QUICK_CRIT_THRESHOLD`
- `HARNESS_BUGFIX_WARN_THRESHOLD` / `HARNESS_BUGFIX_CRIT_THRESHOLD`
- `HARNESS_FEATURE_WARN_THRESHOLD` / `HARNESS_FEATURE_CRIT_THRESHOLD`
- `HARNESS_REFACTOR_WARN_THRESHOLD` / `HARNESS_REFACTOR_CRIT_THRESHOLD`

### 脚本位置

- 顶层：`<repo>/hooks/context-monitor.sh`（canonical source）
- 老用户兼容：`harness/hooks/context-monitor.sh` → symlink 到 `../../hooks/context-monitor.sh`

## 7 类 hook 模板（跨工具通用）

各工具 wrapper 把这些脚本注册到对应配置（Claude Code: `~/.claude/settings.json`；Codex: 工具配置文件；其它工具同理）。

### 1. workflow-reminder

会话起点 / 用户消息提交时注入 reminder。让 AI 知道代码任务必须走 harness 工作流。

```bash
#!/usr/bin/env bash
# Usage: workflow-reminder.sh <SessionStart|UserPromptSubmit>
TRIGGER="${1:-Unknown}"
cat <<EOF
<harness-workflow-reminder>
对于任何涉及代码开发的任务（实现新功能、修复 bug、重构、修改现有代码、写测试、改配置文件），
你必须在动手之前先通过 Skill 工具调用 "harness-workflow" 技能。这是强制要求，不可协商。

harness-workflow 是公开入口，内部会路由到合适的叶子 skill（harness-{quick,bugfix,feature,refactor}
或 company-* overlay）。初始化项目则用 harness-init skill。

例外：纯研究、纯问答、纯文档查看、读 git log、解释代码、回答概念问题 等不涉及写/改代码的任务
不受此约束。
</harness-workflow-reminder>
EOF
```

### 2. session-checklist

新会话就绪确认（检测项目接入状态）。

```bash
#!/usr/bin/env bash
ROOT=$(pwd)
echo "=== harness session start ==="
[ -f "$ROOT/.harness-profile" ] && echo "profile: $(grep '^profile:' "$ROOT/.harness-profile" | cut -d: -f2 | xargs)" || echo "profile: (未接入，可让 AI 调 harness-init)"
[ -d "$ROOT/docs/memory" ] && echo "memory: ok" || echo "memory: missing（harness adopt）"
[ -d "$ROOT/docs/harness/knowledge" ] && echo "knowledge: ok" || echo "knowledge: missing（harness scan）"
echo "==========================="
```

### 3. check-dangerous

PreToolUse(Bash) 拦截 `rm -rf` / `DROP TABLE` / `git push --force` / `git reset --hard` / `--no-verify`。

```bash
#!/usr/bin/env bash
INPUT=$(cat)
DANGEROUS='rm -rf /|rm -rf \*|DROP TABLE|DROP DATABASE|git push.*--force|git reset --hard (origin|main|master|HEAD~)|--no-verify'
if echo "$INPUT" | grep -qiE "$DANGEROUS"; then
  echo "BLOCK: dangerous operation matched pattern. Ask user for explicit confirmation." >&2
  exit 2
fi
exit 0
```

### 4. check-secrets

PreToolUse(Edit|Write) 拦截硬编码 API key / 密码。

```bash
#!/usr/bin/env bash
INPUT=$(cat)
SECRETS='(api[_-]?key|secret|password|token)\s*[:=]\s*["'\'']?[A-Za-z0-9_\-]{20,}'
if echo "$INPUT" | grep -qiE "$SECRETS"; then
  echo "BLOCK: possible hardcoded secret detected. Use env var or secrets manager." >&2
  exit 2
fi
exit 0
```

### 5. post-edit-reminder

PostToolUse(Edit|Write) 检测 inline style / 硬编码色值（软 warn）。

```bash
#!/usr/bin/env bash
INPUT=$(cat)
if echo "$INPUT" | grep -qE 'style=["'\''][^"'\'']+["'\'']|#[0-9A-Fa-f]{3,6}\b'; then
  echo "WARN: inline style or hardcoded color detected; consider design tokens" >&2
fi
exit 0
```

### 6. pre-compact-reminder

PreCompact 提示保存重要 context。

```bash
#!/usr/bin/env bash
cat <<EOF
<compact-reminder>
即将压缩 context。如有 Round 进度 / 未提交代码 / 未写入 STATE.json 的状态，请先：
  1. git add + commit 未保存代码
  2. 更新 docs/STATE.json 的 currentRound + completedRounds
  3. 追加 docs/WALKTHROUGH.md 本轮摘要
</compact-reminder>
EOF
```

### 7. heartbeat-check

PostToolUse 检测 `.harness-status.json` 存在但无 `cronJobId` → 警告 AI 立即创建心跳（XL Round 实时监控）。

```bash
#!/usr/bin/env bash
STATUS_FILE=".harness-status.json"
if [ -f "$STATUS_FILE" ]; then
  CRON_ID=$(grep -oE '"cronJobId"\s*:\s*"[^"]*"' "$STATUS_FILE" | cut -d'"' -f4)
  if [ -z "$CRON_ID" ]; then
    cat <<EOF >&2
<heartbeat-warning>
.harness-status.json 存在但 cronJobId 字段为空 / 不存在。
若当前处于 L/XL 级 Round 中，应立即创建心跳（频率参考 monitoring 文档）。
</heartbeat-warning>
EOF
  fi
fi
exit 0
```

### 8. context-monitor（task-type 自适应，见上文）

Stop / PostToolUse 触发，按 `effective_task_type` 选阈值。

## 注册到工具

各工具 wrapper 自己处理注册：

- **Claude Code**：`~/.claude/settings.json` 的 `hooks` 段（PreToolUse / PostToolUse / SessionStart / UserPromptSubmit / PreCompact）
- **Codex**：工具配置文件 hooks 段
- **其它工具**：同义机制

跨工具的核心约束是：**hook 脚本本身**是契约（输入格式 / 退出码），各工具只是触发器。

## Hook 退出码契约

| 退出码 | 含义 |
|--------|------|
| `0` | 通过 |
| `2` | BLOCK（前置 hook 用，工具应中止操作） |
| `1` 或其它 | 错误（工具自决是否继续） |

stderr 输出会被工具显示给用户 / AI；stdout 通常被忽略（reminder 类 hook 例外，输出会被 prepend 到 context）。

## 三层触发保障

- **会话起点 hook**：注入 reminder，硬保障
- **项目入口文件规则**：`CLAUDE.md`（或工具同义入口）的「工作流规则」段，软保障
- **harness doctor 自动 adopt 检测**：`harness doctor` 报 `no-profile-marker` warn 时引导用户接入

## 实现位置

- Canonical 脚本：`hooks/context-monitor.sh`
- 老路径 symlink：`harness/hooks/context-monitor.sh`
- 阈值常量：`packages/harness-cli/src/types/constants.ts` (`TASK_TYPES`)
- 各工具注册：见各工具的安装脚本
