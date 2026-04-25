# Hooks / MCP / Plugins — 全局基础设施模板

Harness 工作流所需的全局配置（每用户一次配好，跨项目共享）。本文件是 canonical 源。

## 目录

- [settings.json 完整配置](#settingsjson)
- [7 个 hook 脚本](#hook-scripts)
- [MCP 配置](#mcp-servers)
- [3 个插件](#plugins)
- [触发保障三层](#三层触发保障)

---

## settings.json

`~/.claude/settings.json` 的 hooks 段：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          { "type": "command", "command": "node \"/Users/<you>/.claude/plugins/cache/openai-codex/codex/*/scripts/session-lifecycle-hook.mjs\" SessionStart", "timeout": 5 },
          { "type": "command", "command": "bash ~/.claude/hooks/harness-workflow-reminder.sh SessionStart", "timeout": 5 },
          { "type": "command", "command": "bash ~/.claude/hooks/session-checklist.sh", "timeout": 5 }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/hooks/harness-workflow-reminder.sh UserPromptSubmit", "timeout": 5 }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/hooks/check-dangerous.sh", "timeout": 5 }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/hooks/check-secrets.sh", "timeout": 5 }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/hooks/post-edit-reminder.sh", "timeout": 5 }
        ]
      },
      {
        "matcher": "Bash|Edit|Write",
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/hooks/heartbeat-check.sh", "timeout": 5 }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/hooks/pre-compact-reminder.sh", "timeout": 5 }
        ]
      }
    ]
  }
}
```

---

## Hook Scripts

所有脚本放 `~/.claude/hooks/`，`chmod +x` 给执行权。

### 1. `harness-workflow-reminder.sh`

给 UserPromptSubmit + SessionStart 注入 reminder，确保 AI 知道用 harness-workflow。

```bash
#!/usr/bin/env bash
# Usage: harness-workflow-reminder.sh <UserPromptSubmit|SessionStart>
TRIGGER="${1:-Unknown}"
cat <<EOF
<harness-workflow-reminder>
对于任何涉及代码开发的任务（实现新功能、修复 bug、重构、修改现有代码、写测试、改配置文件），
你必须在动手之前先通过 Skill 工具调用 "harness-workflow" 技能。这是强制要求，不可协商。

harness-workflow 是公开入口，内部会路由到合适的叶子 skill（harness-{quick,bugfix,feature,refactor}
或 company-* overlay）。初始化项目则用 harness-init skill（team-init 作向后兼容别名）。

例外：纯研究、纯问答、纯文档查看、读 git log、解释代码、回答概念问题 等不涉及写/改代码的任务
不受此约束。
</harness-workflow-reminder>
EOF
```

### 2. `session-checklist.sh`

新会话就绪确认（检测项目是否已接入 harness）。

```bash
#!/usr/bin/env bash
# Session startup summary
ROOT=$(pwd)
echo "=== harness session start ==="
[ -f "$ROOT/.harness-profile" ] && echo "profile: $(grep '^profile:' "$ROOT/.harness-profile" | cut -d: -f2 | xargs)" || echo "profile: (未接入，可让 AI 调 harness-init)"
[ -d "$ROOT/docs/memory" ] && echo "memory: ✓" || echo "memory: ✗（harness adopt）"
[ -d "$ROOT/docs/harness/knowledge" ] && echo "knowledge: ✓" || echo "knowledge: ✗（harness scan）"
echo "==========================="
```

### 3. `check-dangerous.sh`

拦截 `rm -rf`、`DROP TABLE`、`git push --force`、`git reset --hard` 等不可逆 Bash。

```bash
#!/usr/bin/env bash
# Block dangerous operations before execution
INPUT=$(cat)
DANGEROUS='rm -rf /|rm -rf \*|DROP TABLE|DROP DATABASE|git push.*--force|git reset --hard (origin|main|master|HEAD~)|--no-verify'
if echo "$INPUT" | grep -qiE "$DANGEROUS"; then
  echo "BLOCK: dangerous operation matched pattern. Ask user for explicit confirmation." >&2
  exit 2
fi
exit 0
```

### 4. `check-secrets.sh`

拦截 Edit/Write 时硬编码的 API key / 密码。

```bash
#!/usr/bin/env bash
# Block hardcoded credentials on Edit/Write
INPUT=$(cat)
SECRETS='(api[_-]?key|secret|password|token)\s*[:=]\s*["'\'']?[A-Za-z0-9_\-]{20,}'
if echo "$INPUT" | grep -qiE "$SECRETS"; then
  echo "BLOCK: possible hardcoded secret detected. Use env var or secrets manager." >&2
  exit 2
fi
exit 0
```

### 5. `post-edit-reminder.sh`

PostToolUse(Edit|Write) 检测 inline style / 硬编码色值 → 软 warning。

```bash
#!/usr/bin/env bash
# Warn on inline style / hardcoded color (non-blocking)
INPUT=$(cat)
if echo "$INPUT" | grep -qE 'style=["'\''][^"'\'']+["'\'']|#[0-9A-Fa-f]{3,6}\b'; then
  echo "WARN: inline style or hardcoded color detected; consider design tokens" >&2
fi
exit 0
```

### 6. `pre-compact-reminder.sh`

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

### 7. `heartbeat-check.sh`

PostToolUse(Bash|Edit|Write) 检测 `.harness-status.json` 存在但无 `cronJobId` → 警告
AI 立即 CronCreate（XL Round 实时监控）。

```bash
#!/usr/bin/env bash
# Ensure heartbeat is armed during active Round
STATUS_FILE=".harness-status.json"
if [ -f "$STATUS_FILE" ]; then
  CRON_ID=$(grep -oE '"cronJobId"\s*:\s*"[^"]*"' "$STATUS_FILE" | cut -d'"' -f4)
  if [ -z "$CRON_ID" ]; then
    cat <<EOF >&2
<heartbeat-warning>
.harness-status.json 存在但 cronJobId 字段为空 / 不存在。
若当前处于 L/XL 级 Round 中，应立即用 CronCreate 工具创建心跳，
频率参考 harness-workflow/references/monitoring.md（Stage 3 并行 agent 每 2min，其他 5min）。
</heartbeat-warning>
EOF
  fi
fi
exit 0
```

### 8. `context-monitor.sh`

Stop / PostToolUse hook：根据 `.harness-status.json` 中的 `tokensUsed` 与 `effective_task_type`，按任务类型自适应阈值给出 ⚠️ warn / ⛔ crit 提示，建议在 crit 时结束 round 并开启新 session。

| task_type | warn | crit |
|-----------|------|------|
| quick     | 80%  | 90%  |
| bugfix    | 70%  | 85%  |
| feature   | 60%  | 80%  |
| refactor  | 60%  | 80%  |
| 无（无 status file 或无 effective_task_type）| 70% | 85% |

每档可通过环境变量覆盖（HARNESS_QUICK_CRIT_THRESHOLD 等）。

SCRIPT_PATH 固定为 `$REPO_ROOT/hooks/context-monitor.sh`（注册到 `~/.claude/settings.json` 的命令路径）。`harness/hooks/context-monitor.sh` 是 symlink → `../../hooks/context-monitor.sh`，老用户既有注册路径继续可用。

### （附）`session-init-prompt.txt`

**不是 hook script**，是 SessionStart 注入的 prompt 片段（由上面 `harness-workflow-reminder.sh SessionStart` 输出的 reminder 内容）。不需要单独维护文件 —— reminder 脚本就是它的 source of truth。

---

## MCP Servers

`~/.claude/mcp.json`：

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--browser", "chromium", "--headless"]
    }
  }
}
```

用途：
- `context7` — 拉取最新上游文档（React / Next / Spring / etc）时给 AI 补最新 API
- `playwright` — 前端 QA 自动化（Stage 6 gstack / team-qa 调用）

---

## Plugins

| 插件 | 必需性 | Marketplace | 工作流用途 |
|------|-------|-------------|-----------|
| `superpowers@claude-plugins-official` | **必需** | Anthropic 官方 | Stage 2 writing-plans + Stage 3-4 subagent-driven-development + code-review |
| `codex@openai-codex` | 可选 | openai/codex-plugin-cc | Stage 5 跨模型 Code Review |
| `claude-mem@thedotmack` | **可选 acceleration layer** | thedotmack/claude-mem | 每 Round 在 Claude Code 内写 observation 加速 mem-search 回溯（仅 Claude Code 体系内有效）；项目级 memory 已通过 `docs/memory/*.md` 跨工具持久化，不依赖此插件 |

### Codex Setup

装了 codex 插件后，每个新环境还要跑一次 setup 确认登录：

```bash
node "/Users/<you>/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs" setup --json
```

期望返回 `"ready": true` + `"auth": { "loggedIn": true }`。如未登录 → 手工跑 `codex login`。

---

## 三层触发保障

1. **SessionStart Hook（硬保障）** — `harness-workflow-reminder.sh SessionStart` 在每个新
   会话起点注入 reminder，AI 读到后知道代码任务必须调 harness-workflow skill
2. **CLAUDE.md 规则（软保障）** — 项目根 `CLAUDE.md` 的"工作流规则"段（由 harness-init 投放
   的 `CLAUDE.md.template` 生成时含两个 managed block：`harness-knowledge:*` + `harness-profile:*`）
   强化上述约束
3. **harness doctor 自动 adopt 检测（第三层）** —— 当 harness-workflow / harness-init 在一个
   没 `.harness-profile` 的项目里被触发：
   - harness-init 识别出缺 marker → 提示用户选 preset 后跑 `harness init` / `adopt`
   - harness-workflow 若在无 profile 项目里被直接触发（代码任务）→ 先建议用户跑 harness-init
     再重试（否则 profile-entry 无 marker + 无 matcher 命中会落到 `default` profile，失去
     项目特定的 hard_floor）
   - `harness doctor` 报 `no-profile-marker` warn（非硬 abort，但告知用户未接入）

三层协同确保用户不论从哪个触发点进入（肌肉记忆 `/harness-workflow`、SessionStart hook
注入、CLAUDE.md 规则、甚至冷启动的空项目）都能正确路由或被导航到初始化入口。
