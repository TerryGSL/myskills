# Profile — Schema、Matcher 算法、Bootstrap 派生

> **Source of truth**: `packages/harness-cli/src/types/constants.ts` + `resources/schemas/profile.schema.json` + `resources/schemas/marker.schema.json`。如本文档与代码不一致，以代码为准。

定义 profile 是什么、如何探测、如何派生 `.harness-profile` marker。所有 leaf skill 加载前必须有一个 resolved profile。

## Profile Schema（profile.schema.json）

每个 profile 是一份 YAML 文件（`~/.claude/profiles/<name>.yml` 或 `<repo>/.harness-profiles/<name>.yml`），字段：

```yaml
name: "harness"                    # required — profile 唯一标识
description: "..."                 # required
detection:                          # required — 用于 matcher
  priority: 100                    # 整数，越大优先级越高
  matchers:                        # 数组，任一命中即整体命中
    - type: "path_glob"
      pattern: "**/*.gradle"
    - type: "git_remote_regex"
      pattern: "github\\.com[:/]acme/"
    - type: "file_exists"
      pattern: ".acme-marker"
entry_skill: "profile-entry"       # required — 固定值
task_types:                        # required — 该 profile 支持的 leaf 集
  - quick
  - bugfix
  - feature
  - refactor
default_mode: "standard"           # required — conservative | standard | aggressive
hard_floor:                        # required — HARD_FLOOR_FLAGS 子集
  - auto_push
  - force_push
```

### enum 真源

- `MATCHER_TYPES = ['path_glob', 'git_remote_regex', 'file_exists']`
- `TASK_TYPES = ['quick', 'bugfix', 'feature', 'refactor']`
- `AGGRESSION_MODES = ['conservative', 'standard', 'aggressive']`
- `HARD_FLOOR_FLAGS = ['auto_push', 'force_push', 'destructive_ops', 'auto_merge', 'rewrite_history', 'network_install']`（6 项）

详见 [aggression-mode.md](aggression-mode.md) 和 [hard-floor-enforcement.md](hard-floor-enforcement.md)。

## Matcher 算法

profile resolution 的入口决定哪个 profile 当前生效。两条路径，按优先级处理：

### 路径 1：`.harness-profile` marker 显式指定（最高优先级）

读 `<repo>/.harness-profile` YAML：

```yaml
profile: "company/acme"
mode: "standard"                   # 可选，覆盖 default_mode
```

marker 命中 → **跳过**所有 fallback matcher，直接用 `profile` 值加载对应 profile YAML。marker 解析失败（YAML malformed）→ BLOCKED，不静默 fallback。

### 路径 2：Fallback Matcher 探测（marker 不存在时）

枚举所有可见 profile（按 `detection.priority` 降序），对每个 profile 跑 matcher：

```
for profile in sorted(profiles, key=detection.priority, reverse=True):
  for matcher in profile.detection.matchers:
    if match(matcher.type, matcher.pattern, repo):
      return profile   # 任一 matcher 命中即整 profile 命中
```

`match` 实现：

| matcher.type | 检查方式 |
|--------------|---------|
| `path_glob` | repo 内任一文件匹配 glob → 命中 |
| `git_remote_regex` | `git remote -v` 输出匹配 regex → 命中 |
| `file_exists` | repo 根存在指定相对路径 → 命中 |

### Tie-break（同 priority）

按 matcher 具体度（specificity）决胜：

1. `file_exists` > `git_remote_regex` > `path_glob`（前者比后者更精确）
2. 若仍并列 → 字典序取 `name` 最小的

### 全部不命中 → `default` profile

`default` profile 是兜底，hard_floor 为空，task_types 全开，default_mode = standard。

## Bootstrap：派生 `.harness-profile` Marker

`harness profile-bootstrap <slug>` 派生新 profile（个人或公司），动作：

1. 探测当前 repo 的明显信号（`package.json` / `pom.xml` / `build.gradle` / git remote URL）
2. 从模板 `resources/profiles/<slug>.template.yml` 渲染填充
3. 写到 `~/.harness-profiles/<slug>.yml` 或 `<repo>/.harness-profiles/<slug>.yml`
4. 写 `<repo>/.harness-profile` marker：

```yaml
profile: "<slug>"
mode: "standard"
```

5. 输出确认信息（Tier 1 CLI 路径）

**Tier 3 fallback**（无 node）：用户按 [profile-entry SKILL.md](../../profile-entry/SKILL.md) 描述的 bash 算法手算等价输出。

### marker 文件硬约束

- YAML 格式（不是裸 string，不是 JSON）
- 必填 `profile` 字段
- 可选 `mode` 字段（覆盖 profile.default_mode）
- 任何 placeholder 残留（`<slug>`、`{{name}}`）→ matcher 阶段拒绝并报 `placeholder_residue`

## 写入权限

| 文件 | 写入者 |
|------|-------|
| `~/.claude/profiles/*.yml` | 用户手动 / `harness profile-bootstrap` |
| `<repo>/.harness-profiles/*.yml` | `harness profile-bootstrap` |
| `<repo>/.harness-profile` | `harness profile-bootstrap` / `harness init` / `harness adopt` |
| profile 内字段 | 不允许任何 leaf skill 修改（read-only） |

## 失败处理

| 场景 | 动作 |
|------|------|
| marker YAML malformed | BLOCKED，要求修复或删除 marker |
| marker 指向不存在 profile | BLOCKED，提示安装对应 profile 或修改 marker |
| Profile YAML 缺必填字段 | 加载阶段 BLOCKED，issue code = `profile-schema-invalid` |
| 多个 profile 同名 | 取 priority 最大的；若 priority 相同 → BLOCKED，要求人工裁决 |
| `default` profile 也不可读 | 系统级故障，BLOCKED |

## 实现位置

- Schema：`packages/harness-cli/resources/schemas/profile.schema.json`
- Marker schema：`packages/harness-cli/resources/schemas/marker.schema.json`
- Detection 实现：`packages/harness-cli/src/utils/detect.ts`
- Bootstrap 实现：`packages/harness-cli/src/commands/profile-bootstrap.ts`
- Bash fallback 实现：`harness-init/lib/derive.sh`
- 路由集成：见 [routing.md](routing.md)
