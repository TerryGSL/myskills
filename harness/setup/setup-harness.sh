#!/bin/bash
# setup-harness.sh — thin wrapper around `harness install`.
#
# Tier 3 fallback rules: see harness-init/SKILL.md#第二步
#
# 当本机已装 `harness` CLI（npm install -g harness-workflow-cli 或 npm link）→
# 直接 exec 转发到 `harness install`。
# 否则降级到 bash fallback；bash fallback 语义必须与 `harness install` 一致：
#   默认 = check + auto-fix
#   --doctor = check only
#   --json 不支持 → 显式报错 exit 2
#
# Usage:
#   ./setup-harness.sh             # check + auto-fix（默认行为）
#   ./setup-harness.sh --doctor    # 仅检查
#   ./setup-harness.sh --json      # 仅 CLI 模式支持

set -euo pipefail

# ─── Try CLI first ────────────────────────────────────────────────────────────

if command -v harness >/dev/null 2>&1; then
  exec harness install "$@"
fi

# ─── Bash fallback (Tier 2/3) ────────────────────────────────────────────────

# --json 在 fallback 下不支持
for arg in "$@"; do
  if [[ "${arg}" == "--json" ]]; then
    echo "✗ --json not supported in bash fallback. Install harness CLI." >&2
    exit 2
  fi
done

DOCTOR=false
for arg in "$@"; do
  case "${arg}" in
    --doctor) DOCTOR=true ;;
    *) ;;
  esac
done

readonly PROFILES_DIR="${HOME}/.claude/profiles"
readonly HARNESS_YML="${PROFILES_DIR}/harness.yml"
readonly DEFAULT_YML="${PROFILES_DIR}/default.yml"
readonly COMPANY_TPL="${PROFILES_DIR}/company.yml.template"
readonly SETTINGS_JSON="${HOME}/.claude/settings.json"
# Resolve repo root from this script's location (harness/setup/ → ../..).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly HOOK_SCRIPT="${REPO_ROOT}/hooks/context-monitor.sh"

if [[ -t 1 ]]; then
  BOLD="\033[1m"; GREEN="\033[1;32m"; YELLOW="\033[1;33m"
  CYAN="\033[1;36m"; RED="\033[1;31m"; RESET="\033[0m"
else
  BOLD=""; GREEN=""; YELLOW=""; CYAN=""; RED=""; RESET=""
fi

section() {
  echo -e "\n${BOLD}── ${1} ──────────────────────────────────${RESET}"
}

check_or_write() {
  local path="${1}"
  local writer="${2}"
  if [[ -f "${path}" ]]; then
    echo -e "  ${GREEN}✓${RESET} ${path}"
    return 0
  fi
  if $DOCTOR; then
    echo -e "  ${YELLOW}✗ 缺失${RESET} ${path}（去掉 --doctor 自动写入）"
  else
    "${writer}" > "${path}.tmp"
    mv "${path}.tmp" "${path}"
    echo -e "  ${GREEN}＋${RESET} 写入 ${path}"
  fi
}

write_default_yml() {
  cat <<'YAML'
# default.yml — fallback profile (priority 0, path_glob ** matches all)
name: default
description: 默认 profile（无项目特定配置时使用）

detection:
  priority: 0
  matchers:
    - type: path_glob
      pattern: "**"

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
# harness.yml — personal-project profile
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
# 公司 profile 模板 — 用 `harness profile-bootstrap <slug>` 自动派生而不是手改本文件
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
  - rewrite_history
  - network_install
YAML
}

check_hook_registered() {
  if [[ ! -f "${SETTINGS_JSON}" ]]; then
    echo -e "  ${YELLOW}∅${RESET} settings.json 不存在 — Stop Hook 未注册"
    return 1
  fi
  if grep -qF "${HOOK_SCRIPT}" "${SETTINGS_JSON}" 2>/dev/null; then
    echo -e "  ${GREEN}✓${RESET} Stop Hook 已注册（settings.json 含 ${HOOK_SCRIPT}）"
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
  无 task_type → default 70/85
JSON
}

mode_label="check + auto-fix"
$DOCTOR && mode_label="doctor (check only)"

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║   harness  —  Setup（${mode_label}）"
echo "║   (bash fallback — install harness CLI for full features)"
echo "╚══════════════════════════════════════════════╝"
echo -e "${RESET}"

section "Profile 目录与文件"
if [[ ! -d "${PROFILES_DIR}" ]]; then
  if $DOCTOR; then
    echo -e "  ${YELLOW}✗${RESET} ${PROFILES_DIR} 不存在（去掉 --doctor 自动创建）"
  else
    mkdir -p "${PROFILES_DIR}"
    echo -e "  ${GREEN}＋${RESET} 创建 ${PROFILES_DIR}"
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
  echo -e "  注册指引（手工合并或安装 harness CLI 后跑 \`harness install\`）："
  print_hook_snippet
fi

section "下一步"
echo -e "  • 切到公司项目时：${CYAN}/profile-bootstrap <slug>${RESET} 派生 company-*.yml"
echo -e "  • 在任意 repo 内：直接说出任务，task-dispatcher → profile-entry 自动路由"
echo -e "  • 若需手动指定 profile：在 repo 根写 ${CYAN}.harness-profile${RESET}（YAML 格式：${CYAN}profile: <name>${RESET} / ${CYAN}resolved_by: marker${RESET} / ${CYAN}updated_at: <ISO ts>${RESET}）"
echo -e "  • 推荐：装 harness CLI（\`npm install -g harness-workflow-cli\`）后跑 ${CYAN}harness install${RESET}"
echo ""
$DOCTOR && echo -e "${CYAN}本次为 doctor 模式（check only）。去掉 --doctor 才会写入。${RESET}"
