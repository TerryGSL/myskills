#!/usr/bin/env bash
# router-enforcer.sh — PreToolUse hook (fail-closed)
#
# Hard gate：在业务代码 Edit/Write 前强制调过 Skill(harness-workflow)；在 Agent
# tool 派 sub-agent 前强制调过 Skill(task-dispatcher)。
# [HARNESS-ROUTER] 注入是 soft 提醒，AI 可能忽略；本 hook 是技术机制，跳不过。
#
# 触发：matcher = Edit | Write | Agent
#
# Edit/Write 白名单（不拦截）：
#   - 文档：*.md / *.txt / *.rst / docs/ / wrappers/ / hooks/ / contracts/ /
#     references/ / prompts/ / AGENTS.md / CLAUDE.md / SKILL.md / README*
#   - 模板：*.template / *.tmpl
#   - 配置：settings.json / hooks.json / config.toml / *.harness* / .gitignore
#     / package.json / tsconfig.json / pyproject.toml / Cargo.toml / go.mod / 等
#   - 全局目录：.claude/ / .codex/ / .gstack/ / .harness/
#   - 测试数据：fixtures/ / __snapshots__/
#
# 检测：tail -2000 transcript JSONL，grep 最近的 Skill tool 调用
#   - Edit/Write 要求 Skill(harness-workflow / harness-init / harness-{quick,
#     bugfix,feature,refactor})
#   - Agent 要求 Skill(task-dispatcher)
#
# 旁路：HARNESS_ENFORCER=off
#
# 行为（fail-closed）：
#   - 白名单命中 / Skill 已调 → exit 0（允许）
#   - JSON parse 失败 → exit 2（拒绝）
#   - 空 file_path（Edit/Write） → exit 2（拒绝）
#   - transcript 不可读 → exit 2（拒绝）
#   - 没找到对应 Skill → exit 2 + stderr 指引（拒绝）

set -uo pipefail

# Bypass switch
if [[ "${HARNESS_ENFORCER:-}" == "off" ]]; then
  exit 0
fi

# Read stdin JSON
INPUT="$(cat)"
if [[ -z "${INPUT}" ]]; then
  exit 0  # 没有 input，放过
fi

# 提取关键字段（codex Q4 反馈：malformed JSON 也要 fail-closed）
PARSED="$(echo "${INPUT}" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    tn = d.get("tool_name", "")
    fp = d.get("tool_input", {}).get("file_path", "") if isinstance(d.get("tool_input"), dict) else ""
    tp = d.get("transcript_path", "")
    print(f"OK\t{tn}\t{fp}\t{tp}")
except Exception as e:
    print(f"PARSE_ERR\t{e}")
' 2>/dev/null)"

PARSE_STATUS="$(echo "${PARSED}" | head -1 | cut -f1)"
TOOL_NAME="$(echo "${PARSED}" | head -1 | cut -f2)"
FILE_PATH="$(echo "${PARSED}" | head -1 | cut -f3)"
TRANSCRIPT="$(echo "${PARSED}" | head -1 | cut -f4)"

# Fail-closed: JSON parse 失败 → 拒绝（codex round 2 Q4 建议）
if [[ "${PARSE_STATUS}" != "OK" ]]; then
  echo "🚫 ROUTER ENFORCER (fail-closed): stdin JSON 解析失败 → 拒绝 tool 调用" >&2
  echo "  原因: ${PARSED}" >&2
  echo "  旁路: HARNESS_ENFORCER=off" >&2
  exit 2
fi

# 看 Edit / Write / Agent 三类（Agent 触发 task-dispatcher 强制）
case "${TOOL_NAME}" in
  Edit|Write|Agent) ;;
  *) exit 0 ;;
esac

# ─── Agent 工具：要求 Skill(task-dispatcher) ────────────────────────────────
if [[ "${TOOL_NAME}" == "Agent" ]]; then
  if [[ -z "${TRANSCRIPT}" || ! -f "${TRANSCRIPT}" ]]; then
    cat >&2 <<'EOF'
🚫 ROUTER ENFORCER (fail-closed): transcript 不可读，无法验证 Skill(task-dispatcher) 是否调过

按 [HARNESS-ROUTER] 铁律 ②：≥2 子任务派 sub-agent 前必须显式 Skill(task-dispatcher)。

旁路：HARNESS_ENFORCER=off 关闭整套 enforcement
EOF
    exit 2
  fi
  # regex 泛化："skill":"<任意非引号字符>" — 兼容 namespaced 名（superpowers:brainstorming / 大写 / 数字 / 下划线）
  RECENT_SKILL_CALLS="$(tail -2000 "${TRANSCRIPT}" 2>/dev/null | grep -oE '"name":"Skill"[^}]*"skill":"[^"]+"' || true)"
  if echo "${RECENT_SKILL_CALLS}" | grep -qE '"skill":"task-dispatcher"'; then
    exit 0
  fi
  cat >&2 <<EOF
🚫 ROUTER ENFORCER: 派 Agent 前必须先 Skill(task-dispatcher)

按 [HARNESS-ROUTER] 铁律 ②：≥2 子任务派 sub-agent 前必须显式 Skill(task-dispatcher) 加载派发协议。

正确路径：
  1. invoke Skill(task-dispatcher)（加载派发模板 / 不重叠边界 / agent prompt 协议）
  2. 然后 Agent tool 派 sub-agent

旁路：HARNESS_ENFORCER=off
EOF
  exit 2
fi

# ─── Edit / Write 工具：要求 Skill(harness-workflow) 或 leaf ────────────────
# 没有 file_path 信息 → fail-closed（codex round 2 Q6 建议）
if [[ -z "${FILE_PATH}" ]]; then
  echo "🚫 ROUTER ENFORCER (fail-closed): Edit/Write 缺 file_path → 拒绝" >&2
  echo "  旁路: HARNESS_ENFORCER=off" >&2
  exit 2
fi

# 白名单（路径命中即放过，运维 / 文档 / 模板不强制走 harness-workflow）
case "${FILE_PATH}" in
  # 文档
  *.md|*.MD|*.markdown|*/README*|*/CHANGELOG*|*/LICENSE*|*/CONTRIBUTING*) exit 0 ;;
  *.txt|*.rst|*.adoc) exit 0 ;;

  # 仓库目录类（注意：删了 templates/ 和 scripts/ — codex Q2 指出可能藏业务逻辑；
  # 仍保留 docs/ wrappers/ hooks/ contracts/ references/ prompts/ 这些纯文档目录）
  */docs/*|*/wrappers/*|*/hooks/*|*/contracts/*|*/references/*|*/prompts/*) exit 0 ;;

  # 模板文件（精确匹配 *.template，而非整个 templates/ 目录）
  *.template|*.tmpl) exit 0 ;;

  # 顶层入口文件
  */AGENTS.md|*/CLAUDE.md|*/SKILL.md|*/skill.md) exit 0 ;;

  # 配置 / 状态
  */settings.json|*/settings.local.json|*/hooks.json|*/config.toml|*/config.yaml) exit 0 ;;
  */.harness*|*/.gitignore|*/.gitattributes) exit 0 ;;

  # 用户 / 工具全局目录
  */.claude/*|*/.codex/*|*/.gstack/*|*/.harness/*) exit 0 ;;

  # 包管理（不算业务代码）
  */package.json|*/package-lock.json|*/yarn.lock|*/pnpm-lock.yaml) exit 0 ;;
  */tsconfig*.json|*/jest.config.*|*/.eslintrc*|*/.prettierrc*) exit 0 ;;
  */requirements*.txt|*/pyproject.toml|*/poetry.lock|*/Pipfile*|*/Cargo.toml|*/Cargo.lock|*/go.mod|*/go.sum) exit 0 ;;

  # 测试 fixtures / snapshots（纯数据文件）
  */fixtures/*|*/__fixtures__/*|*/__snapshots__/*) exit 0 ;;
esac

# ─── Transcript 里查 Skill 调用 ─────────────────────────────────────────────
# fail-closed：transcript 不可读 → 拒绝（codex Q4 建议）
if [[ -z "${TRANSCRIPT}" || ! -f "${TRANSCRIPT}" ]]; then
  cat >&2 <<EOF
🚫 ROUTER ENFORCER (fail-closed): transcript 不可读，无法验证 Skill(harness-workflow) 是否调过

  文件:   ${FILE_PATH}
  工具:   ${TOOL_NAME}

按 [HARNESS-ROUTER] 铁律 ①：动业务代码前必须显式 Skill(harness-workflow)。

旁路：HARNESS_ENFORCER=off 关闭整套 enforcement（开发者调试用）。
EOF
  exit 2
fi

# regex 泛化：codex Q1 指出 [a-z-]+ 漏匹配 namespaced（superpowers:brainstorming 含冒号）
# 改 [^"]+ 匹配引号内任意字符，鲁棒。
RECENT_SKILL_CALLS="$(tail -2000 "${TRANSCRIPT}" 2>/dev/null | grep -oE '"name":"Skill"[^}]*"skill":"[^"]+"' || true)"

# 是否调过 harness-workflow / harness-init / 4 个 leaf
if echo "${RECENT_SKILL_CALLS}" | grep -qE '"skill":"(harness-workflow|harness-init|harness-quick|harness-bugfix|harness-feature|harness-refactor)"'; then
  exit 0  # 已经走过路由
fi

# ─── 拒绝 ───────────────────────────────────────────────────────────────────
cat >&2 <<EOF
🚫 ROUTER ENFORCER: 业务代码 Edit/Write 必须先 Skill(harness-workflow)

  文件:   ${FILE_PATH}
  工具:   ${TOOL_NAME}

按 [HARNESS-ROUTER] 铁律 ①：动业务代码前必须显式 Skill(harness-workflow)，跳层即违反。

正确路径：
  1. invoke Skill(harness-workflow)
  2. 内部走 harness route → 选 leaf skill (quick/bugfix/feature/refactor)
  3. 在 leaf skill 上下文内才允许 Edit/Write

例外（如确实是配置 / 文档而被误判）：
  - 把路径模式加到 ~/Music/myskills/hooks/router-enforcer.sh 白名单
  - 或临时旁路：HARNESS_ENFORCER=off

EOF

exit 2  # block
