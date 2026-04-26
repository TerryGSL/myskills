#!/usr/bin/env bash
# UserPromptSubmit hook — 每条用户消息前注入 harness 三层路由强制提醒
# 完整规则在 ~/.claude/skills/harness-workflow/session-init-prompt.txt（SessionStart 已注入）
# 这里只放精简版强提醒，避免重复整段长文本浪费 token

cat <<'EOF'
[HARNESS-ROUTER] 处理这条消息前必走三层判断（禁止跳层）：

L0 task-dispatcher  — 消息含 ≥2 独立子任务 → Skill(task-dispatcher) 派 sub-agent 并行；单任务 → 进 L1
L1 入口分发：
  代码任务（做/加/修/改/实现/重构/优化/debug 等）→ Skill(harness-workflow)
  生命周期（接入/初始化/维护/扫描/install/doctor）→ `harness <cmd>` 或 --flag passthrough
  纯查询/解释/读代码          → 直接答，不进 L1
L2/L3 自动派发到 leaf skill   → harness route CLI 或 profile-entry markdown 决定 quick/bugfix/feature/refactor

铁律：动业务代码前必须 Skill(harness-workflow)；连续 3+ Bash 前必须 Skill(task-dispatcher) 评估分解。
EOF
