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
# 优先调 harness profile-bootstrap CLI（推荐路径，spec §A PR 4）
harness profile-bootstrap [<slug>] [--remote origin|upstream] [--workspace company|personal] [--yes]

# Tier 3 fallback rules: see harness-init/SKILL.md#第二步
# 无 CLI（断网 / 无 node）→ source bash 算法 oracle：
source harness/profile-bootstrap/lib/derive.sh
derive_profile "${user_slug}"
```

CLI 路径会一站式跑 Step 1-6（派生 + hard_floor + 拼装 + 校验 + 落盘 + .gitignore），
bash fallback 仅做 Step 1 派生，Step 2-6 由调用者手工补齐。

bash fallback 输出（环境变量）：
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
- matcher 类型白名单（path_glob / git_remote_regex）→ 拒绝

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

- TS port + CLI 实现：`packages/harness-cli/src/utils/derive.ts` + `src/commands/profile-bootstrap.ts`
- bash 派生算法（Tier 3 fallback + test oracle）：[lib/derive.sh](lib/derive.sh)
- bash 单元测试（与 jest derive.test 双轨同步）：[lib/test-derive.sh](lib/test-derive.sh)
- 上游消费者（profile-entry）：[../profile-entry/SKILL.md](../profile-entry/SKILL.md)
- Profile schema：[../profile-entry/references/profiles.md](../profile-entry/references/profiles.md)
