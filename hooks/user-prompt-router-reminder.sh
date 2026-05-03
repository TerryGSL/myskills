#!/usr/bin/env bash
# UserPromptSubmit hook — 智能注入 [HARNESS-ROUTER] 路由提醒
#
# 设计原则（codex round 3 反馈 + Karpathy 启发 + feedback_use_available_tools）：
#   - "完整提示"已在 SessionStart 注入；UserPromptSubmit 只补强提醒
#   - 但**不能砍工具提醒**（mem-search / smart_search / Skill），否则 AI 会忘
#   - 所以分两档：
#       * 业务代码语义命中 → 注入完整版（路由 + hard gate + 主动用工具）
#       * 纯查询 / 调试  → 注入精简版（只剩主动用工具提醒，因为 PreToolUse 不会触发）
#       * 已最近调过 harness-workflow → skip 完全注入（避免重复）
#
# 总结：从「每条都注入 ~150 token」→「按需注入 50-150 token」，长 session 节省 30-50%

set -uo pipefail

# Bypass switch（开发者关闭）
if [[ "${HARNESS_REMINDER:-}" == "off" ]]; then
  exit 0
fi

IS_CODEX=0
if [[ -n "${CODEX_THREAD_ID:-}" || -n "${CODEX_SHELL:-}" || -n "${CODEX_INTERNAL_ORIGINATOR_OVERRIDE:-}" ]]; then
  IS_CODEX=1
fi

emit_context() {
  local context="$1"

  if [[ "${IS_CODEX}" -eq 1 ]]; then
    # Codex UserPromptSubmit expects JSON matching user-prompt-submit.command.output:
    # {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"..."}}
    python3 - "$context" <<'PY'
import json
import sys

context = sys.argv[1]
payload = {
    "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": context,
    }
}
print(json.dumps(payload, ensure_ascii=False))
PY
  else
    printf '%s\n' "$context"
  fi
}

# 读 stdin（UserPromptSubmit hook 输入：prompt + transcript_path）
INPUT="$(cat)"
if [[ -z "${INPUT}" ]]; then
  # 没有 input → fallback 注入完整版（保险）
  emit_context "$(cat <<'EOF'
[HARNESS-ROUTER] L0 评估子任务数 → ≥2 先 Skill(task-dispatcher) / 单任务进 L1。
代码任务先 Skill(harness-workflow)；生命周期 `harness <cmd>`；纯查询直接答。
PreToolUse 硬拦：Edit/Write 没 Skill(harness-workflow) → 阻；Agent 没 Skill(task-dispatcher) → 阻。

主动用工具：跨 session 找历史 → mem-search；探索代码 → smart_search/smart_outline；多文件调研 → 派 Explore。
EOF
)"
  exit 0
fi

# 提取 prompt 内容 + transcript path
PROMPT="$(echo "${INPUT}" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get("prompt", "") or d.get("user_input", "") or "")
except: print("")
' 2>/dev/null)"

TRANSCRIPT="$(echo "${INPUT}" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get("transcript_path", ""))
except: print("")
' 2>/dev/null)"

# ─── 检测 1：是否像业务代码任务 ───────────────────────────────────────────
# 关键词（中英）+ 路径中含代码块 + 代码 fence
LOOKS_LIKE_CODE_TASK=0
if echo "${PROMPT}" | grep -qiE '(修[一好]|修复|加[一个]|改[一个]|实现|重构|优化|debug|fix|refactor|implement|build.*(function|module)|create.*function|edit.*\.(ts|tsx|js|jsx|py|go|rs|java|swift|kt|c|cpp|h|sh|rb|php))'; then
  LOOKS_LIKE_CODE_TASK=1
fi
# 中文常见动词单字开头（修/加/改/写/删 后接非空字符）
if echo "${PROMPT}" | grep -qE '(修|加|改|写|删|做|实施)[^[:space:]，。、！？]'; then
  LOOKS_LIKE_CODE_TASK=1
fi
# 含代码 fence 也算
if echo "${PROMPT}" | grep -qE '```'; then
  LOOKS_LIKE_CODE_TASK=1
fi
# 提到具体源码路径
if echo "${PROMPT}" | grep -qE '(src/|app/|lib/|packages/|/.+\.(ts|tsx|js|jsx|py|go|rs))'; then
  LOOKS_LIKE_CODE_TASK=1
fi

# ─── 检测 2：最近是否已走过 harness-workflow ──────────────────────────────
RECENTLY_ROUTED=0
if [[ -n "${TRANSCRIPT}" && -f "${TRANSCRIPT}" ]]; then
  # 只看最近 100 行（即最近 3-5 个 turn 的事件）
  if tail -100 "${TRANSCRIPT}" 2>/dev/null | \
     grep -qE '"name":"Skill"[^}]*"skill":"(harness-workflow|harness-init|harness-quick|harness-bugfix|harness-feature|harness-refactor)"'; then
    RECENTLY_ROUTED=1
  fi
fi

# ─── 决策 ────────────────────────────────────────────────────────────────
# 1. 像代码任务 + 最近未路由 → 注入完整版（路由 + hard gate + 工具）
# 2. 像代码任务 + 最近已路由 → 注入轻量版（只剩工具提醒）
# 3. 不像代码任务 → 注入精简版（只剩主动用工具提醒）

if [[ ${LOOKS_LIKE_CODE_TASK} -eq 1 && ${RECENTLY_ROUTED} -eq 0 ]]; then
  # 完整版（约 200 tokens）— 像是新代码任务且最近没走路由
  emit_context "$(cat <<'EOF'
[HARNESS-ROUTER] 这条像代码任务 + 最近未走路由。L0 评估子任务数 → ≥2 先 Skill(task-dispatcher) / 单任务进 L1。
代码任务先 Skill(harness-workflow)；生命周期 `harness <cmd>`；纯查询直接答。
PreToolUse 硬拦：Edit/Write 没 Skill(harness-workflow) → 阻；Agent 没 Skill(task-dispatcher) → 阻。

主动用工具：跨 session 找历史 / 上次怎么做 / codex 审稿前 → 先 mem-search。
扫代码 / 找符号 → 先 smart_search / smart_outline，再考虑 Read 全文。
多文件调研 / web fetch → 派 Explore / general-purpose agent。
EOF
)"
elif [[ ${LOOKS_LIKE_CODE_TASK} -eq 1 && ${RECENTLY_ROUTED} -eq 1 ]]; then
  # 轻量版（约 60 tokens）— 已在路由内，只提醒工具
  emit_context "$(cat <<'EOF'
[HARNESS-ROUTER] 仍在 harness 工作流内。继续主动用工具：mem-search 跨 session 历史 / smart_search 扫代码 / 派 sub-agent 处理独立任务。
EOF
)"
else
  # 精简版（约 80 tokens）— 不像代码任务，只补主动用工具提醒（PreToolUse 不会触发）
  emit_context "$(cat <<'EOF'
[HARNESS-ROUTER] 看起来像查询/解释类。直接答即可，不进 L1 路由。
但若涉及"上次怎么做" / 跨 session 找历史 → 先 mem-search；探索代码 → smart_search；多文件 → 派 Explore agent。
EOF
)"
fi
