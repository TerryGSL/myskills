#!/usr/bin/env bash
# UserPromptSubmit hook — 每条用户消息前注入 harness 三层路由强制提醒
# 完整规则在 ~/.claude/skills/harness-workflow/session-init-prompt.txt（SessionStart 已注入）
# 这里只放精简版强提醒，避免重复整段长文本浪费 token

# 精简版（codex round 3 反馈：完整提示已在 SessionStart 注入，每条重复浪费 token）
# 只保留路由分流 + hard gate 提醒（约 110 tokens）；详细规则查 [HARNESS]（SessionStart）
# Claude Code 的 UserPromptSubmit hook stdout 必须是 JSON。纯文本会触发
# "hook returned invalid user prompt submit JSON output"。
cat >/dev/null || true

python3 - <<'PY'
import json

context = """\
[HARNESS-ROUTER] L0 评估子任务数 → ≥2 先 Skill(task-dispatcher) / 单任务进 L1。
代码任务先 Skill(harness-workflow)；生命周期 `harness <cmd>`；纯查询直接答。
PreToolUse 硬拦：Edit/Write 没 Skill(harness-workflow) → 阻；Agent 没 Skill(task-dispatcher) → 阻。
"""

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": context,
    }
}, ensure_ascii=False))
PY
