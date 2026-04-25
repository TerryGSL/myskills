# harness-workflow：CLI 集成与项目级分发升级

- **日期**：2026-04-24
- **状态**：设计通过，准备进入 writing-plans
- **作者**：Claude (Opus 4.7, 1M context) + Codex（3 轮对抗性评审，收敛为 GO）
- **决策者**：TerryGSL
- **取代关系**：无（是对 Spec 1 / Spec 2 的实施路径补充，不替代它们）
- **前置依赖**：
  - Spec 1：`harness-workflow/specs/2026-04-23-project-knowledge-scanner-design.md`（知识扫描器，11 轮 codex 评审 PASS）
  - Spec 2：`docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md`（profile 调度重设计，3 轮评审 APPROVED）

---

## 一、背景

### 现状问题

用户已批准两份架构 spec：

1. **Spec 1 — 知识扫描器**：让 harness-workflow 在接入存量项目时自动扫出代码约定（5 个领域的 manifest/evidence/gaps 文件），每轮开发前 Stage -0.5 自动注入，strict-reviewer 第 4 硬门验证
2. **Spec 2 — profile 调度**：把当前 363 行的单体 `harness-workflow/skill.md` 拆成 profile-entry 路由器 + harness-common/quick/bugfix/feature/refactor 五层

两份 spec 解决"怎么扫 + 怎么调度"，但没解决四件事：

- **怎么分发**：同事 / 开源用户怎么在自己项目里复现这套体系？目前只能 `git clone myskills` + symlink 到 `~/.claude/skills/`，门槛高
- **怎么保证幂等**：现 `harness-workflow/skill.md` 的 Phase 1-4（全局 hooks / 项目级文件 / 记忆契约 / 提交验证）全是 AI 用 Edit/Write 手写生成，二次运行可能漂移
- **怎么防止字段漂移**：Spec 1 在 11 轮评审后仍被 codex 发现漏掉 `retrieval_outcome` / `known_issues` 字段（`review_target` schema 在 spec 正文和 skill 各写一份，不可能长期对齐）
- **怎么落地 Java 企业 profile**：Spec 2 只留了 `company.yml.template` 占位符，没实体

此 spec 的任务就是给这两份架构 spec 补一条 **分发 + 幂等 + 防漂 + 企业 preset** 的实施路径。

### 目标

1. 产出 `harness-workflow-cli` npm 包（monorepo 位于 `packages/harness-cli/`），承担确定性文件生成 / 模板投放 / 幂等检查
2. 优化现有 `team-init` skill — 唯一需要别人安装的入口 skill（保留原名，内容改成调 CLI + 探测/对话/决策；双重身份：myskills 源 + CLI 投到 `.claude/skills/team-init/`），AI 胶水层
3. 建立"单一真源"机制（TypeScript 类型 + JSON Schema）+ `<!-- @generated -->` 锚点自动派生 + CI 漂移门禁，根治 spec/skill 字段漂移
4. 明确 `harness-workflow` skill 经 Spec 2 重塑后的保名迁移路径（方案 A，触发词不变）
5. 落地 Java 企业 `company-mt` profile 的完整实体（含 overlay skill + Java 种子投到 knowledge/memory）
6. 契约化 managed-files 冲突行为、双 registry 分发、`.harness/learnings/` 三文件保留策略

### 不做的事（Non-goals）

- 不做 plugin 市场（`@mtfe/mtskills` 那种机制），skill 直接打进 CLI 的 `resources/skills/`
- 不做 `--agent-type codex` 抽象（只支持 Claude Code 的 `.claude/skills/`），未来工作
- 不做 block-harness-init 的"反复返工"闭环（验证 → strict-subagent → 改 → 再验证 → 再改，用户明确拒绝）
- 不实现 Spec 1 / Spec 2 本身（它们有各自的 plan，本 spec 只是分发路径）

---

## 二、继承的不可动前提（摘要，这样不用跳文件也能看懂）

### 来自 Spec 1（知识扫描器）

- 在目标仓库生成 `docs/harness/knowledge/<5 领域>/{manifest.md, evidence.md, gaps.md}` + `INDEX.md` + `TODO.md`
  - 5 个领域：`style-and-structure`（代码风格与结构）、`internal-components`（内部组件复用）、`exception-and-error-contracts`（异常与错误契约）、`integrations-and-sdk-usage`（外部集成与 SDK 用法）、`i18n-and-text-boundaries`（i18n 与文本边界）
- 每轮开发新增 Stage -0.5（S 级任务也不跳过）：按 path glob + 关键词 + always-load 选出本轮相关的 manifest，渲染成"强制规则视图" + "参考风格视图"两份注入 Stage 2/3
- strict-reviewer 加一个 Step 5 知识合规检查（违反 manifest 规则 → FAIL）
- 规则状态机有四态：`active` / `expired` / `drifted` / `superseded`；manifest 文件本身也有独立的状态 `active` / `partial` / `drifted` / `superseded_by:<file>`
- `violation_test` 共七种枚举（`must_use_wrapper` / `must_call_component` / `must_not_throw_raw_exception` / `must_use_package` / `must_not_use_pattern` / `must_annotate_with` / `free_form_review`），其中 `free_form_review` 必带 `expiry_after_days`（默认 90 天）
- 证据优先契约：用户答案 ≠ 代码证据，没有 file:line 支撑的规则不进 manifest，只进 `gaps.md` 里的 user override 块
- `CLAUDE.md` 里 `<!-- harness-knowledge:start -->` 契约块，如果内含 `harness-knowledge: disabled` 则本轮跳过整个 Stage -0.5
- Round 11 留下 3 个字段透传类的 Known Spec Gaps（`review_target` 缺 `retrieval_outcome` / `known_issues`，Late Recovery 没重算新字段），留给实施阶段补齐

### 来自 Spec 2（profile 调度）

- `profile-entry` 是内部路由器：ONE Skill 加载 + 内部决策（marker 查找 → fallback matcher → 结构化快速路径 → 优先级解析 → 只加载一个叶子 skill）
- 三个正交轴：
  - **Profile**：决定哪个 skill pack 执行（harness 个人 / company 公司 / default 兜底 / 第三方）
  - **任务类型**：quick / bugfix / feature / refactor
  - **激进模式**：conservative / standard / aggressive
- 优先级硬规则：`profile hard_floor > per-invocation flag > profile 默认 > 内置 conservative 兜底`（company 的 `auto_push=false` 不能被 `/yolo` 绕）
- 结构化快速路径（确定性判定，非 LLM 猜）：1 文件 + <10 行 + 不碰 schema/export/deps → 静默走 quick
- `~/.claude/profiles/<name>.yml` 用户级注册表
- `harness-common` / `harness-{quick,bugfix,feature,refactor}` 四叶 + `harness-common` 共享 Phase 1-4 基础设施
- 跨 profile 任务类型合同 + `harness-pack-test` 合同验证脚本

### 来自 Codex 三轮对抗性评审

- **薄包先行**：先把 `package.json` / `bin` / `resources` / managed-write 和命令壳定下来，再落 spec 实现内容
- **三层记忆共存不互替**：`docs/harness/knowledge/`（扫描产出的静态约定）+ `docs/memory/`（长期积累的案例/决策/约束）+ `.harness/learnings/`（滚动收件箱）
- **双真相是最大陷阱**：同一套状态机如果同时写进 spec 正文 + skill 文案 + CLI 代码 + reviewer 合同，一定漂；**唯一来源必须放在 CLI 的 types/schemas 里**
- **ManagedFile 双 hash 落盘**：`sourceHash` + `targetHash` 持久化，`previousHash` 运行时派生
- **Round 3 GO verdict 的 8 条立场**：见下面"Codex R3 立场表"

---

## 三、用户敲定的决策

| 编号 | 项 | 决定 | 来源 |
|------|-----|------|------|
| UD1 | npm 包名 | `harness-workflow-cli`（无 scope 顶级名） | 用户在 AskUserQuestion 中选定 |
| UD2 | 仓库位置 | myskills monorepo，`packages/harness-cli/` | 用户在 AskUserQuestion 中选定 |
| UD3 | 发布目标 | 公司内部 npm registry + 外部 npm public，双发 | 用户原话"公司内部的 npm 和外部的都可以装" |
| UD4 | 必做 CLI | 是 — "别人下载一个初始化 skill + CLI 完成 init" | 用户原话 |
| UD5 | 保留 `harness-workflow` 触发词 | 是（G3 方案 A） | Codex R3 A3 确认 |
| UD6 | 不学反复返工 | 是 — 不抄 block-harness-init 的验证→返工闭环 | 用户原话"反复确认的我觉得不需要" |

---

## 四、已识别的缺口与解决方案

| 编号 | 缺口描述 | 证据 | 解决方案 |
|------|---------|------|---------|
| G1 | Spec 1 把 `docs/memory/` 当现成前置层用，但实际项目里不存在 | Spec 1 的 Non-goals 说"不替代 docs/memory/"；而 `harness-workflow/skill.md` 的 Phase 3 才创建 `docs/memory/`，先后顺序矛盾 | `harness init` / `harness adopt` 从 `resources/templates/memory/` 投放出整个 `docs/memory/` 树；`harness scan` 运行前调 `doctor` 检 memory 树，缺则硬 abort 并提示 `harness adopt` |
| G2 | skill 正文和 spec 字段漂移 | Spec 1 经 11 轮评审后仍被 codex 发现漏字段（`retrieval_outcome` / `known_issues`）；同一 `review_target` schema 在 prose 和 skill 两处各写一份 | 在 CLI 建立单一真源：TypeScript 类型 + JSON Schema；skill 正文用 `<!-- @generated:xxx -->` 锚点；跑 `npm run generate && git diff --exit-code` 做 CI 漂移门禁 |
| G3 | `harness-workflow` → `profile-entry` 迁移路径不清 | Spec 2 只一句话"reshape skill"；但用户的 SessionStart hook + CLAUDE.md 规则 + 30 个 skill 全引用 "harness-workflow" 这个名字 | 方案 A 保名：`harness-workflow/skill.md` 内部重塑成兼容入口 stub，对外触发词不变，内部 `Skill(profile-entry, {forced_profile: harness})` 调用 |
| G4 | Java 企业 profile 只有占位模板没实体 | Spec 2 的 `company.yml.template` 是 stub | `resources/presets/company-mt/` 完整实体（含 overlay skill + Java 种子映射到 knowledge/memory constraints） |
| G5 | `--init/--adopt/--maintain` 全靠 AI 用 Edit/Write 手写，无幂等保证 | 现 skill.md 14949 字节，Phase 1-4 全是 prose 指令，二次跑容易漂 | 全部收口到 CLI；`ManagedFileRecord` 双 hash 落盘；冲突默认写 `.rej` + 非零退出，company-mt 下冲突 → 整批 BLOCK |

---

## 五、架构

### 5.1 CLI 命令面（5 个命令，codex R3 确认的最终裁剪）

```
harness init [--preset personal|company-mt] [--agent-type claude] [--force]
  新项目初始化：建目录 + 投模板 + 拷 skill 到 .claude/skills/ + 写 profile + 初始化 memory 三层

harness adopt [--preset personal|company-mt] [--force]
  已有项目接入：基于 ManagedFileRecord 双 hash 检测，仅补缺失，不覆盖用户改动

harness maintain [--upgrade]
  日常维护：漂移检测（schema / memory / learnings）+ 升格提醒 + retention 压缩
  --upgrade：显式触发 CLI 升级后的项目级模板同步

harness doctor [--json]
  健康检查：managed-files hash 对齐 + profile 有效性 + skill 链接完整
  --json：机读模式，供 team-init skill 探测 CLI 版本 / schema 握手

harness scan [--apply-answers] [--budget <min>] [--domain <name>]
  知识扫描器：CLI 自己 own 整个 5 领域 scanner pipeline（R3 A2 立场——不是壳命令）
  --apply-answers：处理用户在 TODO.md 的批量答复 + micro-rescan
  --budget：默认 28 min，可调
  --domain：只扫指定领域（对应 --partial-rescan 用途）
```

**砍掉的命令**（明确不做，附理由）：

- `focus`：`.harness/current.json` 由 runtime 拥有，`doctor` 做 schema 校验就够，不需要独立命令（R3 A1）
- `context`：skill 自己读 `.harness/current.json` 即可，不需要 CLI
- `plugin install` / `plugin list` / `skill pull`：没有 plugin 市场，skill 直接打进 `resources/skills/`

### 5.2 源码分发结构

```
myskills/                                   # 现有 monorepo 根
├── packages/
│   └── harness-cli/                        # 新增 — npm 包源码
│       ├── package.json                    # name: "harness-workflow-cli"; bin: { harness: "dist/cli.js" }
│       ├── src/
│       │   ├── cli.ts                      # commander 入口
│       │   ├── commands/
│       │   │   ├── init.ts
│       │   │   ├── adopt.ts
│       │   │   ├── maintain.ts
│       │   │   ├── doctor.ts
│       │   │   └── scan.ts
│       │   ├── utils/
│       │   │   ├── detect.ts               # 项目探测（package.json / pom.xml / go.mod 等）
│       │   │   ├── template.ts             # 模板占位符替换
│       │   │   ├── materialize.ts          # resources → 目标仓库的拷贝逻辑
│       │   │   ├── managed-files.ts        # ManagedFileRecord 双 hash 落盘与比对
│       │   │   ├── hash.ts                 # SHA-256 工具
│       │   │   ├── agent-paths.ts          # agent-type 抽象（目前仅 claude）
│       │   │   ├── scanner.ts              # 5 领域扫描 pipeline
│       │   │   ├── memory.ts               # docs/memory/ 脚手架 + 归档 + scorecard 处理
│       │   │   ├── learnings.ts            # .harness/learnings/ 压缩 + 升格检测
│       │   │   ├── profile.ts              # ~/.claude/profiles/ 加载 + marker 校验
│       │   │   ├── registry.ts             # 双 registry publish 配置读取
│       │   │   └── doc-gen.ts              # <!-- @generated --> 锚点替换实现
│       │   └── types/
│       │       ├── knowledge.ts            # 规则四态 / ViolationTest / RetrievalOutcome
│       │       ├── review-target.ts        # review_target schema
│       │       ├── profile.ts              # HardFloorAction / FastPathRule
│       │       └── managed-file.ts         # ManagedFileRecord / ConflictResolution
│       ├── resources/
│       │   ├── schemas/                    # 与 types/ 一一对应的 JSON Schema
│       │   │   ├── knowledge.schema.json
│       │   │   ├── review-target.schema.json
│       │   │   ├── profile.schema.json
│       │   │   └── managed-file.schema.json
│       │   ├── templates/
│       │   │   ├── memory/                 # docs/memory 初始化模板
│       │   │   ├── knowledge/              # docs/harness/knowledge 模板（5 领域 × 3 文件）
│       │   │   ├── learnings/              # .harness/learnings 三文件
│       │   │   └── root/                   # AGENTS.md / CLAUDE.md / harness.config.json 骨架
│       │   ├── skills/                     # 项目级投放 skill（拷到目标 .claude/skills/）
│       │   │   ├── profile-entry/          # 内部 only（对项目内 AI 可见）
│       │   │   ├── harness-workflow/       # 保名 stub
│       │   │   ├── harness-common/
│       │   │   ├── harness-quick/
│       │   │   ├── harness-bugfix/
│       │   │   ├── harness-feature/
│       │   │   ├── harness-refactor/
│       │   │   └── strict-reviewer/
│       │   └── presets/
│       │       ├── personal/               # 默认 profile 资产
│       │       └── company-mt/             # Java 企业 profile 实体（见第八节）
│       ├── scripts/
│       │   ├── generate-doc-fragments.ts   # types → <!-- @generated --> 锚点块的派生器
│       │   └── verify-resources.ts         # bundled-manifest 完整性校验
│       └── tsconfig.json
├── team-init/                              # 现有 — v1 优化为 CLI 集成版（唯一对外分发入口，双重身份）
│   └── SKILL.md                            # ≤150 行，调 CLI 命令的决策树（见 §5.4）
├── harness-workflow/                       # 现有 — 保名重塑（见第七节迁移契约）
│   └── skill.md                            # 内部 compatibility stub（≤100 行）
├── profile-entry/                          # 新增（Spec 2 落地），内部 only
│   └── skill.md                            # 不对外，触发词不宣传
├── harness-common/                         # 新增（Spec 2 落地）
├── harness-quick/                          # 新增（Spec 2 落地）
├── harness-bugfix/                         # 新增（Spec 2 落地）
├── harness-feature/                        # 新增（Spec 2 落地）
├── harness-refactor/                       # 新增（Spec 2 落地）
├── strict-reviewer/                        # 现有 — 加 Step 5 知识合规检查
└── (其他现有 skill 保持不动)
```

### 5.3 目标项目落地产物（`harness init` 后的完整文件树）

```
<target-repo>/
├── .harness-profile                        # 纯文本一行：profile 名
├── harness.config.json                     # { version, extends, stageOverrides }
├── .harness/                               # 所有私有 runtime 状态，强制 gitignore
│   ├── current.json                        # focus 指针：{currentFeature, currentStage, currentItem, updatedAt, workflow_schema_version}
│   ├── managed-files.json                  # ManagedFileRecord[] 双 hash 落盘
│   ├── plugins/registry.json               # 可选 preset 解析缓存
│   └── learnings/
│       ├── LEARNINGS.md
│       ├── ERRORS.md
│       └── FEATURE_REQUESTS.md
├── docs/
│   ├── memory/
│   │   ├── .harness-memory.yml             # 项目记忆契约锚点
│   │   ├── MEMORY.md                       # 索引
│   │   ├── ERRORS.md                       # 错误索引
│   │   ├── harness_reviewer_scorecard.yml
│   │   ├── cases/                          # bug case（frontmatter 见第六节三层记忆 Schema）
│   │   ├── decisions/                      # ADR / 架构取舍
│   │   ├── constraints/                    # 长期边界
│   │   └── archive/                        # 归档
│   └── harness/knowledge/
│       ├── INDEX.md
│       ├── TODO.md
│       ├── style-and-structure/{manifest.md, evidence.md, gaps.md}
│       ├── internal-components/{manifest.md, evidence.md, gaps.md}
│       ├── exception-and-error-contracts/{manifest.md, evidence.md, gaps.md}
│       ├── integrations-and-sdk-usage/{manifest.md, evidence.md, gaps.md}
│       └── i18n-and-text-boundaries/{manifest.md, evidence.md, gaps.md}
├── CLAUDE.md                               # 含 <!-- harness-knowledge:start --> + <!-- harness-profile:start --> 契约块
└── .claude/skills/                         # CLI 投放的项目级 skill
    ├── profile-entry/                      # 内部 only
    ├── harness-workflow/
    ├── harness-common/
    ├── harness-quick/
    ├── harness-bugfix/
    ├── harness-feature/
    ├── harness-refactor/
    └── strict-reviewer/
    # company-mt 下额外：
    # ├── company-quick/ / company-bugfix/ / company-feature/ / company-refactor/
    # └── meituan-java-standards 和 java-backend-i18n-refactor 保持独立，不投
```

### 5.4 `team-init` skill（v1 内容优化，保留原名作为唯一入口 skill）

**职责**：让 AI 知道**什么时候调哪个 CLI 命令**（CLI 是确定性层，skill 是决策层）。原 `team-init` skill（现有目录 `team-init/` 已存在）承担 Agent Team 项目级工作目录初始化，本次升级做**内容优化**：把原 v0 "AI 用 Edit/Write 手写文件" 改为 v1 "AI 调 `harness init` CLI + 做探测/对话/决策"。**不新建 `harness-bootstrap` skill** — 避免和 `team-init` 形成双重入口造成混淆。

**双重身份**：
- 在 myskills 源仓库：`team-init/SKILL.md` 是 skill 源文件
- CLI `harness init` 投放到目标项目 `.claude/skills/team-init/` 时，**同一份 SKILL.md** 就是外部用户只需要安装的入口 skill（对外宣传的 "唯一要装的 skill" = `team-init`）

**完整优化后 SKILL.md 草稿（≤150 行）**：

```markdown
---
name: team-init
description: >
  初始化 Agent Team 项目工作目录。技术栈无关，探测项目类型，
  调用 harness-workflow-cli 完成确定性文件生成。
  v0 用 Edit/Write 手工初始化 → v1 升级为 AI 调 CLI 分层：
  AI 负责探测 / 对话 / 决策，CLI 负责幂等写文件。
  本 skill 是 harness 体系唯一对外分发的入口 skill（CLI 投放到项目级 .claude/skills/）。
  触发词：接入 harness、初始化 harness、team-init、
  harness init、扫描项目约定、harness 工作流、harness 没装、harness 检查
---

# team-init（v1，CLI 集成版）

## 第一步：探测 CLI 是否已装

所有后续决策前，必须先跑：

    harness doctor --json

若 exit code 非 0 或命令未找到 → abort + 明确提示：

    harness-workflow-cli 未安装。请运行：
      npm install -g harness-workflow-cli
    或使用 npx：
      npx harness-workflow-cli doctor

**禁止**自己用 Edit/Write 手工初始化（会破坏 ManagedFile 一致性）。

## 第二步：解析 doctor 输出做 schema 握手

doctor --json 输出的三个关键字段：
- `version`：CLI 版本
- `schema_version`：bundled schema 版本（必须 ≥ 当前 skill 期望的最低版本）
- `installed_presets`：已装的 preset 列表

若 `schema_version` < 最低期望 → 提示用户升级：
    npm install -g harness-workflow-cli@latest

若 `schema_version` > CLI 理解的最高版本（即项目 `.harness/current.json` 被更高版本 CLI 写过）→ 硬 abort：
    项目状态文件（.harness/current.json）由更新版本 CLI 写入。
    当前 CLI 版本 <X>，项目要求 ≥<Y>。请升级 CLI 再重试。

## 第三步：决策树（用户意图 → CLI 命令）

| 用户意图 | 调用 |
|---------|------|
| 新项目接入 harness | harness init --preset <detected> |
| 已有项目接入 | harness adopt |
| 检查项目状态 | harness doctor |
| 扫描代码约定 | harness scan |
| 处理 TODO.md 批量答复 | harness scan --apply-answers |
| 升级已 init 项目的模板 | harness maintain --upgrade |
| 日常漂移检查 | harness maintain |

## 第四步：检测 preset

跑 init 前，根据项目探测自动推荐 preset：

- 有 pom.xml 或 git remote 命中 company matcher → 推荐 company-mt
- 其他 → 推荐 personal

明确告知用户检测结果 + 选择的 preset + 允许 override。

## 第五步：交棒

CLI 命令成功后，team-init 职责结束。用户后续开发通过项目级投放的
`harness-workflow` skill（保名触发词）进入 8-Stage 循环，team-init 不参与。

## Fallback 规则

- CLI 不可用 → 禁止手工初始化，只允许 abort 提示装 CLI
- CLI 版本过低 → 提示升级
- 项目版本高于 CLI → 硬 abort 要求先升级 CLI
- 双 registry 场景：用户不指定 registry 时默认用公共 registry 安装
```

---

## 六、契约

### 6.1 单一真源 + 双真相防御（补 G2）

**唯一真源放哪**：`packages/harness-cli/src/types/*.ts` + `packages/harness-cli/resources/schemas/*.json`

以下常量**只能**在此处定义，其他所有地方必须从这里派生：

| 常量 / 结构 | 源在哪 | 派生到哪 |
|------------|-------|---------|
| 规则四态 `active/expired/drifted/superseded` | `src/types/knowledge.ts` | `harness-workflow/references/knowledge-retrieval.md`、`strict-reviewer/SKILL.md`、`resources/skills/harness-workflow/skill.md` 中的 `<!-- @generated:rule-status -->` 锚点 |
| `ReviewTarget` schema | `src/types/review-target.ts` + `resources/schemas/review-target.schema.json` | `harness-workflow/references/reviewer-integration.md`、`strict-reviewer/SKILL.md` 的 `<!-- @generated:review-target -->` |
| `FastPathRule` | `src/types/profile.ts` + `resources/schemas/profile.schema.json` | `profile-entry/references/fast-path.md` 的 `<!-- @generated:fast-path -->` |
| `HardFloorAction` | `src/types/profile.ts` | `profile-entry/references/precedence.md`、`~/.claude/profiles/*.yml` 验证 |
| `ViolationTest` 枚举 | `src/types/knowledge.ts` | manifest.md 渲染、strict-reviewer Step 5 |
| `ConflictResolution` | `src/types/managed-file.ts` | CLI 冲突行为实现、`doctor` 报告 |

**派生机制**：`scripts/generate-doc-fragments.ts`

1. 扫 `src/types/*.ts`，提取导出的 enum / type / interface
2. 扫 `resources/skills/**/*.md` 和 myskills 顶层 skill `*.md` 找 `<!-- @generated:<key> -->` ~ `<!-- @/generated -->` 锚点块
3. 把锚点块内容替换为从单一真源生成的 markdown 片段
4. 若有 `@generated:<key>` 没在源里找到对应定义 → 抛错

**CI 漂移五道门禁**：

| 门 | 断言 |
|---|------|
| schema-compile | TS 类型 ↔ JSON Schema 双向 round-trip 通过 |
| generated-fragments-clean | `npm run generate && git diff --exit-code`，有差异即 FAIL |
| review-target-fixtures | 所有 stage（qa/security/spec/quality）的 fixture 按 `review-target.schema.json` 解析通过 |
| fast-path-fixtures | allowlist 的 fixture 把 trivial diff 路由到 quick，结构化 diff 拒绝 |
| knowledge-status-matrix | 四态 × Stage-0.5 render × reviewer verdict 的全组合矩阵都匹配预期 |

**schema 演进流程**（未来加第 5 态比如 `archived`）：

1. 改 `src/types/knowledge.ts` 加 `archived` 到 `RuleStatus` 枚举
2. 改 `resources/schemas/knowledge.schema.json` 对齐
3. 跑 `npm run generate` 刷新所有 `@generated` 块
4. 补 `knowledge-status-matrix` fixture（至少覆盖 Stage-0.5 render、Late Recovery、reviewer verdict 三处）
5. CI 五关全过才允许合并

### 6.2 三层记忆 Schema + 生命周期

**三层共存，不互替代，升格单向**：

```
代码验证过程
    ↓
.harness/learnings/*                  ← 原始采集层（未证实）
    ├── 一次性噪音                    → 留采集层，按 retention 过期
    └── 跨轮稳定且有价值
            ├── bug / 反模式          → docs/memory/cases/
            ├── 架构取舍              → docs/memory/decisions/
            └── 长期边界 / 制度限制   → docs/memory/constraints/
                    ↓
                代码 idiom / SDK / i18n  → docs/harness/knowledge/*
                （不从 memory 自动升，手工 rescan 触发）
```

#### 第一层：`docs/harness/knowledge/<领域>/` —— Spec 1 已锁

不重复描述，但本 spec 新增约束：

- **写入权限**：只有 `harness scan` / `harness scan --apply-answers` / `harness maintain`（drift 时自动改 per-rule Status）可以写
- **绝对禁止**：Stage 3 / Stage 4 / 任何 AI skill 直接用 Edit/Write 改 manifest
- **缺失时的 fallback**：若 `docs/harness/knowledge/` 不存在但 `docs/memory/` 存在 → harness-workflow 以 knowledge-disabled 模式运行（Stage -0.5 跳过）

#### 第二层：`docs/memory/{cases,decisions,constraints}/*.md`

**case 的 frontmatter schema**（继承自 `harness-workflow/references/memory.md`）：

```yaml
---
id: string
date: YYYY-MM-DD
module: string
status: active | suspect | archived | superseded
applies_to:
  paths: string[]
  symbols: string[]
  deps: [{ name: string, range: string }]
criteria_met: string[]
freshness:
  state: active | suspect
  last_verified: YYYY-MM-DD
  last_used: YYYY-MM-DD
  suspect_since: YYYY-MM-DD | null
superseded_by: string | null
next_time_signal: string[]
---
## Symptom / Root Cause / Fix / Negative Patterns / Future Check
```

**decision 的 frontmatter schema（新，补齐 codex R2 提议）**：

```yaml
---
id: string
date: YYYY-MM-DD
status: active | superseded | archived
scope: architecture | data | integration | workflow
decided_by: string[]
applies_to:
  paths: string[]
  modules: string[]
superseded_by: string | null
---
## Decision / Context / Why This Won / Rejected Options / Revisit Trigger
```

**constraint 的 frontmatter schema（新，补齐）**：

```yaml
---
id: string
status: active | lifted | archived
source: external_policy | legacy_contract | platform_limit | business_rule
owner: string
applies_to:
  paths: string[]
  modules: string[]
last_verified: YYYY-MM-DD
expiry_after_days: number | null
---
## Constraint / Why It Exists / Allowed Workaround / Violation Cost / Removal Trigger
```

**谁能写**：

| 谁 | 时机 | 写什么 |
|---|------|--------|
| `harness init` / `harness adopt` | 初始化 | `.harness-memory.yml` + `MEMORY.md` + `ERRORS.md` + 四子目录 + scorecard 模板 |
| Stage 2（规划）| 本轮决策 | `decisions/*.md` 新文件 |
| Stage 8（收尾）/ `harness maintain` | 本轮结束 / 漂移 | `cases/*.md` 新文件、把 status=superseded/archived 的归档到 `archive/` |
| 人工 / doc-sync | 新增业务约束 | `constraints/*.md` |
| **绝对禁止** | — | strict-reviewer 写 `docs/memory/`、AI 跨 Stage 直接改 frontmatter |

#### 第三层：`.harness/learnings/{LEARNINGS,ERRORS,FEATURE_REQUESTS}.md`

**entry schema**（三文件共用大骨架）：

```markdown
## [LRN-YYYYMMDD-XXX] category
**Logged**: ISO-8601 timestamp
**Priority**: low | medium | high | critical
**Status**: pending | in_progress | resolved | wont_fix | promoted
**Area**: product | frontend | backend | infra | tests | docs | config | workflow
### Summary / Details / Suggested Action
### Metadata
- Source: user_feedback | implementation | verification | docs | command
- Stage: requirement-analysis | plan-generation | feature-execution | verification | doc-sync | direct-task
- Related Files: string
- Tags: string
- Pattern-Key: string?（用于去重 + 升格检测）
```

**retention 规则**：

| 状态 | 保留策略 |
|-----|---------|
| `pending` / `in_progress` | 永久保留 |
| `resolved` / `wont_fix` / `promoted` 超 90 天 | 折叠正文（保留 Summary + Metadata + Resolution 摘要） |
| `promoted` 且 `docs/memory/` 里有 canonical 目标 且超 180 天 | 删正文，只留 entry 头 + Metadata + `see: <memory_path>` stub backlink |

**谁能写**：

| 谁 | 干什么 |
|---|-------|
| 任何 skill / Stage / AI 工具 | 追加 entry |
| **只** `harness maintain` | retention 压缩、升格提醒、eviction |

**升格提醒机制**（防止 learnings 变废纸篓，R3 A8.10 前瞻）：

`harness maintain` 输出"可升格 learnings 待人工分类"：

- 列出超 30 天未 triage 的 `pending` entries（用户忘了处理）
- 列出符合"连续 2 轮引用同一 Pattern-Key"的 entry（跨轮稳定，值得升格）
- **不自动升格**，只提醒用户

### 6.3 Managed 状态契约（补 G5 + R3 A5/A8）

**`ManagedFileRecord` schema**：

```typescript
interface ManagedFileRecord {
  path: string;                             // 相对仓库根
  category: 'agents' | 'config' | 'docs' | 'plans' | 'skills' | 'knowledge' | 'memory' | 'learnings';
  strategy: 'copy' | 'generated' | 'overlay';
  sourceHash: string;                       // CLI 上次"我写进去的内容"的 hash（持久化）
  targetHash: string;                       // 磁盘上当前文件的 hash（持久化）
  lastSyncedAt: string;                     // ISO-8601
}
```

`previousHash` **运行时派生**：读取 `resources/` 当前版本里对应文件的 bundled source hash 作为"新 CLI 版本希望写什么"，不落盘。

**四态比对**（用 source/target/bundled 三个 hash 运行时算）：

| target vs source | bundled vs source | 状态 | CLI 行为 |
|------------------|-------------------|------|---------|
| 相等 | 相等 | `unchanged` | 跳过 |
| 相等 | 不等 | `update-available` | `maintain --upgrade` 时可以安全覆盖 |
| 不等 | 相等 | `user-modified` | 用户改过，保留，跳过 |
| 不等 | 不等 | `conflict` | 见下面冲突行为 |
| source 缺失 | — | `missing` | `init` / `adopt` 补写 |

**冲突行为（R3 A5 立场）**：

| Profile | 冲突行为 |
|---------|---------|
| `personal`（默认）| 写 `<path>.rej.<timestamp>` 保留 bundled 期望版本；target 文件不动；CLI 非零退出；输出结构化冲突摘要 |
| `company-mt`（严格）| 同上 + **整批 BLOCK**（此次 adopt/maintain 操作中止，不继续处理后续文件），匹配 hard_floor 哲学 |

**为什么不做自动三方合并**：`CLAUDE.md` 之类的指令性文件，合并正确性是**语义级**不是文本级，auto-merge 很容易产生看上去对但语义坏的结果。人工介入 + `.rej` 保留反而更安全。

**git 关系（R3 A8.2）**：

- `.harness/managed-files.json` **强制 gitignore**
- `harness init` / `harness adopt` 自动写 `.gitignore` 补 `.harness/managed-files.json` 一行（若未存在）
- `harness doctor` 若检测到 `git ls-files` 里包含 `.harness/managed-files.json` → 硬 fail + 提示用户 `git rm --cached .harness/managed-files.json` 后重试

**doctor 对手改生成文档的误报修复（R3 A8.5）**：

- `CLAUDE.md` 不按整文件 hash 比对，只比 `<!-- harness-knowledge:start --> ... <!-- harness-knowledge:end -->` 和 `<!-- harness-profile:start --> ... <!-- harness-profile:end -->` 两个 managed 块的 hash
- 其他 `<!-- @generated:xxx -->` 锚点同理
- 用户自由区（两个契约块之外）不参与 hash 比对

### 6.4 分发契约（补 UD3 + R3 A6）

**包名**：`harness-workflow-cli`（不 split，内部 registry 和 public 共用同一个 name）

**tarball**：**同一个 tarball 同时发两个 registry**。`package.json` 的 `publishConfig` 不硬编码 registry，由 `.npmrc` 或 CI 环境变量控制 publish target。

**双 registry publish 流程**：

```bash
# 1. 发公共 registry
npm publish --registry=https://registry.npmjs.org

# 2. 发公司内部 registry
npm publish --registry=<公司内部 registry 地址>
```

由 `repo-skill-release` skill 驱动，version bump + tag + 两次 publish 在一个流程里，两条命令都 exit 0 才算成功。

**postinstall 行为**：

- **不做** postinstall 写 `~/.claude/skills/`（R3 A6 明确反对 —— 过于隐式、难审计、offline/公司场景脆弱）
- skill 只通过 `harness init` / `harness adopt` 显式投放到项目级 `.claude/skills/`
- 用户装 CLI 本身：`npm install -g harness-workflow-cli` → 只拿到 `harness` 命令 + 内部 `resources/`，**不改 home 目录**

**版本绑定**：

- CLI 版本 + bundled skill + bundled schema + bundled template **版本锁定**（同一 tarball 发版同一 version）
- 外部可选 skill（比如 `meituan-java-standards` 之类的独立 skill）可用 peerDependencies + 最低版本范围

**升级路径**：

- 已 init 的项目：用户跑 `harness maintain --upgrade` 显式触发
- CLI **不自动检测** "这个项目用了旧版"（过于隐式 + 易误伤）
- `maintain --upgrade` 行为：用新 bundled 对 target 做四态比对，unchanged 直接更新，user-modified 保留，conflict 按 Profile 行为处理

### 6.5 迁移 / 兼容契约（补 G3 + R3 A3）

**`harness-workflow/skill.md` 重塑后的兼容 stub（前 30 行草稿，R3 A3 确认）**：

```markdown
---
name: harness-workflow
description: >
  Harness 工作流的公开兼容入口。为新 profile-based dispatch 设计保留 /harness-workflow 触发词，
  真正的路由迁移到 profile-entry（内部 only）。
  生命周期命令（--init / --adopt / --maintain / --doctor / --scan）作为显式 passthrough 到 CLI 或 harness-common。
  代码任务执行保持轻量：公开别名进入，强制 harness profile 交棒出去。
  使用场景：
  (1) 用户沿用 /harness-workflow 旧习惯
  (2) 用户执行 init / adopt / maintain / doctor / scan 生命周期命令
  (3) 老文档、hook、CLAUDE.md 仍引用 harness-workflow
  触发命令：/harness-workflow, /harness-workflow --init, /harness-workflow --adopt, /harness-workflow --maintain, /harness-workflow --doctor, /harness-workflow --scan
---

# harness-workflow —— 兼容入口

> 公开兼容名。
> 内部路由器是 profile-entry；不对用户暴露 /profile-entry。

## 职责

1. 保留现有触发词 + 迁移安全
2. 把生命周期命令转发给 CLI
3. 对代码任务：invoke profile-entry 并强制 forced_profile: harness
4. 当老文档仍指向这里时发迁移提示
5. 零任务类型逻辑，零激进模式策略

## 非职责

- 不分类任务类型
- 不解析 profile matcher
- 不持久化会话模式
- 不实现公司策略
- 不重复叶子 skill 选择

## 路由规则

若调用包含 --init, --adopt, --maintain, --doctor, --scan：
- 调用匹配的 CLI / common 流程
否则：
- invoke Skill(profile-entry) 附带参数：
  - forced_profile: harness
  - public_entrypoint: harness-workflow
  - requested_flags: <解析后的 flag>
  - cwd: <当前仓库>

## 迁移提示

老文档和 hook 调用 /harness-workflow 仍有效。
新架构文档可以提到 profile-entry，但只作为内部组件。
```

**`profile-entry` 的公开度（R3 A3 硬约束）**：

- `profile-entry` 必须**内部 only**
- 不在 myskills README 宣传、不给触发词 alias、SessionStart hook 不注入 `/profile-entry` 提示
- 项目级 `.claude/skills/profile-entry/` 投放但不期望用户直接触发
- 任何用户只通过 `harness-workflow` 公开触发词进入，由 harness-workflow 内部 `Skill(profile-entry, {forced_profile: harness})` 调用

**SessionStart hook**：

- `~/.claude/hooks/session-init-prompt.txt` 继续指向 `harness-workflow`，**不改**
- 老 `CLAUDE.md` 规则"任何开发任务先走 harness-workflow" **继续有效**
- 用户肌肉记忆完全不变

**会话 schema 版本哨兵（R3 A8.3）**：

- `.harness/current.json` 新增字段 `workflow_schema_version: "1.0.0"`
- harness-workflow stub 开头读该字段，若 < 当前 bundled 期望版本 → 触发迁移流程（一次性 migration subagent 更新状态文件）
- 迁移未完成前不允许进 Stage 0

---

## 七、Java 企业 `company-mt` profile 完整实体（补 G4）

### 7.1 `~/.claude/profiles/company-mt.yml` 完整字段

```yaml
name: company-mt
description: 美团风 Java 企业仓库，严格评审，不自动 push，knowledge + memory 启用

detection:
  priority: 30
  matchers:
    - type: path_glob
      pattern: "~/Movies/alopex-*"
    - type: path_glob
      pattern: "~/Movies/overseas-*"
    - type: path_glob
      pattern: "~/Movies/itops-*"
    - type: git_remote_regex
      pattern: "(git@|https://).*(meituan|alopex|overseas-asset|itops).*"
    - type: file_exists
      pattern: "pom.xml"

entry_skill: profile-entry

task_types:
  quick: company-quick
  bugfix: company-bugfix
  feature: company-feature
  refactor: company-refactor

default_mode: conservative

hard_floor:
  - auto_push
  - force_push
  - destructive_ops
  - auto_merge
  - rewrite_history
  - network_install

repo_conventions:
  language: java
  build_files: ["pom.xml", "mvnw"]
  package_roots: ["src/main/java", "src/test/java", "src/main/resources"]
  test_gate:
    require_unit_test_for_backend_change: true
    prefer_module_scoped_command: true
  review_style:
    verdict_first: true
    file_line_grounding_required: true
    no_speculation: true
  memory_layout:
    knowledge_root: "docs/harness/knowledge"
    memory_root: "docs/memory"
    learnings_root: ".harness/learnings"
  i18n_defaults:
    backend_skill: "java-backend-i18n-refactor"
    repo_specific_phase2_skill: "costasset-i18n-phase2"  # 条件激活，matcher 命中 costasset repo 才启用

compliance_hooks:
  preflight:
    - verify_git_repo
    - verify_profile_marker
    - verify_docs_memory_contract
  required_checks:
    - strict-reviewer
    - knowledge-compliance
    - backend-unit-verification
  blocked_when:
    - ungrounded_review
    - malformed_memory_contract
    - stale_profile_marker
    - managed_file_conflict                 # 新增，派生自 R3 A5
```

### 7.2 `resources/presets/company-mt/` 完整内容

```
packages/harness-cli/resources/presets/company-mt/
├── package.json                            # preset 元信息
├── plugins.json                            # { name, preset, stages: { feature-execution: { required: [company-*] } } }
├── profile/company-mt.yml.template         # 上面 yaml 的模板版（变量替换）
├── skills/
│   ├── company-quick/SKILL.md
│   ├── company-bugfix/SKILL.md
│   ├── company-feature/SKILL.md
│   └── company-refactor/SKILL.md
└── references/
    ├── java-rules.md          # → 种子到 docs/harness/knowledge/style-and-structure/manifest.md + evidence.md
    ├── enterprise-sdk.md      # → 种子到 docs/harness/knowledge/integrations-and-sdk-usage/manifest.md
    ├── approval-flow.md       # → 种子到 docs/memory/constraints/harness_approval_flow.md
    └── i18n.md                # → 种子到 docs/harness/knowledge/i18n-and-text-boundaries/manifest.md + docs/memory/constraints/harness_i18n_boundaries.md
```

### 7.3 `harness init --preset company-mt <repo>` 产出清单

相对 `personal` preset，在目标 Java 仓库**额外**生成：

- `.harness-profile` 内容写 `company-mt` + `resolved_by: <marker|matcher|user_override>`
- `harness.config.json` 的 `extends: ["preset:company-mt"]`
- `.claude/skills/company-{quick,bugfix,feature,refactor}/SKILL.md`
- `docs/memory/constraints/harness_approval_flow.md`（种子内容）
- `docs/memory/constraints/harness_i18n_boundaries.md`（种子内容）
- `docs/harness/knowledge/style-and-structure/manifest.md` 首发含 Java 基线规则（种子 + 用户 rescan 可补充）
- `docs/harness/knowledge/integrations-and-sdk-usage/manifest.md` 首发含企业 SDK 约定
- `docs/harness/knowledge/i18n-and-text-boundaries/manifest.md` 首发含 i18n 边界

### 7.4 Overlay skill 的行为（R3 A4 立场）

`company-feature` 相对 `harness-feature`：

- **不复制**整个 8-Stage 正文，只**追加企业约束层**
- 在 Stage 1（架构审查）前强制 `Skill(java-standards)`，无输出则降级警告
- 在 Stage 3（实现）前，若涉及新 i18n 文本则强制 `Skill(java-backend-i18n-refactor)`
- 在 Stage 8（收尾）禁止 auto-push（`hard_floor: auto_push`）
- 所有 file:line grounding 按 `review_style.file_line_grounding_required: true` 强制

**降级 fallback（R3 A4）**：

- `harness doctor` 检查 overlay 依赖的独立 skill 是否在 `~/.claude/skills/` 下存在
- 缺失 → 标记 `optional-but-missing`
- `company-feature` 运行时若依赖 skill 不存在 → 执行通用 harness-feature 逻辑 + 显式输出 "company-mt 降级：<missing_skill> 不可用，使用 bundled preset references" 警告
- **不**静默声明覆盖完整企业模式

### 7.5 与现有 Java skill 的关系（R2 确认）

| skill | 处理方式 |
|-------|---------|
| `java-standards` / `meituan-java-standards`（若本地已装） | 通过 `Skill(...)` invoke，保持独立 |
| `java-backend-i18n-refactor` | 通过 `Skill(...)` invoke，保持独立 |
| `costasset-i18n-phase2` | 保持独立，matcher 额外命中 `costasset-*` repo 时由 `repo_conventions.i18n_defaults.repo_specific_phase2_skill` 激活 |
| `meituan-java-standards`（如果本地有） | 同 `java-standards`，通过 `repo_conventions.language: java` 时 overlay 自动 invoke |

---

## 八、实施 DAG（10 任务，80% 置信区间 11-16 Round）

```
                T1 单一真源类型 + JSON schema
                          │
                ┌─────────┼─────────┐
                │                   │
        T2 managed-files        T3 profile loader +
           落盘机制              .harness-profile
                │                   │
                └────────┬──────────┘
                         │
                T4 CLI 五命令实现
                         │
                T5 resources/templates 全集
                         │
                T6 harness-workflow 重塑（保名 stub）
                         │
                T7 profile-entry + harness-{common,quick,bugfix,feature,refactor}
                         │
                T8 strict-reviewer Step 5 + review_target 扩展
                         │
                T9 team-init v1 重塑 + 双 registry 发布
                         │
                T10 company-mt preset 实体
                   （可与 T8/T9 并行）
```

### 任务分解与 Round 估算

| 编号 | 任务 | 依赖 | 并行机会 | Round 估算 |
|-----|------|------|---------|----------|
| T1 | 单一真源 TS 类型 + JSON schema + doc-gen 脚手架 | — | — | 1-2 |
| T2 | `ManagedFileRecord` 四态 + `.harness/managed-files.json` 落盘 + 冲突行为 | T1 | 与 T3 并行 | 1-2 |
| T3 | profile loader + `.harness-profile` 生成/校验 + matcher 解析 | T1 | 与 T2 并行 | 1 |
| T4 | CLI 五命令实现（init/adopt/maintain/doctor/scan）+ detect + template + materialize | T2, T3 | — | 2 |
| T5 | `resources/templates/` 全集（memory + knowledge + learnings + root）+ canonical doc fragments 对齐 | T4 | 与 T6 部分并行 | 1-2 |
| T6 | `harness-workflow/skill.md` 重塑为兼容 stub（保名方案 A）+ 会话 schema 版本迁移 | T4 | — | 1 |
| T7 | `profile-entry` + `harness-{common,quick,bugfix,feature,refactor}` 拆分实现（Spec 2 落地）| T6 | — | 2-3 |
| T8 | `strict-reviewer/SKILL.md` Step 5 知识合规检查 + `review_target` schema 扩展 + 3 个 Round 11 spec gap 补齐 | T1, T7 | 与 T10 并行 | 1-2 |
| T9 | `team-init` skill v1 内容重塑（见 §5.4）+ `repo-skill-release` 适配 monorepo + 双 registry publish 流程 | T4, T5 | — | 1-2 |
| T10 | `company-mt` preset 实体 + overlay skill + Java 种子映射 | T3, T5, T7 | 与 T8/T9 并行 | 2 |

**关键路径**（无并行）：T1 → T2 → T4 → T5 → T6 → T7 → T8 → T9 = 串行 **11-14 Round**

**最佳并行**（T2‖T3、T8‖T10）：**10-13 Round**

**80% 置信区间**（R3 A7 校准，1.3-1.6× baseline 9-Round）：**11-16 Round**

### 先后顺序裁决

1. **先做 schema 骨架（T1-T4）**：单一真源 → managed-files → profile → CLI 命令壳
2. **再做 skill 生态改造（T5-T8）**：模板 → harness-workflow 重塑 → profile-entry 拆分 → reviewer 集成
3. **最后做 bootstrap + 企业 preset（T9-T10）**：分发出口 + Java 实体

---

## 九、风险矩阵

按"概率 × 影响"排序，前 8 条优先进入 writing-plans 阶段明确预防动作。

| 编号 | 风险 | 来源 | 概率 | 影响 | 预防动作 |
|-----|------|------|------|------|---------|
| R1 | 单一真源机制没跑通，字段继续漂 | Codex R2 | 高 | 高 | T1 完成后立即接 CI 漂移门禁，fixture ≥ 20 个 |
| R2 | `docs/memory/` 在 Spec 1 假设存在但 init 没建 | Codex R2 | 高 | 中-高 | `harness scan` 前置 `doctor` 检查，缺 memory 树硬 abort |
| R3 | `managed-files.json` 被意外 git track | Codex R3 A8 | 中-高 | 中 | CLI 自动写 `.gitignore`，`doctor` 硬 fail 检测 |
| R4 | 旧会话语义断裂（Spec 2 重塑前后 `.harness/current.json` 含义变） | Codex R3 A8 | 中 | 高 | `workflow_schema_version` 哨兵 + 一次性 migration subagent |
| R5 | symlink 跨平台（公司 Windows / 新同事 macOS 表现不一） | Codex R3 A8 | 中 | 中 | 项目资源默认 copy，symlink 保留 local-dev；所有路径比较用 `realpath` |
| R6 | doctor 对手改生成文档误报 | Codex R3 A8 | 中 | 低-中 | 只比 `@generated:xxx` 锚点块，不整文件 hash |
| R7 | bootstrap 探测 CLI 不稳定（npm metadata 不可靠）| Codex R3 A8 | 中 | 中 | 强制走 `harness doctor --json` version handshake，不猜 npm metadata |
| R8 | `company-mt` overlay 依赖 skill 缺失时静默失败 | Codex R3 A4 | 中 | 高 | `doctor` 列 optional-but-missing；overlay 运行时显式降级警告 |
| R9 | 双 registry publish 忘了其中一个 | UD3 | 中 | 中 | `repo-skill-release` 流程要求两条 publish 命令都 exit 0 才算成功 |
| R10 | `.harness/learnings/` 变废纸篓（升格无人做） | Codex R2 | 中 | 中 | `harness maintain` 输出"可升格 learnings 待人工分类"警示 |
| R11 | Spec 1 的 Round 11 Known Spec Gaps（3 个字段透传缺失）在 T8 没补齐 | Spec 1 末尾 | 高 | 中 | T8 的 DoD 明确列出 `retrieval_outcome` / `known_issues` / Late Recovery 字段重算 |
| R12 | 28 分钟 scanner 超时在大型 Java monorepo（>5000 文件）失败 | Codex R3 A8 前瞻 | 低-中 | 高 | `harness scan` 支持 `--budget <min>` 和 `--domain <name>` 限定扫描范围；超时降 partial 状态 |
| R13 | 多 profile 冲突（personal 和 company-mt matcher 同时命中） | Codex R3 A8 隐含 | 低 | 中 | profile priority + matcher specificity tie-break；仍 tie → 硬 error 要求用户创建 `.harness-profile` |

---

## 十、进入 writing-plans 的硬性条件（Codex R3 GO Verdict 三条）

进入 `superpowers:writing-plans` 前必须已敲定：

### 10.1 公开面契约（Public Surface Contract）

- `harness-workflow` 是**唯一**公开的兼容触发词
- `scan` 保留为显式 shell 命令（**不是**壳命令）
- `profile-entry` **内部 only**，不公开触发词、不宣传
- `focus` 命令砍，`.harness/current.json` 由 runtime 拥有，`doctor` 做 schema 校验

### 10.2 分发契约（Distribution Contract）

- **同一 tarball 同名** `harness-workflow-cli` 发 public + 内部双 registry，不 split 包名
- **不做** postinstall 写 `~/.claude/skills/`
- 升级**必须显式**：`harness maintain --upgrade`
- CLI + bundled skill/resources + schema **版本锁定**

### 10.3 Managed 状态契约（Managed-State Contract）

- `.harness/managed-files.json` **强制 untracked**（gitignore + doctor 硬 fail）
- 冲突默认 `.rej` + 非零退出
- `company-mt` profile 下冲突升级为**整批 BLOCK**
- 会话 schema 版本哨兵做老会话迁移门

---

## 十一、Codex R3 八条立场表

| 题 | 主题 | Codex 立场 | 对本 spec 的影响 |
|----|------|-----------|---------------|
| A1 | 砍 `focus` 命令对不对 | ✅ 接受砍 | `.harness/current.json` 由 runtime/skill 所有，不做命令 |
| A2 | `scan` 壳命令正当性 | ❌ 反对做壳，保留为真命令 | CLI 自己 own 整个 5 领域 scanner pipeline |
| A3 | `harness-workflow` → `profile-entry` 迁移 | `profile-entry` 内部 only | 保名方案 A；harness-workflow 变 compatibility stub |
| A4 | company-mt overlay 与现有 Java skill 关系 | Skill(...) invoke + 显式 degraded fallback | overlay 缺失 skill 时显式警告，不静默 |
| A5 | managed-files 冲突行为 | `.rej` + 非零退出；company-mt 整批 BLOCK | 见 6.3 节冲突表 |
| A6 | 双 registry 发布 | 同 tarball 同名，无 postinstall，显式 maintain --upgrade | 见 6.4 节分发契约 |
| A7 | Round 估算对抗 | 11-13 偏乐观，用 1.3-1.6× baseline 9-Round → 80% CI 11-16 | 见第八节 DAG |
| A8 | 新挖盲点 | 5 个：bootstrap CLI 检测 / managed-files 误 track / 老会话语义 / symlink 跨平台 / doctor 生成文档误报 | 全部进 R1-R13 风险矩阵 |

---

## 十二、Codex 协作记录

### Round 1（agentId `a7e5425735b194fa3`）—— 设计骨架约束

关键结论：薄包先行 / CLI 拿更多 deterministic / 三层共存不互替 / 四态 hash 但只落盘双 hash / agent-type 抽象只抽路径层 / 双真相是最大坑 / 用户"反复确认不要"= 不学 block 闭环但要学 learnings 维护 / `docs/memory/` 不存在是 Spec 1 现状 bug

### Round 2（agentId `ad6a117dd1039d339`）—— 完整产品架构

关键产出：CLI 9 命令 + 11 utils 完整模块表 / 单一真源 + `@generated` 锚点 + CI 四关 / 三层记忆字段级 schema + 升格流 / `company-mt` 完整实体 / 15 任务 DAG，22 串行 / 15-16 并行 Round

**偏差**：复刻 block 过度。Claude 在 Round 3 前阶段已识别并收敛到 10 任务 5 命令。

### Round 3（手动投递 verdict：GO）—— 对抗性审稿

关键立场见第十一节八条立场表。

**Verdict**：GO，携带三条硬输入进 writing-plans。

---

## 十三、不在范围内（Out of Scope）

- agent-type `codex` 支持（只做 Claude Code 的 `.claude/skills/`）
- plugin 市场（如 `@mtfe/mtskills` 机制）
- block-harness-init 的反复返工闭环
- Spec 1 / Spec 2 本身的实现细节（它们有独立 plan）
- Windows 原生 shell 兼容（主要目标是 macOS + Linux，Windows WSL 间接支持）

---

## 十四、下一步

按 `superpowers:brainstorming` skill 的终态规定，下一步是 invoke `superpowers:writing-plans` 把本 spec 变成可执行 implementation plan。

**实施范围预估**：

- 🆕 新建：
  - `packages/harness-cli/**`（约 25-30 个源文件）
  - `team-init/SKILL.md`（v1 重塑，内容从 v0 的 Edit/Write 改为调 CLI；保留原名作为对外唯一入口 skill）
  - 5 个由 Spec 2 拆分出的 skill 目录（`profile-entry` + `harness-common` + `harness-{quick,bugfix,feature,refactor}`）
  - `resources/presets/company-mt/` 完整内容
  - `resources/templates/` 全集
  - schema fixture ≥ 20 个
- ✏️ 修改：
  - `harness-workflow/skill.md`（重塑为兼容 stub）
  - `strict-reviewer/SKILL.md`（加 Step 5）
  - Spec 1 引用的文件（补 Round 11 的 3 个字段 gap）
- 复杂度：比上次 memory/reviewer 升级大 1.3-1.6×，**80% 置信区间 11-16 Round**

---

## 附录 A：术语速查

| 术语 | 定义 |
|-----|------|
| 单一真源 | `packages/harness-cli/src/types/*.ts` + `resources/schemas/*.json`，所有 canonical 常量只在这里定义 |
| `ManagedFileRecord` | CLI 追踪每个投放文件的三 hash（source/target/bundled）状态记录 |
| 四态 | `ManagedFile` 的 `unchanged` / `update-available` / `user-modified` / `conflict` / `missing` 状态机 |
| Overlay Skill | `company-mt` 下的 `company-{quick,bugfix,feature,refactor}`，不复制 `harness-feature` 全文，只追加企业约束 |
| `@generated` 锚点 | skill markdown 里 `<!-- @generated:<key> -->` 到 `<!-- @/generated -->` 之间由 doc-gen 脚本自动替换的 canonical 派生区 |
| Profile Marker | 项目根 `.harness-profile` 文件，一行 profile 名 + `resolved_by` |
| Hard Floor | profile 的强制底线动作清单，`/yolo` flag 不能绕过 |
| 内部 only skill | 比如 `profile-entry`，投放到项目 `.claude/skills/` 但不对外宣传触发词 |
| 会话 schema 版本 | `.harness/current.json.workflow_schema_version`，用于老会话迁移门 |
| Preset Seed | preset 包里的 `references/*.md`，会被 init 复制为目标仓库的 knowledge manifest 或 memory constraint 首发内容 |
| 降级警告 | `company-mt` overlay 依赖的 skill 缺失时显式输出的"能力降级"提示，不静默兜底 |

---

## 附录 B：与两份前置 Spec 的引用定位

| 本 spec 引用点 | Spec 1 位置 | Spec 2 位置 |
|---------------|------------|------------|
| 知识 5 领域结构（manifest / evidence / gaps schema） | `2026-04-23:191-312` | — |
| Stage -0.5 检索（Step 0-6 完整流程） | `2026-04-23:411-528` | — |
| strict-reviewer Step 5 及 Verdict 决定规则 | `2026-04-23:627-655` | — |
| CLAUDE.md `<!-- harness-knowledge:start -->` 触发契约 | `2026-04-23:657-673` | — |
| Round 11 Known Spec Gaps（transitive 字段） | `2026-04-23:960-986` | — |
| Profile 三正交轴（Profile × 任务类型 × 激进模式 + 优先级契约） | — | `2026-04-24:64-89` |
| 结构化 fast-path 判定 | — | `2026-04-24:91-111` |
| `~/.claude/profiles/*.yml` schema（harness + company 模板）| — | `2026-04-24:202-258` |
| `harness-common` / `harness-{quick,bugfix,feature,refactor}` 职责 | — | `2026-04-24:162-198` + `2026-04-24:296-332` |
| 跨 profile 任务类型合同 | — | `2026-04-24:260-274` |

---

## 附录 C：现有 15 skill 处理矩阵（Coverage 补齐）

**说明**：本 spec 的 §5.2 源码分发结构只显式列出了"新增 skill"和"要改的 skill"，但 myskills 仓库目前已有 15 个 skill。本附录是 **Coverage 补齐**，把全部 15 个 skill 在本次升级后的命运逐条列出。用户原则："我原有的肯定是尽量保留和做优化的"。

| # | Skill | 原角色 | 本次升级处理 | 实施 Round |
|---|-------|-------|------------|----------|
| 1 | `harness-workflow` | 主入口单体 skill | **保名重塑为兼容 stub**（≤100 行，内部 `Skill(profile-entry, {forced_profile: harness})` 转发，触发词不变） | Round 6 |
| 2 | `strict-reviewer` | Stage 4/5 审稿（default FAIL + 三硬门） | **扩展 Step 5 知识合规检查** + `review_target` schema 补 `retrieval_outcome` / `known_issues` 字段 | Round 10 |
| 3 | `team-init` | 项目级工作目录初始化 | **v1 内容优化**：从 AI 手写文件改为 AI 调 `harness init` CLI + 探测/对话/决策；双重身份（myskills 源 + CLI 投放到 `.claude/skills/team-init/`），对外就是唯一要别人装的入口 skill（见 §5.4 完整草稿） | **Round 11**（team-init v1 重塑 + `repo-skill-release` 适配 + 双 registry 发布）|
| 4 | `team-pd` | Stage 0 需求分析 | 🟢 **保留不动** — `harness-feature` / `harness-bugfix` 的 Stage 0 通过 `Skill(team-pd)` invoke | Round 9（harness-feature 的 stage 调用链里明示引用） |
| 5 | `team-architect` | Stage 1 架构审查 | 🟢 **保留不动** — `harness-feature` Stage 1 invoke | Round 9（在 harness-feature 的 Stage 调用链里明示 invoke）|
| 6 | `team-senior-dev` | Stage 3 核心模块实现 | 🟢 **保留不动** — `harness-feature` Stage 3 `subagent-driven` 派发 | Round 9（在 harness-feature 的 Stage 调用链里明示 invoke）|
| 7 | `team-junior-dev` | Stage 3 CRUD 模块实现 | 🟢 **保留不动** — senior/junior 并行 | Round 9（在 harness-feature 的 Stage 调用链里明示 invoke）|
| 8 | `team-qa` | Stage 6 QA 测试 | 🟢 **保留不动** — `harness-feature` Stage 6 invoke | Round 9（在 harness-feature 的 Stage 调用链里明示 invoke）|
| 9 | `team-security` | Stage 7 安全审查 | 🟢 **保留不动** — `harness-feature` Stage 7 invoke；`company-mt` 强制启用（在 `compliance_hooks.required_checks` 里） | Round 9 / Round 12 |
| 10 | `team-commander` | 全局工作流指挥官 + Session Health Check | 🟢 **保留不动** — `profile-entry` 只接管"路由"那一块；`team-commander` 的 Session Health + `team status/next/rollback` 命令独立存在 | 不改 |
| 11 | `task-dispatcher` | 顶层并行任务派发 | 🟢 **保留不动** — Spec 2 第 20 行明确写"不替代 task-dispatcher"；外层 message-level split 不变 | 不改 |
| 12 | `investigate` | 系统调试方法论 | 🟢 **保留不动** — `harness-bugfix` Step 1 通过 `Skill(investigate)` invoke | Round 8（harness-bugfix 里明示引用） |
| 13 | `office-hours` | 需求诊断教练（Stage -1 前置） | 🟢 **保留不动** — 用户主动说"我有个想法"时触发，作为 Stage 0 前置 | 不改 |
| 14 | `gstack` | 浏览器自动化 QA | 🟢 **保留不动** — 前端类任务在 Stage 6 被 `team-qa` 调用 | 不改 |
| 15 | （独立 Java 生态，本仓库外）`meituan-java-standards` / `java-backend-i18n-refactor` / `costasset-i18n-phase2` | Java 企业规则 / i18n 改造 / repo-specific | 🟢 **保留独立** — `company-mt` overlay 通过 `Skill(...)` invoke；缺失时 `doctor` 标 optional-but-missing，overlay 运行时降级警告 | Round 12 |

**新增 skill（本次升级引入的 6 个）**：

| # | Skill | 来源 | 职责 |
|---|-------|------|------|
| 16 | `profile-entry` | Spec 2 落地 | 内部 only 路由器（marker 查 → fallback matchers → fast-path → 优先级解析 → 加载 exactly ONE 叶子 skill），不对外宣传触发词 | Round 7 |
| 17 | `harness-common` | Spec 2 落地 | Phase 1-4 共享基础设施 + `--maintain` 模式 | Round 7 |
| 18 | `harness-quick` | Spec 2 落地 | 1 文件 <10 行修改的轻量路径（fast-path 自动路由） | Round 8 |
| 19 | `harness-bugfix` | Spec 2 落地 | investigate → reproduce → fix → regression test → commit 五步 TDD | Round 8 |
| 20 | `harness-feature` | Spec 2 落地 | 继承原 harness-workflow 的 8-Stage 完整流程 | Round 9（在 harness-feature 的 Stage 调用链里明示 invoke）|
| 21 | `harness-refactor` | Spec 2 落地 | baseline capture + 增量 plan + 持续验证 + 对比 baseline | Round 9（在 harness-feature 的 Stage 调用链里明示 invoke）|

**对外分发清单**（`harness init` CLI 投放到目标项目 `.claude/skills/` 的 skill）：

- 核心（personal + company-mt 都装）：`team-init` / `profile-entry` / `harness-workflow`（stub）/ `harness-common` / `harness-{quick,bugfix,feature,refactor}` / `strict-reviewer`
- company-mt 额外：`company-{quick,bugfix,feature,refactor}`（overlay）
- **不投放**（保持 myskills 本地独立）：`team-pd` / `team-architect` / `team-senior-dev` / `team-junior-dev` / `team-qa` / `team-security` / `team-commander` / `task-dispatcher` / `investigate` / `office-hours` / `gstack`
  - 理由：这些 skill 是 harness-feature 内部 Stage 调用的依赖，若外部用户装了 `team-init` + CLI，且他们的 Claude Code 全局 skill 里没有这些 team-* skill，则 `harness-feature` 运行时按 **degraded fallback** 行为：`doctor` 标 `optional-but-missing`，运行时打警告 + 降级走通用流程；明确不静默兜底
  - 用户可通过 `npm install -g harness-workflow-cli + 单独从 myskills repo clone/symlink team-* skill` 的方式补齐
