# Hook 模板与 Settings 配置

## settings.json hooks 注册

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/check-dangerous.sh" }] },
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/check-secrets.sh" }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/post-edit-reminder.sh" }] }
    ],
    "PreCompact": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/pre-compact-reminder.sh" }] }
    ],
    "SessionStart": [
      { "matcher": "startup|clear|compact", "hooks": [
        { "type": "command", "command": "node \"~/.claude/plugins/codex/scripts/session-lifecycle-hook.mjs\" SessionStart", "timeout": 5 }
      ]}
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node \"~/.claude/plugins/codex/scripts/stop-review-gate-hook.mjs\"", "timeout": 900 }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/post-edit-reminder.sh" }] },
      { "matcher": "Bash|Edit|Write", "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/heartbeat-check.sh", "timeout": 5 }] }
    ],
    "Notification": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "osascript -e 'beep'" }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "node \"~/.claude/plugins/codex/scripts/session-lifecycle-hook.mjs\" SessionEnd", "timeout": 5 }] }
    ]
  },
  "statusLine": { "type": "command", "command": "ccusage statusline" },
  "enabledPlugins": {
    "claude-mem@thedotmack": true,
    "codex@openai-codex": true,
    "superpowers@claude-plugins-official": true
  }
}
```

注意：
- `SessionStart / Stop / SessionEnd` 由 codex 插件管理
- `statusLine` 需先安装 `ccusage`（`npm i -g ccusage`）
- `Notification` 仅 macOS；Linux 替换为 `notify-send "Claude done"`

---

## check-dangerous.sh

```bash
#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('command',''))" 2>/dev/null)
[ -z "$COMMAND" ] && exit 0

BLOCKED=0; REASON=""

# rm -rf（非 /tmp/）
if echo "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*)\s+'; then
  if ! echo "$COMMAND" | grep -qE 'rm\s+.*\s+/tmp/'; then
    BLOCKED=1; REASON="检测到 rm -rf 操作（非 /tmp 目录）"
  fi
fi
# DROP/TRUNCATE
echo "$COMMAND" | grep -qiE '(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)' && { BLOCKED=1; REASON="检测到数据库破坏性操作"; }
# force push 到主干
if echo "$COMMAND" | grep -qE 'git\s+push.*--force|git\s+push.*-f(\s|$)'; then
  echo "$COMMAND" | grep -qE '(main|master|develop|release)' && { BLOCKED=1; REASON="检测到 force push 到主干分支"; }
fi
# git reset --hard
echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard' && { BLOCKED=1; REASON="检测到 git reset --hard"; }
# 覆写关键配置文件
echo "$COMMAND" | grep -qE '>\s*(CLAUDE\.md|DESIGN\.md|docs/STATE\.json)' && { BLOCKED=1; REASON="检测到直接覆写关键文件"; }

if [ $BLOCKED -eq 1 ]; then
  echo "╔══════════════════════════════════════╗"
  echo "║  HOOK BLOCKED — $REASON"
  echo "║  命令: $(echo "$COMMAND" | head -c 60)"
  echo "╚══════════════════════════════════════╝"
  exit 2
fi
exit 0
```

## check-secrets.sh

```bash
#!/bin/bash
INPUT=$(cat)
CONTENT=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('new_string',d.get('content','')))" 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null)
echo "$FILE_PATH" | grep -qE '\.(test|spec)\.(ts|js|tsx|jsx)$|\.example$|\.sample$' && exit 0

BLOCKED=0; REASON=""
echo "$CONTENT" | grep -qE '(sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|ghp_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9_-]{20,})' && { BLOCKED=1; REASON="疑似硬编码 API Key"; }
if echo "$FILE_PATH" | grep -qvE '\.(env|env\.|example)'; then
  echo "$CONTENT" | grep -qiE 'password\s*[:=]\s*["\x27][^"\x27]{6,}["\x27]' && { BLOCKED=1; REASON="疑似硬编码密码"; }
fi

if [ $BLOCKED -eq 1 ]; then
  echo "╔══════════════════════════════════════╗"
  echo "║  HOOK BLOCKED — $REASON"
  echo "║  文件: $(basename "$FILE_PATH")"
  echo "╚══════════════════════════════════════╝"
  exit 2
fi
exit 0
```

## post-edit-reminder.sh

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null)
[ -z "$FILE_PATH" ] && exit 0
echo "$FILE_PATH" | grep -qE '\.(tsx|jsx)$' || exit 0

CONTENT=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('new_string',d.get('content','')))" 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

WARNINGS=""
echo "$CONTENT" | grep -qE 'style=\{\{' && WARNINGS="${WARNINGS}\n  - inline style → Tailwind"
echo "$CONTENT" | grep -qE 'className=.*#[0-9a-fA-F]{3,8}' && WARNINGS="${WARNINGS}\n  - 硬编码色值 → 主题 token"
echo "$CONTENT" | grep -qE '(bg|text|border|ring)-\[#[0-9a-fA-F]' && WARNINGS="${WARNINGS}\n  - Tailwind 任意值色值 → 主题 token"

if [ -n "$WARNINGS" ]; then
  echo "╔══════════════════════════════════════╗"
  echo -e "║  NOTICE — 前端质量$WARNINGS"
  echo "║  参考: docs/DESIGN.md"
  echo "╚══════════════════════════════════════╝"
fi
exit 0
```

## pre-compact-reminder.sh

```bash
#!/bin/bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ⚠️  上下文即将压缩 — 检查清单                       ║"
echo "║  1. 产物已写入文件？                                 ║"
echo "║  2. docs/STATE.json 已更新？                         ║"
echo "║  3. WALKTHROUGH.md 已追加？                          ║"
echo "║  4. claude-mem observation 已保存？                  ║"
echo "╚══════════════════════════════════════════════════════╝"
exit 0
```

## session-checklist.sh

```bash
#!/bin/bash
echo '{"status":"ready"}'
exit 0
```
