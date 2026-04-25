#!/bin/bash
# setup-harness.sh — 一次性安装：校验 + 写默认 profile（无问题，dry-run 默认）。
#
# 职责：
#   1. 确保 ~/.claude/profiles/ 存在
#   2. 确保 default.yml / harness.yml / company.yml.template 存在（缺则写默认）
#   3. 检查 ~/.claude/settings.json 是否注册 context-monitor.sh hook
#   4. 输出"接入完成"+ 后续步骤指引
#
# 用法：
#   ./setup-harness.sh           # dry-run，仅检查 + 输出建议
#   ./setup-harness.sh --apply   # 真正写入缺失的文件

set -euo pipefail

# ─── Constants ────────────────────────────────────────────────────────────────

readonly PROFILES_DIR="${HOME}/.claude/profiles"
readonly HARNESS_YML="${PROFILES_DIR}/harness.yml"
readonly DEFAULT_YML="${PROFILES_DIR}/default.yml"
readonly COMPANY_TPL="${PROFILES_DIR}/company.yml.template"
readonly SETTINGS_JSON="${HOME}/.claude/settings.json"
readonly HOOK_SCRIPT="${HOME}/Music/myskills/harness/hooks/context-monitor.sh"

# ANSI colours
if [[ -t 1 ]]; then
  BOLD="\033[1m"; GREEN="\033[1;32m"; YELLOW="\033[1;33m"
  CYAN="\033[1;36m"; RED="\033[1;31m"; RESET="\033[0m"
else
  BOLD=""; GREEN=""; YELLOW=""; CYAN=""; RED=""; RESET=""
fi

# ─── Args ─────────────────────────────────────────────────────────────────────

APPLY=false
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=true
fi

# ─── Helpers ─────────────────────────────────────────────────────────────────

section() {
  echo -e "\n${BOLD}── ${1} ──────────────────────────────────${RESET}"
}

check_or_write() {
  # check_or_write <path> <default-content-fn>
  local path="${1}"
  local writer="${2}"
  if [[ -f "${path}" ]]; then
    echo -e "  ${GREEN}✓${RESET} ${path}"
    return 0
  fi
  if $APPLY; then
    "${writer}" > "${path}.tmp"
    mv "${path}.tmp" "${path}"
    echo -e "  ${GREEN}＋${RESET} 写入 ${path}"
  else
    echo -e "  ${YELLOW}✗ 缺失${RESET} ${path}（运行 --apply 写默认）"
  fi
}

write_default_yml() {
  cat <<'YAML'
# default.yml — 兜底 profile（priority 0，always 匹配）
name: default
description: 默认 profile（无项目特定配置时使用）

detection:
  priority: 0
  matchers:
    - type: always
      pattern: "*"

entry_skill: profile-entry

task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor

default_mode: conservative

hard_floor: []
YAML
}

write_harness_yml() {
  cat <<'YAML'
# harness.yml — 个人项目 profile
name: harness
description: 个人项目 profile — 默认 standard aggression。

detection:
  priority: 10
  matchers:
    - type: path_glob
      pattern: "~/Music/myskills/**"
    - type: git_remote_regex
      pattern: "github\\.com[:/]TerryGSL/.*"

entry_skill: profile-entry

task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor

default_mode: standard

hard_floor: []
YAML
}

write_company_template() {
  cat <<'YAML'
# 公司 profile 模板 — 用 /profile-bootstrap <name> 自动派生而不是手改本文件
# hard_floor 列表不可为空 — 公司项目默认底线
name: company-REPLACE_ME
description: 公司项目 profile — 严格审查，绝不自动 push

detection:
  priority: 20
  matchers:
    - type: path_glob
      pattern: "REPLACE_ME"
    - type: git_remote_regex
      pattern: "REPLACE_ME"

entry_skill: profile-entry

task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor

default_mode: conservative

hard_floor:
  - auto_push
  - force_push
  - destructive_ops
  - auto_merge
YAML
}

check_hook_registered() {
  if [[ ! -f "${SETTINGS_JSON}" ]]; then
    echo -e "  ${YELLOW}∅${RESET} settings.json 不存在 — Stop Hook 未注册"
    return 1
  fi
  if grep -q "context-monitor.sh" "${SETTINGS_JSON}" 2>/dev/null; then
    echo -e "  ${GREEN}✓${RESET} Stop Hook 已注册（settings.json 含 context-monitor.sh）"
    return 0
  else
    echo -e "  ${YELLOW}✗${RESET} Stop Hook 未注册"
    return 1
  fi
}

print_hook_snippet() {
  cat <<JSON

合并以下到 ${SETTINGS_JSON}：

{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "${HOOK_SCRIPT}"
          }
        ]
      }
    ]
  }
}

阈值按 task_type 自适应：
  quick    → warn 80% / crit 90%
  bugfix   → warn 70% / crit 85%
  feature  → warn 60% / crit 80%
  refactor → warn 60% / crit 80%
  无 task_type → 静默退出
JSON
}

# ─── Main ─────────────────────────────────────────────────────────────────────

mode_label="dry-run"
$APPLY && mode_label="apply"

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║   harness  —  Setup（${mode_label}）"
echo "╚══════════════════════════════════════════════╝"
echo -e "${RESET}"

section "Profile 目录与文件"
if [[ ! -d "${PROFILES_DIR}" ]]; then
  if $APPLY; then
    mkdir -p "${PROFILES_DIR}"
    echo -e "  ${GREEN}＋${RESET} 创建 ${PROFILES_DIR}"
  else
    echo -e "  ${YELLOW}✗${RESET} ${PROFILES_DIR} 不存在（--apply 创建）"
  fi
else
  echo -e "  ${GREEN}✓${RESET} ${PROFILES_DIR}"
fi

check_or_write "${DEFAULT_YML}"  write_default_yml
check_or_write "${HARNESS_YML}"  write_harness_yml
check_or_write "${COMPANY_TPL}"  write_company_template

section "Stop Hook 注册状态"
if check_hook_registered; then
  echo -e "  Hook 已 active。"
else
  echo -e "  注册指引："
  print_hook_snippet
fi

section "下一步"
echo -e "  • 切到公司项目时：${CYAN}/profile-bootstrap <slug>${RESET} 派生 company-*.yml"
echo -e "  • 在任意 repo 内：直接说出任务，task-dispatcher → profile-entry 自动路由"
echo -e "  • 若需手动指定 profile：在 repo 根写 ${CYAN}.harness-profile${RESET}（内容为 profile 名）"
echo ""
$APPLY || echo -e "${CYAN}本次为 dry-run。重跑加 --apply 才会写入。${RESET}"
