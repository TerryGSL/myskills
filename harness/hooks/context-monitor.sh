#!/bin/bash
# context-monitor.sh — Stop Hook: monitors Claude session context usage and
# recommends skill re-injection when context is running high.
#
# requires: bash >= 3.2, python3 (for JSON parsing), realpath
#
# Hook type: PostToolUse / Stop
# Registration: see the settings.json snippet at the bottom of this file.
#
# Behaviour:
#   - Reads token usage estimate from .harness-status.json (or env vars)
#   - >70% + harness active  → suggest re-activating the relevant sub-skill
#   - >85% + feature stage   → strongly recommend ending the round + new session
#
# Exit 0 always so Claude sees the output but the hook never blocks the run.

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

# Default file locations (can be overridden by environment)
readonly STATUS_FILE="${HARNESS_STATUS_FILE:-.harness-status.json}"
readonly CONTEXT_LIMIT="${HARNESS_CONTEXT_LIMIT:-200000}"   # tokens, Sonnet/Opus default
# 阈值按 task_type 自适应（在主体逻辑里读取）
# 用户可通过环境变量覆盖（例：HARNESS_QUICK_CRIT_THRESHOLD=85）

# ANSI colours (disabled when not a TTY)
if [[ -t 1 ]]; then
  YELLOW="\033[1;33m"
  RED="\033[1;31m"
  CYAN="\033[1;36m"
  RESET="\033[0m"
else
  YELLOW="" RED="" CYAN="" RESET=""
fi

# ─── Helper: parse a key from the JSON status file ───────────────────────────
# Usage: json_get <file> <dotted.key>
# Returns empty string if key not found; uses python3 for reliability.
json_get() {
  local file="${1}"
  local key="${2}"
  python3 -c "
import json, sys
try:
    with open('${file}') as f:
        data = json.load(f)
    keys = '${key}'.split('.')
    val = data
    for k in keys:
        val = val[k]
    print(val)
except Exception:
    pass
" 2>/dev/null || true
}

# ─── Guard: status file must exist for this hook to do anything ──────────────
if [[ ! -f "${STATUS_FILE}" ]]; then
  # Harness not active — silent exit
  exit 0
fi

# ─── Guard: harness workflow must be in-flight (cronJobId present) ───────────
cron_job_id="$(json_get "${STATUS_FILE}" "cronJobId")"
if [[ -z "${cron_job_id}" ]]; then
  exit 0
fi

# ─── Read context usage ───────────────────────────────────────────────────────
# Priority: env var > status file field
if [[ -n "${CLAUDE_TOKENS_USED:-}" ]]; then
  tokens_used="${CLAUDE_TOKENS_USED}"
else
  tokens_used="$(json_get "${STATUS_FILE}" "tokensUsed")"
fi

# If we still have no number, nothing to check
if [[ -z "${tokens_used}" || ! "${tokens_used}" =~ ^[0-9]+$ ]]; then
  exit 0
fi

# Calculate percentage (integer arithmetic)
pct=$(( tokens_used * 100 / CONTEXT_LIMIT ))

# ─── Read current task context for targeted advice ───────────────────────────
effective_task_type="$(json_get "${STATUS_FILE}" "effective_task_type")"
current_phase="$(json_get "${STATUS_FILE}" "current_phase")"

# ─── Adaptive thresholds by task_type ─────────────────────────────────────────
# 用户可通过 env 覆盖（例：HARNESS_QUICK_CRIT_THRESHOLD=85）
case "${effective_task_type:-}" in
  quick)
    threshold_warn="${HARNESS_QUICK_WARN_THRESHOLD:-80}"
    threshold_crit="${HARNESS_QUICK_CRIT_THRESHOLD:-90}"
    ;;
  bugfix)
    threshold_warn="${HARNESS_BUGFIX_WARN_THRESHOLD:-70}"
    threshold_crit="${HARNESS_BUGFIX_CRIT_THRESHOLD:-85}"
    ;;
  feature|refactor)
    threshold_warn="${HARNESS_LONG_WARN_THRESHOLD:-60}"
    threshold_crit="${HARNESS_LONG_CRIT_THRESHOLD:-80}"
    ;;
  *)
    # 无 task_type — 保守默认（与 bugfix 同）
    threshold_warn="${HARNESS_DEFAULT_WARN_THRESHOLD:-70}"
    threshold_crit="${HARNESS_DEFAULT_CRIT_THRESHOLD:-85}"
    ;;
esac

# Map task_type → recommended skill to re-inject
recommend_skill() {
  case "${1:-}" in
    quick)    echo "harness-quick" ;;
    bugfix)   echo "harness-bugfix" ;;
    feature)  echo "harness-feature" ;;
    refactor) echo "harness-refactor" ;;
    *)        echo "profile-entry" ;;
  esac
}

# ─── Emit advice based on thresholds ─────────────────────────────────────────

if (( pct >= threshold_crit )); then
  echo -e ""
  echo -e "${RED}⛔ Context 使用已超 ${pct}%（临界：${threshold_crit}%）${RESET}"
  echo -e "${RED}强烈建议：结束当前 round，开启新 session。${RESET}"
  echo -e ""
  echo -e "${CYAN}在切换前请确认以下状态已保存：${RESET}"
  echo -e "  [ ] STATE.json        — 当前任务进度是否已写入"
  echo -e "  [ ] WALKTHROUGH.md    — 工作流步骤是否已记录"
  echo -e "  [ ] Memory observation — 关键决策/发现是否已存入 claude-mem"
  echo -e "  [ ] git commit        — uncommitted changes 是否已提交"
  echo -e ""
  echo -e "${CYAN}新 session 启动后，重新激活：${RESET}"
  echo -e "  /profile-entry  → 重建 harness 上下文"
  echo -e "  /$( recommend_skill "${effective_task_type}" )  → 恢复当前任务类型"
  echo -e ""

elif (( pct >= threshold_warn )); then
  recommended="$( recommend_skill "${effective_task_type}" )"
  echo -e ""
  echo -e "${YELLOW}⚠️  Context 使用已超 ${pct}%（警戒：${threshold_warn}%）${RESET}"
  echo -e "${YELLOW}建议：重新激活 skill 以刷新上下文并减少前缀压力。${RESET}"
  echo -e ""

  if [[ -n "${effective_task_type}" ]]; then
    echo -e "  当前任务类型：${effective_task_type}"
    echo -e "  建议重新激活：${CYAN}/${recommended}${RESET}"
  else
    echo -e "  建议重新激活：${CYAN}/profile-entry${RESET}"
  fi

  if [[ -n "${current_phase}" ]]; then
    echo -e "  当前阶段：${current_phase}"
  fi
  echo -e ""
fi

# Always exit 0 — hook must not block Claude's normal stop flow
exit 0

# ─────────────────────────────────────────────────────────────────────────────
# HOW TO REGISTER THIS HOOK IN settings.json
# ─────────────────────────────────────────────────────────────────────────────
#
# Add to ~/.claude/settings.json (or project .claude/settings.json):
#
# {
#   "hooks": {
#     "Stop": [
#       {
#         "matcher": "",
#         "hooks": [
#           {
#             "type": "command",
#             "command": "/Users/twelve/Music/myskills/harness/hooks/context-monitor.sh"
#           }
#         ]
#       }
#     ]
#   }
# }
#
# Or as a PostToolUse hook (fires after every tool call, more frequent):
#
# {
#   "hooks": {
#     "PostToolUse": [
#       {
#         "matcher": ".*",
#         "hooks": [
#           {
#             "type": "command",
#             "command": "/Users/twelve/Music/myskills/harness/hooks/context-monitor.sh"
#           }
#         ]
#       }
#     ]
#   }
# }
# ─────────────────────────────────────────────────────────────────────────────
