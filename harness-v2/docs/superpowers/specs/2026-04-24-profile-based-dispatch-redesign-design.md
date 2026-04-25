# 基于 Profile 的派发重构 — 设计文档

- **日期**：2026-04-24
- **状态**：已批准，待用户最终 review
- **作者**：Claude（Opus 4.7）+ codex（3 轮对抗审查收敛）
- **取代**：当前单体 `harness-workflow/skill.md`（363 行）内部 S/M/L/XL 分支

---

## 问题

当前代码任务入口是单体 `harness-workflow` skill，它的问题：

1. 试图在一个 363 行文件里覆盖所有开发场景（init、adopt、maintain、S/M/L/XL 规模分档、8-Stage 流水线、memory 契约、漂移检测、hooks）
2. SessionStart 时注入，对话越长注意力越稀释
3. 无法表达不同**项目场景**（个人 vs 公司）的默认行为差异
4. 混淆三个正交关切：哪个 skill pack 生效、跑哪个 workflow 变体、自治等级多激进
5. 对"改一行字"和"做一个子系统"用同一套 8-Stage 流程，小任务过度工程

相邻的 `task-dispatcher`（298 行）外层并行/串行分解做得好，但把所有代码任务整个甩给 `harness-workflow`，内层不再分诊。

## 目标

- 入口 skill 瘦身到 ~80 行纯路由逻辑
- 场景能清晰派发到不同 skill pack（harness 个人、公司、未来第三方）
- 琐碎任务自动跳过 ceremony（靠确定性规则，不靠 LLM 猜）
- 公司合规策略（如绝不自动 push）**不可被 flag 绕过**
- 架构支持未来未知的 skill pack 挂载（靠文档化契约）
- 框架保持简单高速 — 多一层没价值的 abstraction 不加

## 非目标

- **不**替换 `task-dispatcher`（外层消息级分解继续由它做）
- **不**实现公司 skill pack 本身（只预留 stub；实际 pack 你另起流程打磨）
- **不**尝试用 LLM 语义判断任务类型
- **不**跨 turn / 跨 CWD / 跨 session 持久化 aggression mode

---

## 架构

### 两层派发

```
用户消息
  ↓
task-dispatcher              (不变 — 外层并行/串行分解)
  ↓ (每个代码子任务)
profile-entry                (新增 — 单次 Skill load；内部路由)
  │
  │ 1. 读 .harness-profile marker（主信号）
  │ 2. 无 marker → 跑 fallback matchers（公开结果）
  │ 3. 结构性 fast-path 检查（确定性，基于 git diff）
  │ 4. 解析 precedence 契约
  │ 5. 加载**恰好一个** leaf sub-skill
  ↓
leaf sub-skill               (harness-quick | harness-bugfix | harness-feature | harness-refactor)
  ↓
应用 aggression mode 执行
```

**为什么是两层不是四层**：`profile-entry` 内部路由全是纯文本逻辑，不多开 Skill 调用。只有解析出最终 leaf sub-skill 后才 `Skill(...)` 一次。既保持分层清晰，又把"分诊开销"压在一次 Skill tool 调用之内。

### 三个正交维度

| 维度 | 决定什么 | 如何解析 |
|----|----|----|
| **Profile** | 哪套 skill pack 负责执行（`harness` / `company` / `default` / 未来 pack） | `.harness-profile` marker → fallback matchers → `default` |
| **Task type** | profile 内部走哪个 workflow 变体（`quick` / `bugfix` / `feature` / `refactor`） | 结构性 fast-path → 显式 flag（`/quick` `/fix` `/refactor`） → profile 默认 `feature` |
| **Aggression mode** | 执行时有多自治（`conservative` / `standard` / `aggressive`） | hard-floor > 调用 flag（`/yolo` `/safe`） > profile 默认 > 内置 conservative |

### Precedence 契约（单一规则）

```
profile hard-floor 策略
  > 每次调用 flag
  > profile 配置默认值
  > 内置 conservative 默认值
```

**hard-floor > flag** 是刻意的。公司 profile 的 `auto_push=false` 是合规硬底；公司 repo 里 `/yolo` **不能**绕过。当底板压住 flag 时，`profile-entry` **必须**输出：

```
Requested: /yolo
Effective: company-safe (profile policy: auto_push=false, destructive_ops=false)
Reason: company profile hard-floor
```

**绝不**静默降级。

### 结构性 fast-path（用确定性替代 LLM 猜）

在考虑显式 flag 或默认值之前，先跑一次确定性检查：

```
if 用户消息无任务类型 flag AND
   git diff --stat 仅 1 文件改动 AND
   diff 大小 < 10 行 AND
   无新文件创建 AND
   目标文件命中 fast-path allowlist
then 沉默路由到 harness-quick
else 尊重 flag，否则默认 harness-feature
```

**Fast-path allowlist**（检测细节见 `references/fast-path.md`）：
- 扩展名在 `{.md, .txt, .json, .yml, .yaml}` OR
- 目标是源码文件 AND diff 不触碰：exported 符号、函数签名、类型定义、SQL schema、migration 文件、`package.json`/`go.mod`/`pyproject.toml`/`Cargo.toml` 的依赖段

检测用 `git diff -U0` 配合按语言的简单正则（**不**做 AST 解析）。误判成本：漏判（该 fast-path 没 fast-path）会降级到 feature-path（安全）；误判（结构变更漏进 quick-path）是风险，靠 allowlist 保守 + 文档化缓解。

这样解决了"用户忘了 `/quick`，小编辑也走重路径"的问题，同时不引入 LLM 分类的不稳定性。

### 探测与 marker 校验

**主信号**：`.harness-profile` 文件放在 repo 根目录，内容为 profile 名。

**校验规则**（全部通过或发警告）：
1. profile 名必须存在于 registry（`~/.claude/profiles/<name>.yml`）
2. profile 自己的 fallback matcher 规则也必须匹配当前 repo（交叉校验；捕获 repo 复制/改名后的过期 marker）

不一致时：
```
⚠ marker 写的是 'harness'，但 repo 不匹配 harness 的探测规则
  （当前路径：/Users/twelve/work/acme-corp/svc-x）
  最佳 fallback 匹配：'company-acme'
  继续用 marker 'harness' 还是切到 'company-acme'？
```

**Fallback matchers**（无 marker 时启用）：
- matchers 有显式整数 `priority`（高优先级胜）
- 同优先级 → 按具体度决胜（长的 path glob 胜短的；git_remote_regex 胜 path-only）
- 仍并列 → 硬报错，强制用户创建 `.harness-profile`

**自动匹配公告**：fallback 解析出 profile（无显式 marker）时，`profile-entry` 在首轮响应第一行必须公开：
```
Detected profile: harness-personal (matched: path_glob ~/Music/myskills/**, priority 10)
Override: /profile <name>
```

### Aggression mode

**只支持每次调用 flag，不跨 turn 持久化**。

| Flag | 效果 |
|----|----|
| `/yolo` | 请求 aggressive 模式（受 hard-floor 约束） |
| `/safe` | 请求 conservative 模式 |
| `/quick` `/fix` `/refactor` | 任务类型 override + 隐含 standard 模式 |

profile 配置给每个 profile 设默认 mode。公司 profile 写死 `hard_floor: [auto_push, force_push, destructive_ops]` — 这些项**任何 flag 都无法解禁**。

**Mode echo 节制**：只在以下转换时输出当前 mode：
- profile 探测（session / 对话首次进入该 profile）
- flag override 解析
- fast-path 自动降档
- hard-floor 冲突

转换公告后续 turn 保持沉默，直到下一次转换。

---

## 文件结构

```
myskills/                                     (repo 根)
├── task-dispatcher/                          (不变)
│   └── skill.md                              298 行
├── profile-entry/                            (新增 — 入口)
│   ├── skill.md                              ~80 行路由逻辑
│   └── references/
│       ├── profiles.md                       profile registry schema + matcher 规则
│       ├── precedence.md                     precedence 契约参考
│       ├── fast-path.md                      结构性 fast-path allowlist
│       └── task-type-contract.md             跨 pack sub-skill 契约
├── harness-common/                           (新增 — 从当前 harness-workflow 抽出)
│   ├── skill.md                              ~80 行
│   └── references/
│       ├── memory-contract.md                (从 harness-workflow/references 移入)
│       ├── project-detection.md              (移入)
│       └── phase-init.md                     (从当前 Phase 1-4 抽出)
├── harness-quick/                            (新增)
│   └── skill.md                              ~50 行
├── harness-bugfix/                           (新增)
│   └── skill.md                              ~80 行
├── harness-feature/                          (新增 — 继承当前 8-Stage 主体)
│   ├── skill.md                              ~150 行
│   └── prompts/                              (从 harness-workflow/prompts 移入)
├── harness-refactor/                         (新增)
│   └── skill.md                              ~100 行
├── harness-workflow/                         (重塑 — 变成 profile 入口 stub)
│   └── skill.md                              ~80 行 — 声明 harness profile，转发给 profile-entry
└── (不变：investigate/、office-hours/、strict-reviewer/、team-*/)

~/.claude/profiles/                           (用户级 registry)
├── default.yml                               always-match fallback, priority=0
├── harness.yml                               个人项目 profile
└── company.yml.template                      STUB：schema + placeholder sub-skill 路径，你之后填
```

### Profile YAML schema

```yaml
# ~/.claude/profiles/harness.yml
name: harness
description: 个人项目 — Next.js / Go / Python

detection:
  priority: 10
  matchers:
    - type: path_glob
      pattern: "~/Music/myskills/**"
    - type: path_glob
      pattern: "~/Music/hummv/**"
    - type: git_remote_regex
      pattern: "github.com:TerryGSL/.*"

entry_skill: profile-entry   # 恒定 — profile 入口从这里分发

task_types:
  quick: harness-quick
  bugfix: harness-bugfix
  feature: harness-feature
  refactor: harness-refactor

default_mode: standard

hard_floor: []               # 个人 profile 无合规硬底
```

```yaml
# ~/.claude/profiles/company.yml.template (STUB)
name: company-<填写>
description: 公司项目 — 严格审查，绝不自动 push

detection:
  priority: 20
  matchers:
    - type: path_glob
      pattern: "<你公司 repo 路径>"
    - type: git_remote_regex
      pattern: "<你公司 git 主机正则>"

entry_skill: profile-entry

task_types:
  quick: <company-quick-skill-placeholder>
  bugfix: <company-bugfix-skill-placeholder>
  feature: <company-feature-skill-placeholder>
  refactor: <company-refactor-skill-placeholder>

default_mode: conservative

hard_floor:
  - auto_push           # 永不自动 push，必须人工审查
  - force_push
  - destructive_ops
  - auto_merge
```

### 跨 pack 任务类型契约

详见 `profile-entry/references/task-type-contract.md`。任何实现替代任务类型 skill 的 skill pack 必须：

1. **严守 hard_floor**：列表里的操作永远不执行，无论请求是谁发的
2. **遵守 mode echo 约定**：在规定转换点输出，其余 turn 沉默
3. **接受标准输入**：当前 CWD、子任务描述、解析后的 mode、可选 `.harness-context.json`
4. **产出标准输出**：分支上的 commit、遵守 mode 的副作用、最终 summary

契约校验通过 `harness-pack-test` 脚本（位于 `myskills/tools/harness-pack-test`，Bash + Node 混合实现）：
```bash
./tools/harness-pack-test ~/.claude/profiles/company.yml
# 跑 fixture 输入，校验契约合规，违规时非零退出
```

---

## 组件职责

### `profile-entry`

**读取**：`.harness-profile`、`~/.claude/profiles/*.yml`、fast-path 检查用的 git 状态

**逻辑**（按序）：
1. marker 查找 + 校验（陈旧/不匹配时警告）
2. 无 marker → 按优先级跑 matchers，选最高，公开结果
3. 结构性 fast-path 检查
4. 解析任务类型：fast-path 结果 → 显式 flag → profile 默认（`feature`）
5. 解析 mode：hard-floor > flag > profile 默认 > conservative
6. 有转换则输出 mode/探测公告
7. 调用 `Skill(<leaf_sub_skill>)`，把解析出的参数带上

**绝不做**：自己改代码、跑 LLM 语义分类、跨 turn 持久化状态。

### `harness-common`

所有 `harness-*` 子 skill 共享的基础设施：
- Phase 1（全局基础设施 — 一次性）
- Phase 2（项目配置 + `.harness-context.json` 探测）
- Phase 3（memory 契约初始化）
- Phase 4（校验 + 初始 commit）
- 漂移检测 + `--maintain` 模式

子 skill 通过 `见 references/harness-common/<topic>.md` 引用，而不是复制一遍。

### `harness-quick`

1 行 / 1 文件 / 无 ceremony 路径。直接改 + commit。无 PRD、无架构、无 plan doc。memory observation 照常写。

### `harness-bugfix`

- Step 1：investigate（调用 `investigate` skill）
- Step 2：复现
- Step 3：修
- Step 4：加回归测试
- Step 5：commit + memory observation

### `harness-feature`

当前 8-Stage 主体减去 Phase init（已下放到 `harness-common`）：
- Stage 0 PD → Stage 1 架构 → Stage 2 规划 → Stage 3 实现 → Stage 4 spec review → Stage 5 质量 → Stage 6 QA → Stage 7 安全 → Stage 8 收尾

### `harness-refactor`

- baseline 捕获（测试通过，行为快照）
- 增量计划（小 commit）
- 持续验证执行
- 与 baseline 最终对比

### `harness-workflow`（重塑后）

瘦身为 `harness` profile 的声明入口。`/harness-workflow --init` / `--adopt` / `--maintain` 命令保留为到 `harness-common` 的 passthrough。用户既有肌肉记忆不破坏。

---

## 迁移计划（摘要 — 详细 plan 在实施阶段产出）

1. 建 `profile-entry/`，写路由逻辑 + references
2. 建 `~/.claude/profiles/{default,harness}.yml` + `company.yml.template`
3. 从当前 `harness-workflow` 抽出 `harness-common/`
4. 把现有 8-Stage 主体拆进 `harness-feature/`
5. 建 `harness-quick/` `harness-bugfix/` `harness-refactor/`
6. 重塑 `harness-workflow/skill.md` 为 profile 声明 stub
7. 加 `harness-pack-test` 脚本做契约校验
8. 更新根 `README.md` 说明新框架
9. 验证：既有 `--init` / `--adopt` / `--maintain` 端到端行为不变

---

## 风险与缓解

| 风险 | 缓解 |
|----|----|
| 结构性 fast-path 对边界场景误判（例如 diff 小但 schema 改动） | fast-path 标准写在 `references/fast-path.md` 里，含显式排除清单，方便调 |
| repo 改名后 marker 校验警告变噪音 | 警告只是信息提示，workflow 继续；用户可手动更新或删除 marker |
| 直接调用子 skill 时跨 skill 对 `harness-common` 的引用失效 | 每个子 skill 顶部段落声明"通常由 profile-entry 调用；直调支持但会跳过 init 检查" |
| 用户忘了当前在哪个 profile | 每次 profile 切换时有探测公告；无参数 `/profile` 打印当前 |
| 新加 skill pack 要改多处 | 靠契约测试兜底 — pack 作者能快速拿到反馈 |

---

## 本 spec 范围外

- 实际公司 skill pack 实现（只预留 stub）
- 基于 hook 的 session 重注入（延后；profile-entry 的按需 Skill load 应该能替代其大部分需求）
- Claude Code 插件化打包（延后；框架可之后再 plugin 化，架构不用动）

---

## Codex 对抗审查记录

3 轮收敛：

| 轮次 | 提出的问题 | 解决 |
|----|----|----|
| 1 | 7 条硬伤（session 持久 yolo、4 跳开销、LLM 任务类型猜测、探测冲突、包装而非替换、cold-start、无 precedence 契约） | 全面重设计 → v2 |
| 2 | 4 条 resolved / 3 条 partial（heavy-path 默认、matcher 平局、cold start），+ 1 个新洞（marker 过度授权） | 4 个精准修复 → v3 |
| 3 | 6/7 sufficient，仅剩 cold-start 显式探测路径 | F7 补丁：default profile `always-match, priority=0` |

所有 codex session transcript 在 `~/.codex/sessions/2026/04/24/*.jsonl`。
