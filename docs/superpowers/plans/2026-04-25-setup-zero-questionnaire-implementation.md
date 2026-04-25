# harness setup 零问卷化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 harness/setup-harness.sh 4-7 个 upfront 问题改造为：自动派生 + 规则化判断；新增 profile-bootstrap skill；context-monitor 自适应阈值；push 决策规则化（risk-based）。

**Architecture:** 5 个 Phase，Phase 1-3 内任务可并行 subagent 执行；Phase 4 依赖 Phase 3 的 push-decision.md；Phase 5 是端到端验证。所有改动只在 `harness/`、`harness/harness-workflow/references/autonomy.md`、`harness/hooks/`、`harness/tools/` 范围内。

**Tech Stack:** bash 脚本（POSIX-compatible，macOS）/ ruby YAML 解析（macOS 自带）/ markdown skill 文档 / git。

**Spec：** `docs/superpowers/specs/2026-04-25-setup-zero-questionnaire-design.md`

---

## Phase 1：setup-harness.sh 重写 + harness-pack-test fixtures 升级（可并行）

### Task 1.1：重写 setup-harness.sh（dry-run 默认 / --apply 写入 / 4 bug 修复）

**Files:**
- Modify (大幅重写): `harness/setup/setup-harness.sh` (现 274 行 → 目标 ~150 行)

- [ ] **Step 1: 备份现有脚本（防回滚）**

```bash
cp harness/setup/setup-harness.sh harness/setup/setup-harness.sh.before-zeroq
```

- [ ] **Step 2: 写新脚本**

完整替换 `harness/setup/setup-harness.sh` 内容为：

```bash
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
```

- [ ] **Step 3: 验证脚本语法**

```bash
bash -n harness/setup/setup-harness.sh
echo "Exit: $?"
```

Expected: Exit 0

- [ ] **Step 4: 跑 dry-run 测试**

```bash
chmod +x harness/setup/setup-harness.sh
harness/setup/setup-harness.sh 2>&1 | head -30
```

Expected: 输出包含 "dry-run"，列出现有 profile 文件状态，不写任何东西

- [ ] **Step 5: 验证现有 profile 文件未被修改**

```bash
md5 ~/.claude/profiles/{default,harness}.yml ~/.claude/profiles/company.yml.template
# 与 dry-run 前对比应一致
```

- [ ] **Step 6: 删除备份**

```bash
rm harness/setup/setup-harness.sh.before-zeroq
```

- [ ] **Step 7: Commit**

```bash
git add harness/setup/setup-harness.sh
git commit -m "feat(setup): 重写 setup-harness.sh 为零问卷 dry-run 默认

删除 4-7 个 upfront 问题（dev_scenario / push_mode / company_* / enable_hook）。
新行为：
- 默认 dry-run，仅检查 ~/.claude/profiles/ 完整性
- --apply 才写入缺失的 default.yml / harness.yml / company.yml.template
- 检查 settings.json 是否注册 Stop Hook，输出 active/inactive 状态 + 注册 snippet
- 公司 profile 派生改由 /profile-bootstrap 单独负责

修复 4 个现存 bug：
- 写 harness.yml 输出完整 schema（含 detection/entry_skill/hard_floor）
- 删除非法 matcher 类型（type: repo_path / type: git_remote）
- 删除 sed __X__ 替换链（与 REPLACE_ME 模板不一致，永远替换不到）
- 加原子写入（mktemp + mv）替代 silent overwrite"
```

---

### Task 1.2：harness-pack-test 加新校验 + 新 fixtures

**Files:**
- Modify: `harness/tools/harness-pack-test`
- Create: `harness/tools/fixtures/pack-test/placeholder-residue-pack.yml`
- Create: `harness/tools/fixtures/pack-test/illegal-matcher-pack.yml`
- Create: `harness/tools/fixtures/pack-test/missing-fields-pack.yml`

- [ ] **Step 1: 读现有 harness-pack-test 找到合适插入点**

```bash
grep -n "violations" harness/tools/harness-pack-test | head -10
```

记下 violations 数组追加的位置（约 line 100-150）。

- [ ] **Step 2: 在 harness-pack-test 里增加 3 类校验**

打开 `harness/tools/harness-pack-test`，在主校验 ruby block 里追加（找到 `violations <<` 系列调用处）：

```ruby
# 占位符残留校验
yaml_text = File.read(pack_path)
if yaml_text =~ /REPLACE_ME/ || yaml_text =~ /__[A-Z_]+__/
  violations << "占位符残留：文件中含 REPLACE_ME 或 __X__，未被派生填充"
end

# 必需字段校验（上面已有 task_types 校验，这里补全）
%w[detection entry_skill default_mode hard_floor].each do |key|
  unless data.key?(key)
    violations << "缺必需字段：#{key}"
  end
end

# matcher 类型白名单
allowed_matcher_types = %w[always path_glob git_remote_regex]
if data['detection'].is_a?(Hash) && data['detection']['matchers'].is_a?(Array)
  data['detection']['matchers'].each_with_index do |m, i|
    type = m['type']
    unless allowed_matcher_types.include?(type)
      violations << "matcher[#{i}].type 非法：#{type.inspect}（合法：#{allowed_matcher_types.join('/')}）"
    end
  end
end
```

- [ ] **Step 3: 创建 placeholder-residue fixture**

```bash
cat > harness/tools/fixtures/pack-test/placeholder-residue-pack.yml <<'YAML'
name: company-REPLACE_ME
description: 占位符未替换的坏 pack
detection:
  priority: 20
  matchers:
    - type: path_glob
      pattern: "REPLACE_ME"
entry_skill: profile-entry
task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor
default_mode: conservative
hard_floor: [auto_push]
YAML
```

- [ ] **Step 4: 创建 illegal-matcher fixture**

```bash
cat > harness/tools/fixtures/pack-test/illegal-matcher-pack.yml <<'YAML'
name: bad-matcher-pack
description: 非法 matcher 类型
detection:
  priority: 10
  matchers:
    - type: repo_path
      pattern: "/work/foo"
    - type: git_remote
      pattern: "github.com/foo"
entry_skill: profile-entry
task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor
default_mode: standard
hard_floor: []
YAML
```

- [ ] **Step 5: 创建 missing-fields fixture**

```bash
cat > harness/tools/fixtures/pack-test/missing-fields-pack.yml <<'YAML'
name: missing-fields-pack
description: 缺关键字段
task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor
YAML
```

- [ ] **Step 6: 跑测试验证 3 个 fixture 都失败**

```bash
for f in harness/tools/fixtures/pack-test/{placeholder-residue,illegal-matcher,missing-fields}-pack.yml; do
  echo "=== $f ==="
  harness/tools/harness-pack-test "$f"
  echo "Exit: $?"
done
```

Expected: 全部 exit 1，并各自打印对应 violation 类型

- [ ] **Step 7: 跑现有 valid-pack.yml 验证未回归**

```bash
harness/tools/harness-pack-test harness/tools/fixtures/pack-test/valid-pack.yml
echo "Exit: $?"
```

Expected: Exit 0, "✓ Pack 'acme-backend' passes contract validation"

- [ ] **Step 8: Commit**

```bash
git add harness/tools/harness-pack-test harness/tools/fixtures/pack-test/
git commit -m "test(pack-test): 新增 3 类校验 + 3 个失败 fixture

校验加项：
- 占位符残留（REPLACE_ME / __X__）
- 必需字段（detection / entry_skill / default_mode / hard_floor）
- matcher 类型白名单（always | path_glob | git_remote_regex）

新 fixtures：
- placeholder-residue-pack.yml
- illegal-matcher-pack.yml
- missing-fields-pack.yml

valid-pack.yml 回归通过。"
```

---

## Phase 2：profile-bootstrap skill 新建（独立可并行 Phase 1）

### Task 2.1：创建 profile-bootstrap/lib/derive.sh（派生算法 + 单元测试）

**Files:**
- Create: `harness/profile-bootstrap/lib/derive.sh`
- Create: `harness/profile-bootstrap/lib/test-derive.sh`

- [ ] **Step 1: 写 derive.sh**

```bash
mkdir -p harness/profile-bootstrap/lib
cat > harness/profile-bootstrap/lib/derive.sh <<'BASH'
#!/bin/bash
# derive.sh — 从当前 git repo 派生 path_glob + git_remote_regex
#
# 用法：source derive.sh && derive_profile <slug>
# 输出：导出环境变量 DERIVED_PATH_GLOB / DERIVED_REMOTE_REGEX / DERIVED_SLUG
#       失败时 echo 错误到 stderr 并 return 1
#
# 注意：本文件用 source 加载，不要直接 ./run

derive_profile() {
  local user_slug="${1:-}"

  # 1. canonical repo root
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "✗ 当前不在 git repo 内" >&2
    return 1
  fi
  local repo_root
  repo_root=$(git rev-parse --show-toplevel) || return 1
  repo_root=$(realpath "${repo_root}") || return 1

  # 2. path_glob 派生（仅 repo root，不爬父目录）
  local path_glob="${repo_root}/**"
  # 把 $HOME 前缀替换成 ~ 让 yml 可移植
  if [[ "${path_glob}" == "${HOME}/"* ]]; then
    path_glob="~${path_glob#${HOME}}"
  fi

  # 3. 扫所有 remotes
  local remotes
  remotes=$(git remote -v 2>/dev/null | awk '{print $2}' | sort -u)

  local remote_regex=""
  local derived_slug=""

  if [[ -n "${remotes}" ]]; then
    # 提取每个 remote 的 (host, org, repo)
    local hosts=() orgs=() repos=()
    while IFS= read -r url; do
      [[ -z "${url}" ]] && continue
      local h o r
      # SSH: git@host:org/repo.git
      if [[ "${url}" =~ ^[a-zA-Z0-9_]+@([^:]+):([^/]+)/(.+)$ ]]; then
        h="${BASH_REMATCH[1]}"
        o="${BASH_REMATCH[2]}"
        r="${BASH_REMATCH[3]%.git}"
      # HTTPS: https://host/org/repo.git
      elif [[ "${url}" =~ ^https?://([^/]+)/([^/]+)/(.+)$ ]]; then
        h="${BASH_REMATCH[1]}"
        o="${BASH_REMATCH[2]}"
        r="${BASH_REMATCH[3]%.git}"
      else
        # 无法解析 — skip
        continue
      fi
      hosts+=("${h}"); orgs+=("${o}"); repos+=("${r}")
    done <<< "${remotes}"

    # 检查 (host, org) 一致性
    local first_host="${hosts[0]:-}" first_org="${orgs[0]:-}" first_repo="${repos[0]:-}"
    local all_same=true
    for i in "${!hosts[@]}"; do
      if [[ "${hosts[$i]}" != "${first_host}" || "${orgs[$i]}" != "${first_org}" ]]; then
        all_same=false
        break
      fi
    done

    if ! ${all_same}; then
      echo "✗ remotes 的 host/org 不一致（origin/upstream 不一致 / fork 场景）：" >&2
      git remote -v >&2
      echo "  请明确指定 --remote origin（或 upstream）后重试" >&2
      return 1
    fi

    # 派生精确 regex：host[:/]org/repo(\.git)?$
    # 需要转义 host 里的 . 等字符
    local escaped_host
    escaped_host=$(echo "${first_host}" | sed -e 's/[.[\*^$()+?{|]/\\&/g')
    local escaped_org
    escaped_org=$(echo "${first_org}" | sed -e 's/[.[\*^$()+?{|]/\\&/g')
    local escaped_repo
    escaped_repo=$(echo "${first_repo}" | sed -e 's/[.[\*^$()+?{|]/\\&/g')
    remote_regex="${escaped_host}[:/]${escaped_org}/${escaped_repo}(\\.git)?\$"
    derived_slug="${first_org}"
  fi

  # 4. slug 派生：用户传入 > git org > repo basename
  if [[ -n "${user_slug}" ]]; then
    DERIVED_SLUG="${user_slug}"
  elif [[ -n "${derived_slug}" ]]; then
    DERIVED_SLUG="${derived_slug}"
  else
    DERIVED_SLUG=$(basename "${repo_root}")
  fi

  # 5. slug 字符校验
  if ! [[ "${DERIVED_SLUG}" =~ ^[a-z0-9-]+$ ]]; then
    echo "✗ 派生 slug '${DERIVED_SLUG}' 含非法字符（仅 a-z 0-9 -）。请显式传 <slug>。" >&2
    return 1
  fi

  # 输出
  export DERIVED_PATH_GLOB="${path_glob}"
  export DERIVED_REMOTE_REGEX="${remote_regex}"
  export DERIVED_REPO_ROOT="${repo_root}"
  return 0
}
BASH
chmod +x harness/profile-bootstrap/lib/derive.sh
```

- [ ] **Step 2: 写 test-derive.sh**

```bash
cat > harness/profile-bootstrap/lib/test-derive.sh <<'BASH'
#!/bin/bash
# test-derive.sh — 单元测试 derive.sh 的派生算法
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/derive.sh"

readonly TEST_DIR="$(mktemp -d /tmp/derive-test.XXXXXX)"
trap 'rm -rf "${TEST_DIR}"' EXIT

pass_count=0
fail_count=0

assert_eq() {
  local name="${1}" expected="${2}" actual="${3}"
  if [[ "${expected}" == "${actual}" ]]; then
    echo "  ✓ ${name}"
    pass_count=$((pass_count + 1))
  else
    echo "  ✗ ${name}"
    echo "    expected: ${expected}"
    echo "    actual:   ${actual}"
    fail_count=$((fail_count + 1))
  fi
}

assert_fail() {
  local name="${1}"
  shift
  if "$@" 2>/dev/null; then
    echo "  ✗ ${name}（应该失败但成功了）"
    fail_count=$((fail_count + 1))
  else
    echo "  ✓ ${name}（按预期失败）"
    pass_count=$((pass_count + 1))
  fi
}

# Test 1: SSH github + 用户传 slug
mkdir -p "${TEST_DIR}/test1"
cd "${TEST_DIR}/test1"
git init -q
git remote add origin "git@github.com:acme/api.git"
unset DERIVED_PATH_GLOB DERIVED_REMOTE_REGEX DERIVED_SLUG
derive_profile "acme"
assert_eq "test1: slug" "acme" "${DERIVED_SLUG}"
assert_eq "test1: regex 含 acme/api" "true" "$([[ "${DERIVED_REMOTE_REGEX}" == *"acme/api"* ]] && echo true || echo false)"

# Test 2: HTTPS gitlab + 自动派生 slug 用 org
mkdir -p "${TEST_DIR}/test2"
cd "${TEST_DIR}/test2"
git init -q
git remote add origin "https://gitlab.com/foo/bar.git"
unset DERIVED_PATH_GLOB DERIVED_REMOTE_REGEX DERIVED_SLUG
derive_profile
assert_eq "test2: slug = foo" "foo" "${DERIVED_SLUG}"
assert_eq "test2: regex 含 foo/bar" "true" "$([[ "${DERIVED_REMOTE_REGEX}" == *"foo/bar"* ]] && echo true || echo false)"

# Test 3: origin / upstream 不一致 → fail
mkdir -p "${TEST_DIR}/test3"
cd "${TEST_DIR}/test3"
git init -q
git remote add origin "git@github.com:user/fork.git"
git remote add upstream "git@github.com:company/orig.git"
unset DERIVED_PATH_GLOB DERIVED_REMOTE_REGEX DERIVED_SLUG
assert_fail "test3: 不一致 remote 应失败" derive_profile

# Test 4: 无 git repo → fail
mkdir -p "${TEST_DIR}/test4"
cd "${TEST_DIR}/test4"
unset DERIVED_PATH_GLOB DERIVED_REMOTE_REGEX DERIVED_SLUG
assert_fail "test4: 非 git repo 应失败" derive_profile

# Test 5: slug 含非法字符 → fail
mkdir -p "${TEST_DIR}/test5"
cd "${TEST_DIR}/test5"
git init -q
git remote add origin "git@github.com:org/repo.git"
unset DERIVED_PATH_GLOB DERIVED_REMOTE_REGEX DERIVED_SLUG
assert_fail "test5: 非法 slug 'My_Slug' 应失败" derive_profile "My_Slug"

# Test 6: 无 remote → path_glob-only 派生（应成功，remote_regex 空）
mkdir -p "${TEST_DIR}/test6"
cd "${TEST_DIR}/test6"
git init -q
unset DERIVED_PATH_GLOB DERIVED_REMOTE_REGEX DERIVED_SLUG
derive_profile "myrepo"
assert_eq "test6: slug" "myrepo" "${DERIVED_SLUG}"
assert_eq "test6: remote_regex 空" "" "${DERIVED_REMOTE_REGEX}"

echo ""
echo "Passed: ${pass_count}, Failed: ${fail_count}"
[[ ${fail_count} -eq 0 ]]
BASH
chmod +x harness/profile-bootstrap/lib/test-derive.sh
```

- [ ] **Step 3: 跑测试验证 derive.sh 逻辑正确**

```bash
harness/profile-bootstrap/lib/test-derive.sh
echo "Exit: $?"
```

Expected: "Passed: 8, Failed: 0", Exit 0（如果 macOS bash 版本太老导致 BASH_REMATCH 不可用，需在 script 顶加 `[[ -n "$BASH_VERSION" ]] && ((BASH_VERSINFO[0] >= 4))` 检查）

- [ ] **Step 4: Commit**

```bash
git add harness/profile-bootstrap/lib/
git commit -m "feat(profile-bootstrap): derive.sh 派生算法 + 单元测试

派生规则（codex 反馈收敛）：
- canonical repo root: realpath(git rev-parse --show-toplevel)
- path_glob: 仅 repo root（${HOME} → ~），不爬父目录
- remote regex: 扫所有 remotes，所有 (host, org) 必须一致；提取
  host[:/]org/repo(\\.git)?\$ 精确锚定
- origin/upstream 不一致 → abort 要求显式 --remote
- slug 字符校验 [a-z0-9-]+

6 个 unit test 全通过（含 fork 场景 / 无 remote / 非 git repo / 非法 slug）"
```

---

### Task 2.2：创建 profile-bootstrap SKILL.md

**Files:**
- Create: `harness/profile-bootstrap/SKILL.md`

- [ ] **Step 1: 写 SKILL.md**

```bash
cat > harness/profile-bootstrap/SKILL.md <<'MD'
---
name: profile-bootstrap
description: 从当前 git repo 自动派生 profile（path_glob + git_remote_regex）并写入 ~/.claude/profiles/company-<slug>.yml + repo 根的 .harness-profile marker。运行时调用 derive.sh 计算 canonical repo root + 全 remote 扫描；schema 校验通过才落盘；自动加 .gitignore。Triggers: (1) 用户显式 /profile-bootstrap [slug] (2) profile-entry Step 1 fallback 完全无匹配 + 用户对话明确说"这是 X 公司项目"时主对话 Claude 调用
---

# profile-bootstrap — Profile 派生入口

**职责**：派生 + 落盘。与 `profile-entry`（薄路由器，只读）严格分工。

**何时调用**：
- 用户显式 `/profile-bootstrap` 或 `/profile-bootstrap <slug>` 或 `/profile-bootstrap <slug> --remote upstream`
- profile-entry 探测失败 + 对话里有"这是 X 公司项目"信号词，由主对话 Claude 主动调用（不是 profile-entry 自己调）

**何时不调用**：
- 在 ~/.claude/profiles/ 已经有匹配的 profile 时
- 当前不在 git repo 里
- 用户没明确意图要新建 profile

---

## Step 1：派生

```bash
source harness/profile-bootstrap/lib/derive.sh
derive_profile "${user_slug}"
```

输出（环境变量）：
- `DERIVED_PATH_GLOB`（如 `~/work/acme-api/**`）
- `DERIVED_REMOTE_REGEX`（如 `github\.com[:/]acme/api(\.git)?$`，空字符串表示无 remote）
- `DERIVED_SLUG`（如 `acme`）
- `DERIVED_REPO_ROOT`（canonical absolute path）

**派生失败的退出条件**（derive.sh 直接 return 1）：
- 不在 git repo
- origin/upstream 的 host/org 不一致（fork 场景）
- slug 含非法字符（仅 `[a-z0-9-]+`）

派生失败时**禁止**继续后续步骤，向用户报错并要求显式 `<slug>` 或 `--remote`。

---

## Step 2：决定 hard_floor

| 条件 | hard_floor |
|------|-----------|
| slug 含 "company" / "work" / "corp" / 用户传 `--workspace company` | `[auto_push, force_push, destructive_ops, auto_merge]` |
| 否则 | `[]` |

**永远不替用户决定个人项目要 hard_floor**——这是 user feedback 明确的 boundary。

---

## Step 3：拼装 yaml

```yaml
name: company-${DERIVED_SLUG}
description: "Auto-derived profile for ${DERIVED_SLUG}"
detection:
  priority: 20
  matchers:
    - type: path_glob
      pattern: "${DERIVED_PATH_GLOB}"
    - type: git_remote_regex
      pattern: "${DERIVED_REMOTE_REGEX}"   # 若空则省略此 matcher
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
```

---

## Step 4：schema 校验

写文件**之前**先调 `harness/tools/harness-pack-test` 校验：
- 占位符残留（REPLACE_ME / __X__）→ 拒绝
- 必需字段（detection / entry_skill / default_mode / hard_floor）→ 拒绝
- matcher 类型白名单（always / path_glob / git_remote_regex）→ 拒绝

校验通过才进入 Step 5。

---

## Step 5：原子写入

```bash
# 写 profile yml
target_yml="~/.claude/profiles/company-${DERIVED_SLUG}.yml"
tmp=$(mktemp ~/.claude/profiles/.tmp.XXXXXX)
echo "${rendered_yaml}" > "${tmp}"
mv "${tmp}" "${target_yml}"

# 写 .harness-profile marker
marker="${DERIVED_REPO_ROOT}/.harness-profile"
echo "company-${DERIVED_SLUG}" > "${marker}.tmp"
mv "${marker}.tmp" "${marker}"

# 自动加 .gitignore
gitignore="${DERIVED_REPO_ROOT}/.gitignore"
grep -qxF ".harness-profile" "${gitignore}" 2>/dev/null \
  || echo ".harness-profile" >> "${gitignore}"
```

---

## Step 6：公告

```
Derived: profile=company-${DERIVED_SLUG}
  path_glob:        ${DERIVED_PATH_GLOB}
  git_remote_regex: ${DERIVED_REMOTE_REGEX}
  hard_floor:       [auto_push, force_push, destructive_ops, auto_merge]
Wrote:
  ${target_yml}
  ${marker}  (added to .gitignore)
```

下次进入该 repo，profile-entry Step 0 通过 marker 直接命中，无需重新派生。

---

## 硬约束

- **派生失败必须停**：不替用户做"猜测式" fallback
- **schema 校验通过才落盘**
- **原子写入**：tmp + mv，避免中间态
- **`.harness-profile` 默认加 .gitignore**：profile 选择是个人/机器决策，不应跟 repo 走（但用户可手动取消）

---

## 引用

- 派生算法：[lib/derive.sh](lib/derive.sh)
- 单元测试：[lib/test-derive.sh](lib/test-derive.sh)
- 上游消费者（profile-entry）：[../profile-entry/SKILL.md](../profile-entry/SKILL.md)
- Profile schema：[../profile-entry/references/profiles.md](../profile-entry/references/profiles.md)
MD
```

- [ ] **Step 2: 验证 markdown 渲染（无致命语法错误）**

```bash
wc -l harness/profile-bootstrap/SKILL.md
grep -c "^##" harness/profile-bootstrap/SKILL.md
```

Expected: ~150 行，至少 6 个 ## 标题

- [ ] **Step 3: Commit**

```bash
git add harness/profile-bootstrap/SKILL.md
git commit -m "feat(profile-bootstrap): SKILL.md 入口契约

Step 1-6 流程：
1. 调 derive.sh 派生
2. 决定 hard_floor（公司类 slug 默认硬底）
3. 拼装 yaml
4. harness-pack-test schema 校验
5. 原子写 profile yml + .harness-profile marker + 加 .gitignore
6. 公告

与 profile-entry 严格分工：profile-entry 仍然是只读路由器，bootstrap 单独承担派生+落盘。
触发：用户显式 /profile-bootstrap，或主对话 Claude 在 fallback 失败 + 对话信号明确时主动调用。"
```

---

## Phase 3：profile-entry / context-monitor / autonomy / push-decision（4 件互不影响，可并行）

### Task 3.1：profile-entry 加 realpath 规范化

**Files:**
- Modify: `harness/profile-entry/SKILL.md` (Step 1 段落)
- Modify: `harness/profile-entry/references/profiles.md` (matcher 表)

- [ ] **Step 1: 改 profile-entry/SKILL.md Step 1**

```bash
grep -n "标准 glob" harness/profile-entry/SKILL.md harness/profile-entry/references/profiles.md
# 找到 path_glob 描述行
```

- [ ] **Step 2: 在 SKILL.md 的 Step 1 起始处加规范化说明**

打开 `harness/profile-entry/SKILL.md`，找到 Step 1 标题段落（约 line 39-65），在该段开头插入一段：

```markdown
**CWD 规范化（必须）**：跑 fallback matchers 之前，先对当前 CWD 做 `realpath` 规范化，消除 symlink 抖动。例如 `~/src/api -> ~/work/acme/api` 时，统一用真实路径 `~/work/acme/api` 进行 path_glob 匹配，避免同一个 repo 在不同入口下命中不同 profile。
```

- [ ] **Step 3: 改 references/profiles.md 的 matcher 类型表**

打开 `harness/profile-entry/references/profiles.md`，找到 path_glob 那一行（约 line 48-50），原文应当是：

```
| `path_glob` | 当前 CWD 路径 | 标准 glob，支持 `**`；`~` 展开为 `$HOME` |
```

替换为：

```
| `path_glob` | 当前 CWD 路径（`realpath` 规范化后） | 标准 glob，支持 `**`；`~` 展开为 `$HOME` |
```

- [ ] **Step 4: 验证修改生效**

```bash
grep -n "realpath" harness/profile-entry/SKILL.md harness/profile-entry/references/profiles.md
```

Expected: 至少 2 处提及 realpath

- [ ] **Step 5: Commit**

```bash
git add harness/profile-entry/SKILL.md harness/profile-entry/references/profiles.md
git commit -m "fix(profile-entry): path_glob 匹配前 realpath 规范化 CWD

修复 codex 抓出的 symlink 抖动 bug：同一 repo 在不同 symlink 入口（如
~/src/api 实际是 ~/work/acme/api 的链接）下会命中不同 profile，导致
'检测偶发失败'。

仅文档级 patch — profile-entry 仍然是薄只读路由器，未引入对话信号识别
或自动落盘逻辑（这两项交给独立的 profile-bootstrap）。"
```

---

### Task 3.2：context-monitor.sh 阈值改 task_type 自适应

**Files:**
- Modify: `harness/hooks/context-monitor.sh` (line 22-23 + line 99-135)

- [ ] **Step 1: 备份现脚本**

```bash
cp harness/hooks/context-monitor.sh harness/hooks/context-monitor.sh.bak
```

- [ ] **Step 2: 删除固定阈值常量**

打开 `harness/hooks/context-monitor.sh`，找到 line 22-23：

```bash
readonly THRESHOLD_WARN=70   # percent — suggest re-injection
readonly THRESHOLD_CRIT=85   # percent — strongly recommend new session
```

替换为：

```bash
# 阈值按 task_type 自适应（在主体逻辑里读取）
# 用户可通过环境变量覆盖（例：HARNESS_QUICK_CRIT_THRESHOLD=85）
```

- [ ] **Step 3: 在 line 99 之前（pct 计算之后），插入阈值选择逻辑**

找到 `pct=$(( tokens_used * 100 / CONTEXT_LIMIT ))` 那一行（约 line 82），紧接的下一段（"Read current task context for targeted advice"）保留。在这段之后、`recommend_skill()` 函数之前，插入：

```bash
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
```

- [ ] **Step 4: 改 line 101 `THRESHOLD_CRIT` → `threshold_crit`**

把后续两处 `THRESHOLD_CRIT` / `THRESHOLD_WARN`（约 line 101, 103, 117, 120）的常量引用改成小写变量：

```bash
# Before
if (( pct >= THRESHOLD_CRIT )); then
  echo -e "${RED}⛔ Context 使用已超 ${pct}%（临界：${THRESHOLD_CRIT}%）${RESET}"
...
elif (( pct >= THRESHOLD_WARN )); then
  ...
  echo -e "${YELLOW}⚠️  Context 使用已超 ${pct}%（警戒：${THRESHOLD_WARN}%）${RESET}"

# After
if (( pct >= threshold_crit )); then
  echo -e "${RED}⛔ Context 使用已超 ${pct}%（临界：${threshold_crit}%）${RESET}"
...
elif (( pct >= threshold_warn )); then
  ...
  echo -e "${YELLOW}⚠️  Context 使用已超 ${pct}%（警戒：${threshold_warn}%）${RESET}"
```

用 sed 批量改：

```bash
sed -i '' 's/THRESHOLD_CRIT/threshold_crit/g; s/THRESHOLD_WARN/threshold_warn/g' harness/hooks/context-monitor.sh
```

- [ ] **Step 5: 验证 bash 语法**

```bash
bash -n harness/hooks/context-monitor.sh
echo "Exit: $?"
```

Expected: Exit 0

- [ ] **Step 6: 手动模拟测试**

```bash
# 模拟 quick task 在 85% — 应不触发
mkdir -p /tmp/context-test && cd /tmp/context-test
cat > .harness-status.json <<EOF
{
  "cronJobId": "test",
  "tokensUsed": 170000,
  "effective_task_type": "quick"
}
EOF
~/Music/myskills/harness/hooks/context-monitor.sh
echo "Exit: $?"
# Expected: 无任何输出（85% < quick 的 90% crit），exit 0
```

```bash
# 模拟 feature task 在 85% — 应触发 crit（85% > feature 的 80% crit）
cat > .harness-status.json <<EOF
{
  "cronJobId": "test",
  "tokensUsed": 170000,
  "effective_task_type": "feature"
}
EOF
~/Music/myskills/harness/hooks/context-monitor.sh
# Expected: 输出 ⛔ Context 使用已超 85%（临界：80%）
cd ~/Music/myskills && rm -rf /tmp/context-test
```

- [ ] **Step 7: 删除备份**

```bash
rm harness/hooks/context-monitor.sh.bak
```

- [ ] **Step 8: Commit**

```bash
git add harness/hooks/context-monitor.sh
git commit -m "feat(hooks): context-monitor 阈值改 task_type 自适应

| task_type | warn | crit |
|-----------|------|------|
| quick     | 80%  | 90%  |
| bugfix    | 70%  | 85%  |
| feature   | 60%  | 80%  |
| refactor  | 60%  | 80%  |
| 无（无 status file 或无 effective_task_type）| 70% | 85% |

每档可通过环境变量覆盖（HARNESS_QUICK_CRIT_THRESHOLD 等）。

理由：
- quick 任务短，过早提醒打扰；阈值上调
- feature/refactor 长流程，提前 60% 警戒避免最后阶段被自动压缩冲掉
- bugfix 保持原阈值"
```

---

### Task 3.3：autonomy.md 改 risk-based 描述

**Files:**
- Modify: `harness/harness-workflow/references/autonomy.md` (line 8-12)

- [ ] **Step 1: 读现有内容定位**

```bash
sed -n '7,14p' harness/harness-workflow/references/autonomy.md
```

- [ ] **Step 2: Edit autonomy.md 的人工介入表**

打开 `harness/harness-workflow/references/autonomy.md`，找到表格里第 4 行：

```markdown
| 4 | Git 推送 | Stage 8 收尾 commit 后 | 最终报告输出后可询问一次，用户同意才 push，绝不静默自动 push |
```

替换为：

```markdown
| 4 | Git 推送（high risk） | commit 后 push-decision 评估 high | 输出原因，拒绝 push，要求人工 |
| 5 | Git 推送（medium risk） | commit 后 push-decision 评估 medium | 单次询问，用户 y 才 push |
```

并把表格底下那句：

```markdown
**其余一切自治**，包括 S/M 级全流程、架构判断、规划、审查、测试、收尾。git commit 自治，git push 需用户确认。
```

替换为：

```markdown
**其余一切自治**。git commit 自治；git push 由 push-decision 规则决定（low 自动 / medium 询问 / high 拒绝），公司 profile（hard_floor 含 auto_push）永远走 high 分支。

> **2026-04-25 改动**：原"绝不静默自动 push"改为 risk-based 决策，规则见
> [`harness-common/references/push-decision.md`](../../harness-common/references/push-decision.md)。
> 个人项目低 risk 改动（如 markdown / i18n）允许自动 push；公司项目通过 hard_floor
> 永久强制 high 分支，行为与原契约等价。
```

- [ ] **Step 3: 验证修改**

```bash
grep -n "push-decision" harness/harness-workflow/references/autonomy.md
```

Expected: 至少 2 行命中

- [ ] **Step 4: Commit**

```bash
git add harness/harness-workflow/references/autonomy.md
git commit -m "docs(autonomy): git push 改 risk-based 决策

破坏性改动：原'绝不静默自动 push'放宽为：
- low risk（仅 md/i18n/独立新模块） → 自动 push
- medium risk → 单次询问
- high risk（公共契约/>3 文件/.env/CI/测试 fail）→ 拒绝

公司项目通过 hard_floor [auto_push] 永久走 high 分支，行为不变。

详细规则：harness-common/references/push-decision.md（下个 commit）"
```

---

### Task 3.4：新建 push-decision.md（risk 规则）

**Files:**
- Create: `harness/harness-common/references/push-decision.md`

- [ ] **Step 1: 写文档**

```bash
cat > harness/harness-common/references/push-decision.md <<'MD'
# push-decision — Git Push 风险评估规则

> 本文件由 leaf skill（harness-quick / harness-bugfix / harness-feature / harness-refactor）在 commit 之后调用。
> 完全规则化，**不调用 LLM** 当场推理。

## 输入

- `profile_hard_floor`: 列表（来自 resolved profile 的 `hard_floor` 字段）
- `git diff --stat HEAD~1 HEAD`: 本轮 commit 的改动
- `git diff HEAD~1 HEAD`: 完整 diff（用于 keyword 检查）
- 测试结果（feature/bugfix Stage 6 输出，如果可得）

## Step 1: 公司硬底优先

```
if "auto_push" in profile_hard_floor:
    print "Push: REFUSED (公司 profile hard_floor 禁止 auto_push)"
    return REFUSE
```

## Step 2: 改动 risk 评估（仅个人项目）

按以下顺序判断（先命中先决定）：

### HIGH（强制人工 push，不询问）

任一命中即评 HIGH：

| 条件 | 检测 |
|------|------|
| 涉及 secrets | diff 含 `.env` / `.secrets` / `*credentials*` 等文件名 |
| 改 dependencies | diff 含 `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` 的 dependencies / requires 段 |
| 改 db schema | diff 含 `migrations/` / `schema.sql` / `*.sql` |
| 改 CI/构建 | diff 含 `.github/workflows/` / `Dockerfile` / `Makefile` / `.gitlab-ci.yml` |
| 大改动 | files_changed > 3 |
| 测试失败 | 任一现有测试 fail |
| 破坏性 keyword | diff 含 `BREAKING` / `DROP TABLE` / `rm -rf` / `force_destroy` |
| 改公共导出 | diff 含 `index.ts` / `__init__.py` / `lib.rs` 等公共入口文件 |

### LOW（自动 push）

所有条件都满足才评 LOW：

| 条件 | 检测 |
|------|------|
| 文件类型 | 仅 `*.md` / `*.txt` / `*.po` / `*.json`（i18n） |
| 或 仅注释/docstring | diff 中所有非空行都以注释 marker 起始（`#` / `//` / `/* */` / `--`） |
| 或 新增独立模块 | 新文件，且 `git grep` 在现有代码中找不到 import 引用 |
| 或 单文件小改 | files_changed = 1 且 diff 行数 < 10 且全是 string literal 改动（`"..."` 或 `'...'` 内的内容） |

### MEDIUM（询问一次 push）

不命中 HIGH、不命中 LOW → 默认 MEDIUM。

## Step 3: 执行决策

```
HIGH:
  echo "❌ Push 被阻拦：原因 ${reason}。"
  echo "   请人工 push: git push origin ${branch}"
  return REFUSE

LOW:
  echo "✓ Risk: low (${reason})。自动 push。"
  git push origin ${branch}
  return AUTO_PUSHED

MEDIUM:
  echo "⚠ Risk: medium。是否 push？[y/N]"
  read answer
  if [[ "${answer}" == "y" ]]; then
    git push origin ${branch}
    return USER_PUSHED
  else
    echo "Push 跳过。手动: git push origin ${branch}"
    return SKIPPED
  fi
```

## Step 4: Override flags

| flag | 行为 |
|------|------|
| `/no-push` | 强制跳过 push（任何 risk 都不 push） |
| `/yolo` | aggressive mode → MEDIUM 自动通过；HIGH 仍然 REFUSE（hard_floor 不可绕过） |
| `/safe` | conservative mode → LOW 也降级为 MEDIUM 询问 |

## Step 5: commit message 启发式

特殊 commit message 规则：

- message 含 `wip` / `WIP` / `temp` → 强制 MEDIUM（即使 risk 算 low）
- message 含 `revert` / `rollback` → 强制 HIGH（拒绝 auto push，要求人工确认）

## codex 反对意见（已记录）

codex strict reviewer 反对"个人项目低 risk 自动 push"，理由：
- 与原 autonomy.md 第 4 项"绝不静默自动 push"冲突
- 不同 leaf skill 风险判断不一致

本规则采纳 user feedback（risk-based）的决策见 spec §3.4 末尾 + §7 风险表。
用户随时可在 `~/.claude/profiles/harness.yml` 加 `hard_floor: [auto_push]` 关掉自动行为。

## 测试

leaf skill 在调用本规则前，应能本地复现：

```bash
git diff --stat HEAD~1 HEAD     # files changed
git diff HEAD~1 HEAD             # full diff
.harness-status.json -> last_test_result
```

无以上输入时，默认评 MEDIUM（保守）。

## 引用上游

- 决策原则：spec `docs/superpowers/specs/2026-04-25-setup-zero-questionnaire-design.md` §3.4
- autonomy 改动：[../../harness-workflow/references/autonomy.md](../../harness-workflow/references/autonomy.md)
- profile schema：[../../profile-entry/references/profiles.md](../../profile-entry/references/profiles.md)
MD
```

- [ ] **Step 2: 验证内容完整**

```bash
wc -l harness/harness-common/references/push-decision.md
grep -c "^##" harness/harness-common/references/push-decision.md
```

Expected: ~140 行，至少 7 个 ## 标题

- [ ] **Step 3: Commit**

```bash
git add harness/harness-common/references/push-decision.md
git commit -m "feat(push-decision): risk-based 自动 push 规则

完全规则化决策（不调 LLM）：
- Step 1: hard_floor 含 auto_push → REFUSE（公司硬底）
- Step 2: 个人项目按 HIGH / LOW / MEDIUM 三档（spec §3.4）
- Step 3: HIGH 拒绝 / LOW 自动 / MEDIUM 询问
- Step 4: /no-push / /yolo / /safe override
- Step 5: commit message 启发式（wip → MEDIUM；revert → HIGH）

文档末尾记录 codex 反对意见 + 用户决策理由。"
```

---

## Phase 4：4 个 leaf skill 改造（依赖 Phase 3 的 push-decision.md，4 个互相不影响可并行）

### Task 4.1：harness-feature 集成 push-decision

**Files:**
- Modify: `harness/harness-feature/SKILL.md`（commit 段落，约 line 278-283）

- [ ] **Step 1: 定位 commit 段落**

```bash
grep -n "git commit" harness/harness-feature/SKILL.md | head -5
```

约 line 280: `8. **git commit**（仅 commit，**不自动 push**）；最终报告后可询问是否推送`

- [ ] **Step 2: 替换 commit 步骤为 push-decision 调用**

打开 `harness/harness-feature/SKILL.md`，找到 Stage 8 收尾清单中的 `git commit` 那一行（约 line 278-283），替换为：

```markdown
7. **删除 `.harness-status.json`** — 清理临时状态文件
8. **git commit + push-decision** — commit 完成后，调用 [push-decision](../harness-common/references/push-decision.md) 规则评估改动 risk：
   - HIGH（公共契约 / >3 文件 / .env / CI / 测试 fail / breaking） → 输出原因 + 拒绝 push
   - MEDIUM（其他业务改动） → 询问一次（"是否 push？[y/N]"）
   - LOW（仅 md / i18n / 注释 / 独立新模块） → 自动 push
   - 公司 profile（hard_floor 含 auto_push）永远走 HIGH
9. **检查 pendingRounds** — 有则自动启动下一轮
```

- [ ] **Step 3: 同步更新自检清单（line ~330）**

找到 Stage 8 自检清单中：

```markdown
- [ ] git commit 完成（push 需用户确认）
```

替换为：

```markdown
- [ ] git commit 完成
- [ ] push-decision 已评估并执行（auto / asked / refused），结果记入 WALKTHROUGH.md
```

- [ ] **Step 4: 验证**

```bash
grep -n "push-decision" harness/harness-feature/SKILL.md
```

Expected: 至少 2 处

- [ ] **Step 5: Commit**

```bash
git add harness/harness-feature/SKILL.md
git commit -m "feat(harness-feature): Stage 8 集成 push-decision 规则

- commit 后自动调用 push-decision 评估 risk
- HIGH 拒绝；MEDIUM 询问；LOW 自动；hard_floor 强制 HIGH
- 自检清单加 'push-decision 已评估并执行' 项"
```

---

### Task 4.2：harness-bugfix 集成 push-decision

**Files:**
- Modify: `harness/harness-bugfix/SKILL.md`（约 line 178）

- [ ] **Step 1: 定位**

```bash
grep -n "git commit" harness/harness-bugfix/SKILL.md
```

- [ ] **Step 2: 替换 commit 段落为 push-decision 调用**

找到现有 git commit 步骤（约 line 178），改为：

```markdown
**最终步骤：commit + push-decision**

1. `git add <changed_files>`
2. `git commit -m "fix: ${bug_summary}"`
3. 调用 [push-decision](../harness-common/references/push-decision.md) 规则：
   - bugfix 改动通常是 HIGH（业务逻辑） → 询问或拒绝
   - 仅当改动满足 LOW 全部条件（如纯日志/typo 修复） → 自动 push
4. 把 push 结果记入 commit message 之后的输出
```

- [ ] **Step 3: 验证**

```bash
grep -n "push-decision" harness/harness-bugfix/SKILL.md
```

Expected: 至少 1 处

- [ ] **Step 4: Commit**

```bash
git add harness/harness-bugfix/SKILL.md
git commit -m "feat(harness-bugfix): commit 后调用 push-decision 评估

bugfix 改动通常 HIGH，会询问/拒绝；纯日志/typo 修复满足 LOW 才自动 push。"
```

---

### Task 4.3：harness-quick 集成 push-decision

**Files:**
- Modify: `harness/harness-quick/SKILL.md`（commit 段落）

- [ ] **Step 1: 定位**

```bash
grep -n -E "(git commit|push)" harness/harness-quick/SKILL.md | head
```

- [ ] **Step 2: 替换 commit 段落**

harness-quick 是单文件 < 10 行的 fast-path，几乎全部满足 LOW 条件。Edit commit 段为：

```markdown
**Step 4: commit + push-decision**

1. `git add <single_file>`
2. `git commit -m "fix: ${summary}"`
3. 调用 [push-decision](../harness-common/references/push-decision.md)：quick 任务通常评 LOW（单文件 < 10 行 typo / 注释 / md），自动 push
4. 公司 profile 例外 → REFUSE
```

- [ ] **Step 3: Commit**

```bash
git add harness/harness-quick/SKILL.md
git commit -m "feat(harness-quick): commit 后调用 push-decision 评估

quick 任务（单文件 < 10 行）通常 LOW 自动 push；公司 profile 强制 HIGH 拒绝。"
```

---

### Task 4.4：harness-refactor 集成 push-decision

**Files:**
- Modify: `harness/harness-refactor/SKILL.md`（commit 段落）

- [ ] **Step 1: 定位**

```bash
grep -n -E "(git commit|push)" harness/harness-refactor/SKILL.md | head
```

- [ ] **Step 2: 替换 commit 段落**

refactor 通常涉及多文件、可能改公共契约 → 大概率 HIGH。Edit commit 段为：

```markdown
**最终步骤：commit + push-decision**

1. `git add <refactored_files>`
2. `git commit -m "refactor: ${summary}"`
3. 调用 [push-decision](../harness-common/references/push-decision.md)：
   - 改 > 3 文件 / 改公共导出 / breaking → HIGH 拒绝
   - 单一模块内重构 → MEDIUM 询问
   - 极少数 LOW（如纯重命名 + 自动 import 修复） → 自动
4. 把 push 结果记入 WALKTHROUGH.md
```

- [ ] **Step 3: Commit**

```bash
git add harness/harness-refactor/SKILL.md
git commit -m "feat(harness-refactor): commit 后调用 push-decision 评估

refactor 改 >3 文件 / 改公共导出 → HIGH 拒绝；单模块重构 → MEDIUM 询问。"
```

---

## Phase 5：README 更新 + 端到端验证

### Task 5.1：README 更新（删 setup 多步问题；加 profile-bootstrap 介绍；改对比表）

**Files:**
- Modify: `harness/README.md`（4.2 节 Step 1-3 段；新增 4.3 profile-bootstrap；6.x 加 push-decision 简介）

- [ ] **Step 1: 改 4.2 节 setup 段落**

打开 `harness/README.md`，找到 4.2 节"首次激活（3 步）"。替换 Step 2 的"跑 setup 脚本"段落为：

```markdown
#### Step 2：跑 setup 脚本（dry-run 默认）

```bash
~/Music/myskills/harness/setup/setup-harness.sh           # dry-run，仅检查
~/Music/myskills/harness/setup/setup-harness.sh --apply   # 实际写入缺失文件
```

脚本不会问任何问题。它会：
1. 检查 `~/.claude/profiles/` 是否有 `default.yml` / `harness.yml` / `company.yml.template`
2. 缺失项在 `--apply` 模式下写默认值（含完整 schema）
3. 检查 `~/.claude/settings.json` 是否注册 Stop Hook，输出 active/inactive 状态 + 注册 snippet（你自己决定要不要加）

push 策略 / 公司项目细节 / Stop Hook 启停**都不再问**：
- push 策略由 leaf skill 在 commit 后按改动 risk 动态决定（详 §6）
- 公司 profile 用 `/profile-bootstrap` 命令派生（详 §4.3）
- Stop Hook 阈值按 task_type 自适应
```

- [ ] **Step 2: 在 4.2 之后插入 4.3 profile-bootstrap 节**

在 4.2 节末尾、原 4.3 节"回退到旧版"之前插入：

```markdown
### 4.3 接入公司项目：/profile-bootstrap

第一次进入公司项目时，运行：

```bash
cd ~/work/acme-api
/profile-bootstrap acme              # slug 自定，默认从 git remote 推导
```

profile-bootstrap 会：
1. `git rev-parse --show-toplevel` 拿 canonical repo root（处理 symlink）
2. `git remote -v` 扫所有 remotes，提取 host/org/repo 精确锚定（origin/upstream 不一致时 abort）
3. 自动派生 `path_glob` 和 `git_remote_regex`，写到 `~/.claude/profiles/company-acme.yml`
4. 在 repo 根写 `.harness-profile`（内容：`company-acme`）+ 加进 `.gitignore`
5. 公司类 slug 默认带 `hard_floor: [auto_push, force_push, destructive_ops, auto_merge]`

下次进入该 repo，profile-entry 通过 marker 直接命中，无需重新派生。

完整契约 → `harness/profile-bootstrap/SKILL.md`

### 4.4 回退到旧版（legacy 备份）
```

（原 4.3 改名为 4.4）

- [ ] **Step 3: 在第 6 节"日常使用"末尾，加 push 决策小节**

找到第 6 节末尾，追加：

```markdown
### 6.x push 决策（risk-based，自动）

leaf skill 在 commit 之后会**自动调用 push-decision 规则**评估改动 risk：

| Risk | 触发条件 | 行为 |
|------|---------|------|
| LOW | 仅 md/i18n/注释；新增独立模块；单文件 <10 行 string 改动 | 自动 push |
| MEDIUM | 一般业务改动 | 单次询问 [y/N] |
| HIGH | .env / dependencies / db schema / CI / >3 文件 / 测试失败 / breaking keyword / 公共导出 | 拒绝 + 要求人工 push |

公司项目（profile hard_floor 含 `auto_push`）**永远走 HIGH 分支**，行为与"绝不静默 push"等价。

flags 覆盖：
- `/no-push` 强制跳过任何 push
- `/yolo` MEDIUM 自动通过（HIGH 仍 REFUSE）
- `/safe` LOW 降级到 MEDIUM 询问

详细规则 → `harness/harness-common/references/push-decision.md`
```

- [ ] **Step 4: 验证**

```bash
grep -n "profile-bootstrap" harness/README.md
grep -n "push-decision" harness/README.md
```

Expected: 各至少 2 处

- [ ] **Step 5: Commit**

```bash
git add harness/README.md
git commit -m "docs(README): 同步 setup 零问卷化 + profile-bootstrap + push-decision

- §4.2 setup 改 dry-run 默认（删 push 策略 / 公司项目 / hook 启停问题描述）
- §4.3 新增 profile-bootstrap 接入公司项目流程
- §4.4 原'回退到旧版'顺延
- §6.x 新增 push 决策三档表 + flags"
```

---

### Task 5.2：harness-pack-test 跑全量验证 + 端到端流程跑通

**Files:**
- 不改任何代码，仅验证

- [ ] **Step 1: pack-test 全 fixture 跑**

```bash
echo "=== valid-pack ==="
harness/tools/harness-pack-test harness/tools/fixtures/pack-test/valid-pack.yml
echo "Exit: $?"
echo ""
for f in invalid placeholder-residue illegal-matcher missing-fields; do
  echo "=== ${f}-pack ==="
  harness/tools/harness-pack-test harness/tools/fixtures/pack-test/${f}-pack.yml
  echo "Exit: $?"
done
```

Expected: valid 全 exit 0；其余 4 个全 exit 1 + 各自 violation 信息

- [ ] **Step 2: 验证 ~/.claude/profiles/ 现状不变（dry-run）**

```bash
md5 -q ~/.claude/profiles/harness.yml ~/.claude/profiles/default.yml ~/.claude/profiles/company.yml.template
harness/setup/setup-harness.sh > /tmp/setup-dryrun.log
md5 -q ~/.claude/profiles/harness.yml ~/.claude/profiles/default.yml ~/.claude/profiles/company.yml.template
diff <(echo) <(echo)  # md5 应一致
```

Expected: 前后 md5 一致（dry-run 不动文件）

- [ ] **Step 3: derive.sh 单元测试**

```bash
harness/profile-bootstrap/lib/test-derive.sh
echo "Exit: $?"
```

Expected: Exit 0

- [ ] **Step 4: context-monitor 阈值测试**

```bash
mkdir -p /tmp/ctxtest && cd /tmp/ctxtest
# quick 任务在 85% — 应不触发（quick crit=90%）
cat > .harness-status.json <<JSON
{"cronJobId":"t","tokensUsed":170000,"effective_task_type":"quick"}
JSON
out=$(~/Music/myskills/harness/hooks/context-monitor.sh)
[[ -z "${out}" ]] && echo "✓ quick@85% 不触发" || echo "✗ quick@85% 错误触发：${out}"

# feature 任务在 65% — 应触发 warn (warn=60%)
cat > .harness-status.json <<JSON
{"cronJobId":"t","tokensUsed":130000,"effective_task_type":"feature"}
JSON
out=$(~/Music/myskills/harness/hooks/context-monitor.sh)
[[ "${out}" == *"⚠️"* ]] && echo "✓ feature@65% warn 触发" || echo "✗ feature@65% 未触发：${out}"

cd ~/Music/myskills && rm -rf /tmp/ctxtest
```

- [ ] **Step 5: 反向引用核查**

```bash
echo "=== push-decision.md 被谁引用？ ==="
grep -rln "push-decision" harness/ --include="*.md" | sort

echo ""
echo "=== profile-bootstrap 被谁引用？ ==="
grep -rln "profile-bootstrap" harness/ --include="*.md" | sort
```

Expected:
- push-decision 被 4 个 leaf skill + autonomy.md + README.md 引用
- profile-bootstrap 被 README.md + profile-entry/SKILL.md（可选）引用

- [ ] **Step 6: 整体推送**

```bash
git status --short
git log --oneline origin/main..HEAD | head -20
git push origin main
```

Expected: 显示本次 plan 的所有 commit，最终推送成功

- [ ] **Step 7: 标记 plan 完成**

无 commit。在 plan 文档底部追加完成时间标记：

```bash
echo "" >> docs/superpowers/plans/2026-04-25-setup-zero-questionnaire-implementation.md
echo "---" >> docs/superpowers/plans/2026-04-25-setup-zero-questionnaire-implementation.md
echo "" >> docs/superpowers/plans/2026-04-25-setup-zero-questionnaire-implementation.md
echo "**实施完成时间**：$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> docs/superpowers/plans/2026-04-25-setup-zero-questionnaire-implementation.md
git add docs/superpowers/plans/2026-04-25-setup-zero-questionnaire-implementation.md
git commit -m "docs(plan): 标记 setup 零问卷化 plan 实施完成"
git push origin main
```

---

## 实施顺序总结

```
Phase 1 (并行)
├── Task 1.1: setup-harness.sh 重写
└── Task 1.2: harness-pack-test 加校验 + 3 fixture

Phase 2 (并行 with Phase 1)
├── Task 2.1: profile-bootstrap/lib/derive.sh + test
└── Task 2.2: profile-bootstrap/SKILL.md

Phase 3 (4 任务全并行)
├── Task 3.1: profile-entry realpath patch
├── Task 3.2: context-monitor 阈值改 task_type
├── Task 3.3: autonomy.md risk-based 描述
└── Task 3.4: push-decision.md 新建

Phase 4 (4 任务全并行，依赖 Phase 3 Task 3.4)
├── Task 4.1: harness-feature 集成
├── Task 4.2: harness-bugfix 集成
├── Task 4.3: harness-quick 集成
└── Task 4.4: harness-refactor 集成

Phase 5 (顺序)
├── Task 5.1: README 更新
└── Task 5.2: 端到端验证 + push
```

**总计 12 个 task / ~50 个 commit / 3 个新文件 / 9 个修改文件**

---
