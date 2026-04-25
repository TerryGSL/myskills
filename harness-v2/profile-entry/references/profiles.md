# Profile Registry — Schema 与 Matcher 规则

**角色**：定义 `~/.claude/profiles/*.yml` 的完整 schema，说明 matcher 类型、priority 解析逻辑，并提供真实示例文件。

**被引用自**：[../SKILL.md](../SKILL.md) Step 0 / Step 1

---

## Schema 定义

每个 profile 文件位于 `~/.claude/profiles/<name>.yml`，文件名即 profile 名称（不含扩展名）。

### 必填字段

```yaml
# 字段说明（伪 schema）

name: string                  # profile 标识符，必须与文件名一致
description: string           # 人类可读描述，用于探测公告显示

detection:
  priority: integer           # 整数，高优先级胜低优先级（无上限；0 = 最低）
  matchers:                   # 至少一个 matcher
    - type: always | path_glob | git_remote_regex
      pattern: string         # type=always 时可用 "*"；其他 type 见下方说明

entry_skill: string           # 恒定为 "profile-entry"；预留扩展

task_types:                   # 四个任务类型各映射到一个 leaf sub-skill 名称
  quick:    string
  bugfix:   string
  feature:  string
  refactor: string

default_mode: conservative | standard | aggressive   # 无 flag 时的默认 aggression

hard_floor:                   # 合规硬底操作列表（可为空列表 []）
  - auto_push                 # 禁止自动 git push
  - force_push                # 禁止 git push --force
  - destructive_ops           # 禁止破坏性文件系统操作
  - auto_merge                # 禁止自动合并 PR
```

### Matcher 三种类型

| type | 匹配对象 | pattern 语义 |
|------|----------|--------------|
| `always` | 无条件匹配 | 忽略（可写 `"*"`） |
| `path_glob` | 当前 CWD 路径 | 标准 glob，支持 `**`；`~` 展开为 `$HOME` |
| `git_remote_regex` | `git remote get-url origin` 输出 | Python/Go 风格正则（不含定界符） |

### Priority 与决胜规则

1. **高 priority 整数先测试**。第一个所有 matcher 任一命中的 profile 胜出。
2. **同 priority 时按具体度决胜**：
   - 长 path_glob pattern（字符数更多）胜短 path_glob
   - `git_remote_regex` matcher 胜同 priority 的 `path_glob`-only profile
3. **仍然平局** → profile-entry 硬报错，强制用户在 repo 根创建 `.harness-profile`。

---

## 完整示例文件

### `~/.claude/profiles/default.yml`

```yaml
name: default
description: Fallback profile. Always matches. Conservative defaults.

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
```

**说明**：`always` + `priority: 0` 确保此 profile 永远能兜底。任何 repo 在无更具体匹配时都落入 `default`，以 conservative 模式执行。

---

### `~/.claude/profiles/harness.yml`

```yaml
name: harness
description: 个人项目 profile — Next.js / Go / Python。默认 standard aggression。

detection:
  priority: 10
  matchers:
    - type: path_glob
      pattern: "~/Music/myskills/**"
    - type: path_glob
      pattern: "~/Music/hummv/**"
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
```

**说明**：个人项目无合规硬底，`/yolo` 可完整解禁 aggressive 模式。`priority: 10` 高于 default，因此个人 repo 优先命中此 profile。`git_remote_regex` 作为额外 matcher，保证即使 repo 迁移路径也能匹配。

---

### `~/.claude/profiles/company.yml.template`（STUB）

```yaml
name: company-<填写公司/团队标识>
description: 公司项目 — 严格审查，绝不自动 push

detection:
  priority: 20
  matchers:
    - type: path_glob
      pattern: "<你公司 repo 本地路径，如 ~/work/acme/**>"
    - type: git_remote_regex
      pattern: "<你公司 git 主机正则，如 git\\.acme\\.com[:/].*>"

entry_skill: profile-entry

task_types:
  quick:    <company-quick-skill-placeholder>
  bugfix:   <company-bugfix-skill-placeholder>
  feature:  <company-feature-skill-placeholder>
  refactor: <company-refactor-skill-placeholder>

default_mode: conservative

hard_floor:
  - auto_push        # 永不自动 push；所有 push 必须人工 review 后执行
  - force_push       # 禁止 --force；保护共享分支历史
  - destructive_ops  # 禁止 rm -rf / DROP TABLE 等破坏性操作
  - auto_merge       # 禁止自动合并 PR；必须人工 approve
```

**说明**：`priority: 20` 高于 harness（10），确保公司 repo 不会误匹配个人 profile。`hard_floor` 中的四项是合规硬底，任何 flag（包括 `/yolo`）都无法绕过。实际使用时将 placeholder sub-skill 替换为公司内部 skill pack 名称。

---

## Marker 文件格式

`.harness-profile` 放置在 git repo 根目录（与 `.git/` 同级）。

```
harness
```

内容仅为 profile 名称（单行，去除首尾空白）。文件可加入 `.gitignore`（个人偏好不污染 repo），也可提交（团队统一 profile 时有用）。

---

## 新增 Profile 的步骤

1. 在 `~/.claude/profiles/` 新建 `<name>.yml`，按 schema 填写所有必填字段。
2. 配置 `detection.matchers` 和 `priority`，确保与现有 profile 不产生平局。
3. 确认 `task_types` 中每个 leaf sub-skill 路径已存在（或为已知 placeholder）。
4. 运行 `./tools/harness-pack-test ~/.claude/profiles/<name>.yml` 校验契约合规。
5. 在目标 repo 创建 `.harness-profile` 文件（可选但推荐），内容为 `<name>`。
