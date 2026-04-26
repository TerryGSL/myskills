#!/usr/bin/env bash
# UserPromptSubmit hook — 每条用户消息前注入 harness 三层路由强制提醒
# 完整规则在 ~/.claude/skills/harness-workflow/session-init-prompt.txt（SessionStart 已注入）
# 这里只放精简版强提醒，避免重复整段长文本浪费 token

cat <<'EOF'
[HARNESS-ROUTER] 每条消息必走三层判断。L0 评估每条都做（隐式即可）；
显式 Skill() 调用按下面命中条件触发。

L0 评估子任务数：
  ≥2 独立子任务  → 显式 Skill(task-dispatcher) 加载派发协议 → 派 sub-agent 并行
  单任务          → 跳过显式 task-dispatcher，进 L1

L1 入口分发（单任务时）：
  业务代码任务（做/加/修/改/实现/重构/优化/debug）→ 显式 Skill(harness-workflow)
  生命周期（接入/初始化/维护/扫描/install/doctor） → `harness <cmd>` 或 --flag
  纯查询/解释/读代码                              → 直接答，不进 L1

L2/L3 自动派发到 leaf skill → harness route CLI（Tier 1+2）或 profile-entry markdown（Tier 3）
                              → harness-{quick,bugfix,feature,refactor}

铁律（违反必须复盘）：
  ① 动业务代码前必须显式 Skill(harness-workflow)，跳层即违反
  ② ≥2 子任务必须显式 Skill(task-dispatcher)，跳过即违反（即使你"心里评估了"）
  ③ 连续 3+ Bash 前必须 Skill(task-dispatcher) 评估分解
EOF
