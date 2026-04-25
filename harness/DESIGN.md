# harness 设计思路总览

**定位**：本文面向"想理解为什么这样设计"的读者，讲设计决策、架构演化历史和 tradeoff。使用指南见 README.md。

---

## 1. 演化历史

### 1.1 初代：task-dispatcher（外层消息分解）

最早的自动化层只做一件事：把用户消息里的多个任务拆开，判断哪些可以并行、哪些必须串行，然后依次或并发执行。

这一层的设计至今没有变过，也不需要变——外层消息分解本身是个稳定的问题，与"跑什么 workflow"正交。task-dispatcher 的职责边界清晰：分解消息、管理依赖、汇总结果。它不关心每个代码子任务的内部如何执行。

### 1.2 原 harness-workflow（单体 8-Stage，363 行）

第一代代码执行 workflow 是一个 363 行的单体 skill 文件。它试图在同一个文件里解决所有问题：

- 项目接入（`--init` / `--adopt`）
- 按规模分档（S/M/L/XL）
- 8-Stage 流水线（PD → 架构 → 规划 → 实现 → review → QA → 安全 → 收尾）
- memory 契约（读取 `docs/memory/` 的教训）
- 漂移检测
- session 注入

**当时合理**：功能刚起步，单体好迭代。

**后来的问题**：单体随功能增长越来越臃肿，三个本来正交的关切被混在一起——"用哪套 skill pack"、"跑哪个 workflow 变体"、"自治等级多激进"——导致文件越来越难维护，注意力稀释（对话越长、模型越难把握前面的指令）也越来越明显。

### 1.3 memory + reviewer 升级（2026-04-22）

在 8-Stage 框架内，做了两个显著增强：

**strict-reviewer 三硬门**：把 reviewer 从"软建议"改成"默认 FAIL 立场 + 三个不可绕过的硬门"：
1. Grounding：是否有事实依据
2. Reproduction：问题是否可复现
3. Coverage：是否覆盖所有关键路径

**`docs/memory/` 契约**：把历史教训（cases / decisions / constraints）结构化沉淀到文件，Stage 3 读 ERRORS 做前置检查，防止同类问题重犯。

这两个机制的设计原则相同：**反谄媚**。Claude 有 politeness bias——默认倾向给出正向回应。把三个硬门设置为硬约束（而非"请酌情参考"），正是为了对抗这个偏差。

### 1.4 knowledge scanner 设计（2026-04-23）

进入存量项目时，harness 只了解技术栈的粗粒度信息（语言/框架 + 3 个命令），不知道：
- 已有代码风格和约定
- 内部组件 / util / SDK 可复用
- 该用什么框架处理异常 / i18n / 上下游

结果是写出"初学者味道"代码，融入不了已有风格。

knowledge scanner 增加了 **Stage -0.5**（Project Context Retrieval）和 5 domain 自适应扫描机制，在开发前自动扫一次项目，把扫描结果沉淀为分散的 markdown 文件（`docs/harness/knowledge/`），运行时按需注入。详见第 5 节。

这一版经过 11 轮 codex 对抗审查收敛，是迄今迭代最密集的 spec。

### 1.5 profile-based dispatch 重构（2026-04-24）

单体 harness-workflow 的三个正交关切被分离成独立维度：

- **Profile**：哪套 skill pack（个人 / 公司 / 默认）
- **Task type**：workflow 变体（quick / bugfix / feature / refactor）
- **Aggression mode**：自治等级（conservative / standard / aggressive）

引入 `profile-entry` 作为轻量路由层，把"分诊"从 8-Stage 流水线里剥离出来，避免每次都把整个 363 行的 skill 加载进来只是为了判断走哪条路。

经过 3 轮 codex 对抗审查收敛（Round 1 发现 7 条硬伤，Round 2 修复大部分，Round 3 只剩 cold-start 路径，F7 补丁解决）。

### 1.6 统一融合（2026-04-24）

将 profile-based dispatch 重构和 knowledge scanner 设计合并到统一框架 `harness/`，同时新增：
- **Stop Hook**（context-monitor）：监控 context 占用，高占用时再注入
- **Setup 命令**：一次性记录用户场景偏好
- **harness-common 共享层**：7 个 references 供所有 sub-skill 引用，不复制

原有 `myskills/` 下的 skill 完全保留，新版在沙盒目录独立运行。

---

## 2. 核心设计原则

### 2.1 入口精简：为什么要拆分

单体 skill 变臃肿的根本原因不是功能多，而是**attention dilution**：Claude 的 context window 有限，对话越长，越早注入的指令越难被"看到"。363 行的 SKILL.md 在 SessionStart 时全量注入，随着对话推进，前面的约束越来越容易被后来的消息覆盖或忽略。

拆分的思路是在三个正交维度上各自瘦身：

| 维度 | 内容量级 | 入口 |
|------|---------|------|
| Profile | profile YAML 几十行 | `~/.claude/profiles/<name>.yml` |
| Task type | 每个 sub-skill 单独文件 | `harness-quick/` / `harness-bugfix/` 等 |
| Aggression mode | precedence 契约 ~30 行 | `profile-entry/references/precedence.md` |

每次调用只加载**一个 leaf sub-skill**，不把所有逻辑塞进同一个对话上下文。

`profile-entry` 本身是一个**薄 router**：只做确定性路由，不做 LLM 分类，不跑重逻辑。路由完成后调用恰好一个 `Skill(...)` 加载 leaf sub-skill，把工作量转移过去。

**为什么不是多个 Skill 调用**：每次 `Skill(...)` 调用都有开销（加载、注入、上下文切换）。profile-entry 内部的路由全是纯文本逻辑，不需要独立的 AI 能力，放在同一次 Skill load 内完成即可——既保持分层清晰，又把"分诊开销"压缩到零额外调用。

### 2.2 确定性优于 LLM 猜

task type 判断有两种方案：让 LLM 语义分类，或用确定性规则。

我们选择**结构性 fast-path**：先跑确定性检查（git diff 元数据），再看显式 flag，再看 profile 默认，最后才 fallback 到 `feature`。

```
if 用户消息无任务类型 flag AND
   git diff --stat 仅 1 文件改动 AND
   diff 大小 < 10 行 AND
   无新文件创建 AND
   目标文件命中 fast-path allowlist
then 路由到 harness-quick（跳过所有 ceremony）
```

**好处**：
- 稳定：同样的输入永远得到同样的结果
- 可追溯：路由决策有明确依据（git diff 数字），可复盘
- 可调：误判时改 allowlist，不用调提示词

**坏处**：
- 偶尔误判。漏判（该 fast-path 没 fast-path）会降级到 feature-path，安全但浪费；误判（结构变更漏进 quick-path）是风险。
- 靠 **allowlist 保守** + 明确文档化排除项缓解。用户也可以显式 flag override（`/feature`）。

LLM 语义分类的问题是：不可追溯（为什么判成 quick？），在边界场景不稳定，且会引入额外推理延迟。

### 2.3 Evidence-first knowledge

Knowledge scanner 的核心约束：**manifest 里的每条 Rule 必须有 `file:line` 级别的代码证据支撑**。

这个设计决定来自一个具体风险：如果允许 AI 自由生成约定，它会基于"常见 Java 项目的约定"而非"这个项目的约定"编造规则。被编造的规则进了 manifest，strict-reviewer 会依此 FAIL 代码，造成虚假阳性。

Evidence-first 的三层防线：

1. **Scanner 阶段**：只有找到 `≥2 个正例` 或 `1 正 + 1 反` 的规则才进 manifest；找不到的降到 TODO 或直接丢弃
2. **用户 override 阶段**：用户批量回答 TODO 后，系统做 **micro-rescan** 验证答案。若代码里找不到足够证据，答案写入 `gaps.md` 作为 `explicit user override`，**不进 manifest**
3. **Cleanup 阶段**：基于 stable ID 精确匹配清理旧条目（`Supersedes Gap ID`），**禁止 text similarity 删除**——大型 repo 里相似表述跨 domain 常见，fuzzy 删除会误伤（codex Round 6 Finding 2）

### 2.4 Hard_floor 不可绕过

公司 profile 的 `auto_push=false` 是**合规硬底**，`/yolo` 不能绕过。

这是刻意设计。软底（"建议不要 push"）在 `/yolo` 下会被忽略；合规要求需要的是硬底。

**实现方式**：profile 的 `hard_floor` 列表里的操作，profile-entry 在 precedence 解析时永远胜出，无论调用 flag 是什么。被压住时必须输出明确的降级说明，**绝不静默**：

```
Requested: /yolo
Effective: company-safe (profile policy: auto_push=false, destructive_ops=false)
Reason: company profile hard-floor
```

静默降级的问题是：用户以为 `/yolo` 生效了，结果系统实际上是 conservative 模式，行为不符预期，难以排查。

### 2.5 Zero-dependency loading

整个框架**不依赖 Claude Code 的内部机制**，特别是 `.claude/commands/` 和 `.claude/skills/` 的 repo-local 行为（这些机制在 Claude Code 版本间的行为未得到验证）。

所有 skill 加载通过：
- `CLAUDE.md` 触发契约（显式告知 Claude 该 repo 有 knowledge，运行前先读）
- 纯 markdown 文件（无需特殊解释器）
- `git`-tracked 文件（跨设备同步，无额外基础设施）

**好处**：跨 Claude Code 版本稳定，不会因为内部机制变化而失效。

**代价**：无法利用可能的平台加速能力（如果平台未来提供的话）。这个 tradeoff 偏向稳定性，在 Claude Code 生态还在演进的阶段是合理的。

---

## 3. 架构三层

### 3.1 Layer 1：task-dispatcher

**职责**：外层消息级分解。

把用户消息里的多个任务提取出来，判断依赖关系（哪些可并行、哪些必须串行），然后依次或并发派发。

**不变的理由**：这一层的问题定义清晰，与下面两层正交，不需要随 workflow 变化而变。

### 3.2 Layer 2：profile-entry

**职责**：单次 Skill load 内完成 6 步路由，加载恰好一个 leaf sub-skill。

6 步按序执行，每步的输入输出明确：

| 步骤 | 输入 | 输出 |
|------|------|------|
| Step 0：读 `.harness-profile` marker | repo 根目录文件 | profile 名 或 absent |
| Step 1：fallback matchers（无 marker 时） | `~/.claude/profiles/*.yml` + CWD | 匹配的 profile 名 + 公告 |
| Step 2：结构性 fast-path 检查 | `git diff --stat` 元数据 | task_type=quick 或 skip |
| Step 3：解析 task type | fast-path 结果 + 用户 flag + profile default | task_type |
| Step 4：解析 aggression mode | hard_floor + flag + profile default | effective_mode |
| Step 5：有转换则输出公告 | 解析结果 | 可选公告文本 |
| Step 6：`Skill(<leaf_sub_skill>)` | task_type + profile + mode | 转移控制权 |

**为什么不多开 Skill 调用**：分层清晰的目标可以通过在同一次 Skill load 内完成多步纯文本逻辑来实现，不需要为每一步都开一次 `Skill(...)` 调用。多一次 Skill 调用 = 多一次上下文注入 + 多一次加载开销。profile-entry 内部逻辑纯确定性（无需 AI 判断），放在同一次调用内是自然的。

### 3.3 Layer 3：leaf sub-skill（4 个 task type）

#### harness-quick

**适用**：1 文件 / 10 行以内 / 无新文件创建 / 目标文件命中 allowlist。

设计原则：**零 ceremony**。直接改 + commit，不走 PRD、不做架构设计、不运行 Stage -0.5、不调 strict-reviewer。

Memory observation 照常写（轻量），这是快路径唯一保留的"overhead"——因为即使是小改动，记录下来也有长期价值。

#### harness-bugfix

面向 bug 修复的专用路径：investigate → 复现 → 修 → 加回归测试 → commit + memory observation。

**关键设计**：调用 `investigate` skill（系统调试方法论）。bug fix 是有标准方法论的场景，调专用 skill 比在通用 feature workflow 里"随机探索"质量高很多。

调 Stage -0.5 读相关 knowledge，调 strict-reviewer 含 knowledge gate。

#### harness-feature

当前 8-Stage 主体。这是最重的路径，有明确的结构：

```
Stage -0.5  Project Context Retrieval（知识加载）
Stage 0     PD（产品设计）
Stage 1     架构
Stage 2     规划
Stage 3     实现
Stage 4     Spec Review（strict-reviewer，知识合规检查）
Stage 5     质量
Stage 6     QA
Stage 7     安全
Stage 8     收尾（memory refresh + knowledge check）
```

Stage -0.5 是 **universal**：S 级任务也不跳过（详见 5.5 节）。

#### harness-refactor

refactor 的独特之处：**在改代码之前必须有 baseline**。baseline 是测试通过状态下的行为快照，用于验证重构没有改变外部行为。

流程：baseline 捕获 → 增量计划（小 commit）→ 持续验证 → 与 baseline 对比。

refactor 也强依赖 Stage -0.5：重构必须了解现有约定，否则很容易把"现有风格"当成"需要改掉的坏习惯"。

### 3.4 harness-common 共享层

7 个 reference 文件，供所有重路径 sub-skill 引用：

| reference 文件 | 内容 |
|---------------|------|
| `memory-contract.md` | 读写 `docs/memory/` 的协议 |
| `project-detection.md` | 项目类型探测逻辑 |
| `phase-init.md` | Phase 1-4 初始化（全局基础设施、配置探测、memory 初始化、校验） |
| `knowledge-retrieval.md` | Stage -0.5 完整流程 + render pipeline |
| `project-scanner.md` | 5-phase scan pipeline |
| `reviewer-integration.md` | strict-reviewer 调用契约（含 5 knowledge 字段） |
| `maintenance.md` | `--maintain` 12 项 audit（原 6 条 + 新 6 条 knowledge audit） |

**引用方式**：sub-skill 通过 `见 references/<topic>.md` 引用，不复制内容。复制会导致 drift——两处内容最终会不一致，且没有机制检测。

---

## 4. 三维正交矩阵

### 4.1 Profile（决定哪套 skill pack）

Profile 是"项目场景"的封装，每个 profile 对应一套 task_types 映射 + 默认配置 + 合规约束。

**解析顺序**：
1. `.harness-profile` marker（repo 根目录，用户显式指定）
2. fallback matchers（按 `priority` 排序，取最高优先级）
3. `default` profile（always-match, priority=0）

**Marker 校验**：marker 存在但与 fallback matcher 结果不一致时，profile-entry 警告（不阻断）。这处理了 repo 改名/复制后 marker 过期的情况。

**Fallback 冲突**：两个 matcher 同优先级且无法决胜（长 path glob 胜短 glob，git_remote_regex 胜 path-only），报硬错误，强制用户创建 `.harness-profile`。

**为什么不让 LLM 猜 profile**：profile 决定合规策略（hard_floor），猜错的代价太高。确定性 matcher 失败会报错，LLM 猜错会静默走错 profile。

### 4.2 Task type（决定 workflow 变体）

**解析顺序**：
1. 结构性 fast-path（git diff 元数据，确定性）
2. 显式 flag（`/quick` / `/fix` / `/refactor`）
3. profile 默认（一般是 `feature`）

Fast-path 的优先级最高，这保证了"改一行字幕"不会走 8-Stage 流水线。

### 4.3 Aggression mode（决定自治等级）

**Precedence 铁律**：`profile hard_floor > 调用 flag > profile 默认 > 内置 conservative`

三个 mode：
- `conservative`：最少自治，所有写操作、push、部署都需要确认
- `standard`：正常自治，标准 workflow
- `aggressive`（`/yolo`）：最多自治，尽量减少确认

**只支持每次调用 flag，不跨 turn 持久化**。

这是刻意设计：跨 turn 持久化 aggression mode 意味着"上轮 `/yolo` 了，这轮还在 aggressive 模式"，用户很容易忘记。每次调用 flag 强制用户显式声明意图，避免"意外 aggressive"。

Mode 变化才输出公告，不变不输出。这是"节制"原则：噪音越少，有效信息越突出。

---

## 5. Knowledge 机制

### 5.1 5 domain 自适应 scanner

经过 spec 收敛分析，确定 5 个 domain 而不是更多或更少：

| Domain | 关注点 |
|--------|--------|
| `style-and-structure` | 代码风格、文件组织、命名约定、模块分层 |
| `internal-components` | 内部 util / 公共组件 / 复用约定 |
| `exception-and-error-contracts` | 异常层次、错误封装、Result wrapper 等 |
| `integrations-and-sdk-usage` | 外部 SDK 调用方式、HTTP client 封装、adapter 层 |
| `i18n-and-text-boundaries` | 文案管理、多语言资源文件、文本边界处理 |

`style-and-structure` 和 `internal-components` **总是激活**，其余 3 个按 scout 探测信号决定。

**为什么是 5 个**：build-test-runtime 类信息折叠进 style 或 integrations 已经足够，独立出来会导致 domain 边界模糊。超过 5 个 domain 说明分类本身有问题。少于 5 个会导致某些重要维度（如 i18n、SDK 用法）被塞进不合适的 domain。

### 5.2 manifest / evidence / gaps 三文件分离

每个 domain 三个文件，职责严格分离：

| 文件 | 大小上限 | 使用时机 |
|------|---------|---------|
| `manifest.md` | ≤ 140 行 | 运行时检索，Stage -0.5 注入 |
| `evidence.md` | ≤ 220 行 | audit 用，不参与运行时注入 |
| `gaps.md` | 按需生成 | 条件生成（有未解问题时） |

**manifest 上限 140 行**的理由：manifest 在每轮开发前注入，过长会占用过多 context，稀释后续指令的注意力。超出时，scanner 必须挤掉 low-impact 规则。

**evidence 不参与运行时注入**：evidence 是 audit trail，是给人看的（"为什么有这条 Rule"），不是给模型看的。运行时注入 evidence 会把 file:line 示例塞进 prompt，增加 token 消耗而不增加指令清晰度。

### 5.3 Rule Status 四态

每条 Rule 有独立的 Status，与 manifest 级别的整体 status 分开管理：

| Status | 含义 | Stage -0.5 处理 | Reviewer 行为 |
|--------|------|----------------|--------------|
| `active` | 正常有效 | 进 `knowledge_requirements`（binding） | 违反 → FAIL |
| `expired` | `free_form_review` rule 时间过期 | 进 `advisory_knowledge`（非强制） | 不 FAIL，仅提示 |
| `drifted` | 代码演化后违反率 >30%（且样本 ≥5） | 不进任何上下文，记 knownIssue | 不触发 |
| `superseded` | 被新 Rule 取代 | 不进任何上下文，保留历史 | 不触发 |

**为什么四态**：从 spec 的 Round 5 review 推导出来的。

- 只有两态（active/inactive）无法区分"暂时过期但可恢复"（expired）和"代码走了另一条路"（drifted）——两者的处理逻辑完全不同
- `drifted` 不进 advisory 是因为 drifted rule 已**过时**，注入会误导模型遵循一个已被抛弃的约定
- `superseded` 保留在 manifest 作历史记录，但不注入，防止新旧冲突

**`drifted` vs `expired` 的关键区别**：
- `expired`：rule 本身可能仍然正确，只是 `free_form_review` 的时效性要求到期了（没有人工 refresh 验证），降级为 advisory 而非 FAIL 依据
- `drifted`：rule 已经过时了，代码已经演化到新约定，继续注入会导致错误

### 5.4 Render Pipeline

**关键约束：禁止直接注入 raw manifest 全文**。

原因：manifest 含 active / expired / drifted / superseded 四态 rule，直接注入会把非 binding 的 rule 当 binding 推给 subagent——模型无法自行区分这四种状态下的 rule。

Render pipeline 是 Stage -0.5 执行的过滤步骤：

```
for each manifest in relevant_knowledge_files:
  parse 所有 rule blocks
  for each rule:
    if Status == "active":
      render 到 Binding Rules view
    elif Status == "expired":
      render 到 Advisory Context view (source: expired_rule)
    elif Status in ("drifted", "superseded"):
      skip，追加到 coordinator 的 knownIssue log

for each entry in INDEX ## User Overrides (过滤到命中 domain):
  render 到 Advisory Context view (source: user_override)

合并两个 view 生成最终注入文本
```

这个两视图设计（Binding Rules + Advisory Context）来自 codex Round 9 的关键发现：subagent 收到的 knowledge context 必须有清晰的语义层级。"必须遵循" vs "可以参考"是完全不同的约束，合在一起会导致模型不知该优先哪个。

### 5.5 Stage -0.5 Universal

Stage -0.5 在**所有任务规模**（包括 S 级）下不跳过。

**理由**：S 级任务跳过 knowledge 注入的代价是，模型在不了解项目约定的情况下改动代码。即使改动很小，违反了关键的内部约定（如 Result wrapper 封装规范）也会被 reviewer FAIL，不如一开始就加载。Stage -0.5 的执行成本相对于整轮 workflow 可以忽略不计。

**Disable 机制**：只在 `CLAUDE.md` 里声明，不在 `INDEX.status` 里表达。

理由：disable 是**用户决策**（"我知道这个项目有 knowledge，但这次我不想用"），`CLAUDE.md` 是用户主笔区；`INDEX.md` 是 scanner 产物，用户不应该被迫去编辑 scanner 的输出来做用户级决策。

**`effective_index_status` 与 `INDEX.status` 的分离**：前者是运行时计算值（Stage -0.5 读 CLAUDE.md 后得出），后者是 scanner 写入的持久状态。两者可以不同——CLAUDE.md 写了 `disabled` 时，无论 INDEX.status 是什么，effective 都是 `disabled`。

### 5.6 与 memory 的分工

两套机制互补，不替代：

| 维度 | knowledge（本 spec）| memory（已实施）|
|------|-------------------|----------------|
| 时机 | 接入时一次性扫描 | 开发过程逐轮积累 |
| 内容 | 代码 idiom / 约定 / SDK 用法 | bug cases / 架构决策 / 遗留约束 |
| 来源 | AI 读现有代码 + 用户批量回答 | 每轮 Stage 2/6/7/8 实时沉淀 |
| 位置 | `docs/harness/knowledge/` | `docs/memory/{cases,decisions,constraints}/` |
| 更新频率 | 低（`--rescan`） | 高（每轮可能加） |

**Stage 执行顺序**：Stage -0.5 先读 knowledge（静态 inventory，接入时一次性扫），Stage 3 再读 memory 的 ERRORS（动态教训，逐轮积累）。

顺序不能倒置：knowledge 是"这个项目怎么写代码"的上下文，memory 是"这个项目踩过哪些坑"的历史，前者是框架，后者是案例，框架先于案例注入才合理。

---

## 6. 审稿第 4 硬门

### 6.1 Default-FAIL 立场

strict-reviewer 的基础设计哲学：**默认 FAIL，需要充分证据才 PASS**。

为什么反直觉？Claude 存在 politeness bias——倾向于找到正面角度，在有疑问时给出"基本可以"的评价。软 guidance（"请仔细检查是否有问题"）在这个偏差下效果很差。

把 reviewer 的默认态改为 FAIL，强制它证明"没问题"而非"找到问题才说"。这是对抗 politeness bias 最直接的设计。

**防 review 疲劳**：三个硬门的标准是客观的（非主观风格评判），有清晰的 PASS/FAIL 判据，避免 reviewer 陷入"这个写法我觉得不太好"式的疲劳。

### 6.2 三硬门（原有）

- **Grounding**：每个结论是否有代码或文档支撑，禁止推断
- **Reproduction**：问题是否可以从现有代码路径复现
- **Coverage**：是否覆盖了所有关键路径（happy path + error path + edge case）

三个门都是**硬门**（任意一个不过 → FAIL），不是加权评分。加权评分会导致"Grounding 很好，Coverage 稍差，总分还行"，绕过了不可跳过的约束。

### 6.3 第 4 硬门：Knowledge Compliance（新）

knowledge scanner 接入后，新增第 4 硬门：实现是否违反了项目的 knowledge Rule。

**只对 `Status: active` 的 rule 做 binding check**。这是关键约束：

- `expired` / `drifted` / `superseded` 的 rule 不进 `knowledge_requirements`，不参与硬门判断
- `known_issues`（drifted rule、filtered manifest 等）只记 scorecard，不导致 FAIL

这个设计防止两个问题：
1. 过时 rule 导致不合理 FAIL（代码其实是对的，是 manifest 过时了）
2. reviewer 在无法判断的情况下盲目 FAIL（超出 knowledge 覆盖范围的代码不应被 knowledge gate 拦截）

Verdict 决定规则（knowledge 相关部分）：

| 条件 | Verdict |
|------|---------|
| 任一 `knowledge_requirement` 被违反 | FAIL |
| INDEX 存在 + `relevant_knowledge_files = []` + `retrieval_outcome = "coordinator_miss"` | BLOCKED（coordinator 漏跑 Stage -0.5）|
| 所有相关 manifest 都只含 non-active rule | 不 BLOCK，warn 建议 rescan |
| changed_files 不命中任何 routing rule | 不 BLOCK（本任务无相关 knowledge）|

---

## 7. Setup + Stop Hook

### 7.1 Setup 的角色

`setup/setup-harness.sh` 是**一次性偏好记录工具**，不是每轮都跑的工作流。

它做三件事：
1. 交互式询问用户主力场景（个人 / 公司 / 混合）
2. 询问 push 策略默认、启用的 profiles 等配置
3. 写入 `~/.claude/profiles/` 对应的 YAML 文件

**为什么不做动态 scene detection（每次根据 CWD 自动判断场景）**：

动态检测的代价：每次调用都要做探测，增加延迟；检测逻辑复杂（如何区分"个人 Go 项目"和"公司 Go 项目"？）；错误时静默走错场景，难以排查。

Setup 是**一次配置，反复受益**。用户显式声明"这台机器的默认场景是什么"，之后 profile matcher 直接按声明走，不猜测。

### 7.2 Stop Hook context-monitor

`hooks/context-monitor.sh` 是 PostToolUse hook，监控 context 占用：

| 阈值 | 动作 |
|------|------|
| 70% | 提醒：context 使用量较高，考虑保存进度后重启 |
| 85% | 强烈建议：按当前 task_type 提供具体的重注入建议 |

**为什么需要 Stop Hook**：SessionStart 注入一次 skill，随着对话推进，早期注入的约束越来越难被"看到"（attention dilution）。Stop Hook 是运行时的补充机制，在 context 占用临界时再注入，补 SessionStart 注入的不足。

**按 task_type 派发重注入建议**：feature 和 bugfix 的中断/恢复方式不同。feature 有明确的 Stage 进度，可以从 Stage 3 重新注入；bugfix 的状态在于复现结果和当前 fix 进度。generic 的重注入建议反而会误导。

---

## 8. 设计决策 tradeoff

| 决策 | Alternative | 为什么选这个 |
|------|-------------|-------------|
| profile-entry 单 skill 内完成路由 | 每个维度各自一个 Skill 调用 | 单 skill 降开销；路由逻辑纯确定性，不需要 AI 能力，不值得额外 Skill 调用 |
| 结构性 fast-path vs LLM 分类 | LLM 语义分类判断 task type | 确定性 + 稳定 + 可追溯 + 可调（allowlist）；LLM 分类在边界场景不可靠 |
| evidence-first vs 纯 LLM 生成 manifest | LLM 直接根据代码写约定 | 防 AI 编造；manifest 会被 reviewer 作为 FAIL 依据，编造的 rule 导致虚假阳性 |
| 4 sub-skill vs 1 通用 skill 按 flag 切 | 1 个通用 skill，内部按 flag 切换 | 关注点分离；每个 sub-skill 只加载自己需要的上下文，model attention 更 focused |
| CLAUDE.md disable vs INDEX.status disable | 在 INDEX.md 内 `status: disabled` | disable 是用户决策，CLAUDE.md 是用户主笔区；INDEX 是 scanner 产物，用户不该编辑 scanner 输出来表达用户决策 |
| hard_floor > flag 的 precedence | flag 可以覆盖所有配置 | 合规底板不可绕；公司 repo 的 `auto_push=false` 若能被 `/yolo` 绕过，该配置无意义 |
| manifest 更新必须走 scanner | reviewer/主 agent 直接改 manifest | 防止实现偏差被"修 manifest 而非修代码"掩盖；evidence-first 要求每次更新都重采证据 |
| 每次调用 flag，不跨 turn 持久化 mode | 跨 turn 持久化 aggression mode | 防止"意外 aggressive"；用户每次显式声明意图，可预测 |
| Stage -0.5 universal | S 级任务跳过 knowledge 注入 | 即使 S 级任务，违反项目约定也会被 reviewer FAIL；提前注入的成本远低于事后重做 |

---

## 9. 未来演进

### 9.1 公司 skill pack

`company.yml.template` 已预留。实际公司 pack 需要用户自行：
1. 填写 detection matchers（公司 repo 路径/git remote）
2. 配置 hard_floor（合规要求）
3. 逐步打磨 4 个 task_type sub-skill（可复用 harness pack，也可完全替换）

这不在 harness 的范围内——公司约定高度差异化，无法预先实现，只能提供接口（`task-type-contract.md`）和工具（`harness-pack-test`）。

### 9.2 其他 profile pack

框架对 profile 是开放的。未来可能的扩展：
- **Rust 生态 pack**：Clippy 集成、Cargo 约定、unsafe 审查
- **Mobile pack**：iOS/Android 各自的 review 重点
- **数据科学 pack**：Jupyter 约定、实验追踪、模型版本管理

每个 pack 只需实现 `task-type-contract.md` 定义的接口，不需要改动框架本身。

### 9.3 更多 task_type

当前 4 个 task_type 覆盖了大部分场景，但未来可能需要：
- `doc-only`：只改文档，跳过所有代码审查
- `test-only`：只改测试，简化的 workflow
- `migration`：数据库迁移专用路径（强依赖 rollback 规划）

新增 task_type 只需在 profile YAML 里声明映射，并实现对应 sub-skill，框架不需要改动。

### 9.4 Plugin 化打包（延后）

将整个 framework 打包成 Claude Code plugin 是可能的未来演进方向，但当前优先级低。

原因：plugin 化需要 Claude Code 平台支持，平台生态还在演变；当前的 markdown + CLAUDE.md 方案已经足够稳定，不值得为了 plugin 化引入对平台机制的依赖（与 2.5 节 Zero-dependency loading 原则冲突）。

---

## 10. 参考资料

### Spec 文档

- `docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md` — profile-based dispatch 架构 spec（3 轮 codex 审查收敛）
- `harness-workflow/specs/2026-04-23-project-knowledge-scanner-design.md` — knowledge scanner spec（11 轮 codex 审查收敛）

### Plan 文档

- `harness/IMPLEMENTATION-PLAN.md` — 综合实施计划（24 tasks / 8 phases）
- `docs/superpowers/plans/2026-04-24-profile-based-dispatch-redesign.md` — profile 拆分 plan（16 tasks）

### Codex Session Transcripts

对抗审查记录存在 `~/.codex/sessions/2026/04/` 下，按日期组织。关键轮次：

- `2026-04-23` — knowledge scanner 11 轮审查（Round 1-5 是架构级别，Round 6-11 是字段一致性 polish）
- `2026-04-24` — profile-based dispatch 3 轮审查（Round 1 发现 7 条硬伤，Round 3 收敛）

### 关键设计决策出处

- `hard_floor > flag`：profile-based dispatch spec § Precedence 契约
- Render pipeline（禁止 raw manifest 注入）：knowledge scanner spec § Task prompt 注入规范 + Round 9 codex
- `stable ID 精确匹配`：knowledge scanner spec § Rescan 模式 + Round 6 codex Finding 2
- `effective_index_status` 分离：knowledge scanner spec § Stage -0.5 Step 0
- Default-FAIL 立场：`strict-reviewer/SKILL.md`（2026-04-22 升级版本）
