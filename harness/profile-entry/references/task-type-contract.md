# 跨 Pack 任务类型契约

**角色**：定义任何 skill pack 实现替代任务类型 sub-skill 时必须遵守的行为契约，包括 hard_floor 遵守、mode echo 约定、标准输入/输出规格，以及契约校验方法。

**被引用自**：[../SKILL.md](../SKILL.md) Step 6

---

## 契约概述

`profile-entry` 路由到 leaf sub-skill 后，该 sub-skill 承担完整的任务执行责任。为使第三方 skill pack 能**无缝替换**官方 `harness-*` sub-skill，每个实现替代任务类型 sub-skill 的 skill pack 必须遵守本契约。

> **声明要求**：每个 task-type sub-skill 顶部必须包含以下声明：
> ```
> 通常由 profile-entry 调用；直调支持但会跳过 profile 探测与 init 检查。
> ```

---

## 四条必要契约

### 契约 1：严守 hard_floor

**规则**：`hard_floor` 列表中的操作**永远不执行**，无论请求来源是用户、`profile-entry`、另一个 sub-skill 还是工具调用。

**可列操作项**：

| 操作项 | 禁止的具体行为 |
|--------|--------------|
| `auto_push` | 执行任何 `git push`（包含隐式 push） |
| `force_push` | 执行 `git push --force` 或 `--force-with-lease` |
| `destructive_ops` | `rm -rf`、数据库 DROP、不可逆 truncate、覆盖线上配置 |
| `auto_merge` | 合并 Pull Request（squash / rebase / merge commit 均禁止） |

**实现要求**：
- sub-skill 在执行任何上述操作前，**先检查**从 `profile-entry` 传入的 mode 参数中的 `hard_floor` 列表。
- 若该操作在 hard_floor 中，立即终止并输出：
  ```
  ✗ 操作被 hard_floor 阻止：auto_push
    Profile: company-acme
    如需执行，请手动运行：git push origin <branch>
  ```
- 不得静默跳过，不得将操作改为"等等执行"。

### 契约 2：遵守 mode echo 约定

**规则**：只在以下**转换点**输出 mode 公告，其余 turn 保持沉默。

| 转换点 | 输出内容 |
|--------|----------|
| 首次进入 sub-skill（profile 探测结果）| `Active: <profile> / <task_type> / <mode>` |
| 调用包含 flag override | `Mode override: aggressive (flag: /yolo)` |
| fast-path 自动降档 | 由 `profile-entry` 负责输出，sub-skill 不重复 |
| hard_floor 冲突 | 由 `profile-entry` 负责输出，sub-skill 补充阻止信息 |

**禁止行为**：
- 每个 turn 重复打印当前 mode
- 在正常执行 turn 插入"当前模式：standard"之类的状态行

### 契约 3：接受标准输入

`profile-entry` 通过 `Skill(<leaf_sub_skill>)` 传递的参数集合：

```
标准输入参数：
  cwd           : string     当前工作目录（git repo 根）
  task          : string     原始用户任务描述
  mode          : "conservative" | "standard" | "aggressive"
  hard_floor    : string[]   从 profile 传入的禁止操作列表（可为空数组）
  profile       : string     resolved profile 名称（如 "harness"）
  task_type     : string     解析后的任务类型（"quick" | "bugfix" | "feature" | "refactor"）
  context_file? : string     .harness-context.json 路径（可选，文件不存在时忽略）
```

**实现要求**：
- 必须接受以上所有非可选字段；`context_file` 不存在时优雅忽略，不报错。
- 直接调用（不经过 `profile-entry`）时，`mode` 默认为 `conservative`，`hard_floor` 默认为 `[]`。
- 不得假定 `context_file` 存在；`.harness-context.json` 是可选辅助，非必要依赖。

### 契约 4：产出标准输出

每次 task-type sub-skill 执行完成，必须产出：

```
标准输出（按顺序）：
  1. 分支上的 commit（或若 conservative 模式则等待用户确认后 commit）
  2. 遵守 mode 的副作用（测试结果、lint 输出等）
  3. 最终 summary（一段简洁中文，说明做了什么 + 遗留项）
```

**实现要求**：
- `conservative` 模式：**每个破坏性步骤之前**等待用户确认（`y/n`）。
- `standard` 模式：关键节点（commit、push、merge 前）等待确认。
- `aggressive` 模式：非 hard_floor 操作自动执行，不等待确认。
- summary 最后一行写明：`观测记录：<是/否> 写入 memory observation`。

---

## 契约校验

契约合规通过 `harness-pack-test` 脚本验证：

```bash
./tools/harness-pack-test ~/.claude/profiles/company.yml
# 跑 fixture 输入，校验契约合规，违规时非零退出
```

**脚本行为**：
1. 读取 profile YAML，提取 `task_types` 映射。
2. 对每个 leaf sub-skill，发送 fixture 输入（含 hard_floor 操作请求）。
3. 检查输出是否包含必要的阻止公告（契约 1）。
4. 检查无无关 mode echo（契约 2）。
5. 检查 commit 存在（契约 4）。
6. 违反任意一条，打印具体违规项并以非零 code 退出。

**fixture 位置**：`tools/harness-pack-test-fixtures/`

---

## 直接调用行为

用户可跳过 `profile-entry`，直接调用某个 task-type sub-skill（例如调试时）。此时：

- **跳过**：profile 探测、marker 校验、fast-path 检查、mode 解析（使用安全默认值）
- **不跳过**：hard_floor 检查（sub-skill 自身必须内置，不可依赖 profile-entry 过滤）
- **安全默认值**：`mode = conservative`，`hard_floor = []`

直调时，sub-skill 顶部声明会提醒用户此行为，避免误解。

---

## 新 Pack 接入检查清单

第三方 skill pack 实现替代 task-type sub-skill 时，发布前确认：

- [ ] 顶部包含"通常由 profile-entry 调用；直调支持但会跳过 init 检查"声明
- [ ] hard_floor 操作检查在执行前（非执行后）运行
- [ ] hard_floor 阻止时输出标准格式（含操作名 + profile 名 + 手动执行提示）
- [ ] mode echo 仅在 4 个规定转换点输出，其余 turn 沉默
- [ ] 接受全部标准输入参数（context_file 可选）
- [ ] 产出 commit + summary，conservative 模式下有确认步骤
- [ ] 通过 `harness-pack-test` 脚本（所有 fixture 零违规）
