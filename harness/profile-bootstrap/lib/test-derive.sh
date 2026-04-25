#!/usr/bin/env bash
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
