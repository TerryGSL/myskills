#!/usr/bin/env bash
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

  export DERIVED_PATH_GLOB="${path_glob}"
  export DERIVED_REMOTE_REGEX="${remote_regex}"
  export DERIVED_REPO_ROOT="${repo_root}"
  return 0
}
