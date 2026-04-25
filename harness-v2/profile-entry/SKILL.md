---
name: profile-entry
description: Skill 体系的**入口路由器**。读 .harness-profile marker 或跑 fallback matchers 探测当前项目的 profile（harness / company / default），做结构性 fast-path 检查（git diff 驱动），解析 precedence（profile hard_floor > invocation flag > profile default > conservative），然后加载恰好一个 leaf sub-skill（harness-quick / bugfix / feature / refactor）。薄 router，不跑 LLM 分类，不跨 turn 持久化状态。Triggers：(1) task-dispatcher 派发代码任务时调用 (2) 用户显式 /profile-entry (3) /quick /fix /refactor /yolo /safe flag 时
---

# profile-entry — 入口路由 Skill

**角色**：薄路由器。负责探测 profile、做 fast-path 判断、解析 precedence，然后把控制权交给恰好一个 leaf sub-skill。自己不改代码，不做 LLM 语义分类，不跨 turn 持久化任何状态。

**交叉引用**：
- Profile schema 与 matcher 规则 → [references/profiles.md](references/profiles.md)
- Precedence 契约与 flag 清单 → [references/precedence.md](references/precedence.md)
- Fast-path 触发条件与 allowlist → [references/fast-path.md](references/fast-path.md)
- 跨 pack 任务类型契约 → [references/task-type-contract.md](references/task-type-contract.md)

---

## Step 0 — 读 `.harness-profile` marker 并校验

1. 在当前 CWD（以及 git repo 根目录）查找 `.harness-profile` 文件。
2. 若存在，读取 profile 名称（去除首尾空白）。
3. **校验规则**（全部必须通过，否则发警告）：
   - a. profile 名必须存在于 registry（`~/.claude/profiles/<name>.yml`）
   - b. 该 profile 的 fallback matchers 也必须匹配当前 repo（交叉校验）

**校验失败时的公告格式**（不静默，不中断流程）：
```
⚠ marker 写的是 'harness'，但 repo 不匹配 harness 的探测规则
  （当前路径：/path/to/repo）
  最佳 fallback 匹配：'company-acme'
  继续用 marker 'harness' 还是切到 'company-acme'？
```

4. 校验通过 → **resolved profile = marker 名称**，跳到 Step 2。
5. 校验失败 → 等用户确认后继续，或跳到 Step 1 走 fallback。

---

## Step 1 — 无 marker：跑 fallback matchers

适用于：无 `.harness-profile` 文件，或 marker 校验失败后用户选择切换。

**执行顺序**：

1. 加载 `~/.claude/profiles/*.yml` 中所有 profile 的 `detection` 配置。
2. 按各 profile 的 `detection.priority`（整数）从高到低排序，逐个测试 matchers：
   - `always`：永远匹配（通常 `default.yml` 用此类型，priority=0）
   - `path_glob`：当前 CWD 路径是否匹配 glob pattern
   - `git_remote_regex`：`git remote get-url origin` 输出是否匹配正则
3. **同优先级决胜规则**（按具体度，无需 LLM）：
   - 长 path_glob 胜短 path_glob（字符数更多的 pattern 更具体）
   - git_remote_regex 胜同 priority 的 path-only matcher
4. **仍然平局** → 硬报错，强制用户创建 `.harness-profile`：
   ```
   ✗ 探测到多个同优先级匹配：[profile-a, profile-b]，无法自动选择。
     请在 repo 根目录创建 .harness-profile 文件，内容为目标 profile 名。
   ```
5. **fallback 成功**时，首轮响应第一行必须公开探测结果：
   ```
   Detected profile: harness (matched: path_glob ~/Music/myskills/**, priority 10)
   Override: /profile <name>
   ```

**resolved profile** 确定后进入 Step 2。

---

## Step 2 — 结构性 fast-path 检查

详细规则见 [references/fast-path.md](references/fast-path.md)。

此步骤**完全确定性**，不调用 LLM，不查看任务描述语义。

**触发条件**（全部满足才进入 fast-path）：
1. 用户消息中无任务类型 flag（`/quick` `/fix` `/refactor`）
2. `git diff --stat HEAD` 仅 1 文件改动（staged 或 unstaged）
3. diff 行数 < 10 行（`git diff --stat` 统计）
4. 无新文件创建（`git status --short` 无 `??` 行）
5. 目标文件命中 fast-path allowlist（见 fast-path.md）

**结果**：
- 全部满足 → `fast_path = true`，建议 task_type = `quick`
- 任一不满足 → `fast_path = false`，继续 Step 3 常规解析

---

## Step 3 — 解析 task_type

按以下优先级确定最终 task_type（先命中者胜）：

| 优先级 | 来源 | 值 |
|--------|------|----|
| 1（最高） | fast-path 结果 | `quick` |
| 2 | 显式调用 flag | `/quick` → `quick`；`/fix` → `bugfix`；`/refactor` → `refactor` |
| 3（默认） | profile 配置 `task_types` 中的默认 | 若无显式 flag 且非 fast-path，使用 `feature` |

**fast-path 降档公告**（task_type 被自动降为 quick 时输出一行）：
```
Fast-path: 单文件 <3 行改动，路由到 harness-quick（/fix 覆盖）
```

---

## Step 4 — 解析 aggression mode

按 precedence 契约（见 [references/precedence.md](references/precedence.md)）：

```
profile hard_floor > 调用 flag > profile default_mode > conservative
```

**解析步骤**：

1. 读取 resolved profile 的 `hard_floor` 列表（可空）
2. 读取调用 flag：`/yolo` → aggressive；`/safe` → conservative；无 flag → 空
3. 读取 profile 的 `default_mode`
4. 内置默认：`conservative`

**flag 与 hard_floor 冲突时**，必须输出公告（永不静默降级）：
```
Requested: /yolo
Effective: company-safe (profile policy: auto_push=false, destructive_ops=false)
Reason: company profile hard-floor
```

**无冲突时的 mode 解析**：
- `/yolo` flag → `aggressive`
- `/safe` flag → `conservative`
- 无 flag → profile `default_mode`（若无则 `conservative`）

---

## Step 5 — 转换公告输出

以下情况**必须**输出公告，其余 turn 保持沉默：

| 事件 | 公告内容 |
|------|----------|
| Profile 探测（首次进入或切换） | `Detected profile: <name> (matched: <matcher>, priority <n>)` |
| Flag override 解析 | `Mode: aggressive (flag: /yolo)` |
| Fast-path 自动降档 | `Fast-path: 单文件 <N 行>，路由到 harness-quick` |
| Hard-floor 冲突 | `Requested: /yolo / Effective: <mode> / Reason: hard-floor` |

公告格式：
- 每条独立一行，加粗或使用代码块区分
- 不追加解释性段落（公告即信息，简洁）
- 下次转换前不再重复

---

## Step 6 — 加载 leaf sub-skill

从 resolved profile 的 `task_types` 映射中取出对应 leaf sub-skill 名称，调用：

```
Skill(<leaf_sub_skill>)
```

传递参数：
- 当前 CWD
- 子任务描述（原始用户消息）
- 解析后的 mode（`conservative` / `standard` / `aggressive`）
- 可选：`.harness-context.json`（若存在于 repo 根）

**harness profile 的 leaf 映射示例**：
```yaml
task_types:
  quick:    harness-quick
  bugfix:   harness-bugfix
  feature:  harness-feature
  refactor: harness-refactor
```

完成路由。`profile-entry` 的职责到此为止，后续执行完全由 leaf sub-skill 负责。

---

## 硬约束

以下行为**被明确禁止**，任何情况下都不得违反：

1. **不自己改代码**：`profile-entry` 是纯路由层，不读文件内容，不写任何源码。
2. **不做 LLM 语义分类**：task_type 解析基于 flag + fast-path + 配置，从不调用语言模型判断任务类型。
3. **不跨 turn / 跨 CWD 持久化 aggression mode**：每次调用独立计算 mode，不缓存，不继承上一 turn 的状态。
4. **hard_floor 冲突必须公开**：flag 被 hard_floor 压制时，永不静默降级，格式如 Step 4 所示。

---

## 快速参考：完整路由流程图

```
进入 profile-entry
      │
      ▼
[Step 0] .harness-profile 存在？
   ├─ 是 → 校验 marker
   │         ├─ 通过 → resolved profile = marker
   │         └─ 失败 → 警告，询问用户
   └─ 否 → [Step 1] 跑 fallback matchers
              ├─ 唯一最高匹配 → resolved profile
              └─ 平局 → 硬报错，要求创建 marker
      │
      ▼
[Step 2] git diff 结构性 fast-path 检查
   ├─ 全部条件满足 → fast_path = true
   └─ 任一不满足 → fast_path = false
      │
      ▼
[Step 3] 解析 task_type
   fast_path → quick
   /fix       → bugfix
   /refactor  → refactor
   默认        → feature
      │
      ▼
[Step 4] 解析 aggression mode
   hard_floor > flag > profile default > conservative
      │
      ▼
[Step 5] 输出必要公告
      │
      ▼
[Step 6] Skill(<leaf_sub_skill>)
```
