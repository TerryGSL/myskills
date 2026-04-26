# Harness 架构与 Skill 全图

> 一份面向**用户**和**贡献者**的完整架构文档。读完这一份，你应该知道：
> - 仓库每个目录是干什么的
> - 你说一句话之后，背后哪几个 skill 在跑、按什么顺序
> - 每个 skill 的角色、触发条件、输入输出
> - 怎么扩展、怎么调试、怎么排查故障

> **配套必读**：
> - [`AGENTS.md`](../AGENTS.md) §0 价值层（7 条姿态铁律，always-on）
> - [`EXAMPLES.md`](../EXAMPLES.md) ❌/✅ 反面教材（真实犯过的错 + 正确做法）
> - [`docs/SETUP.md`](SETUP.md) Claude + Codex 接入完整步骤

---

## 1. 一句话总览

**Harness 是一套 profile-driven 的 AI 工程协作框架**：核心规则写一份（16 份 narrative contract），多种工具（Claude Code / Codex / Cursor / Aider / Copilot）共用同一份契约；用户既可以装 npm CLI 走工程化路线，也可以纯 markdown + bash fallback 走零依赖路线。

---

## 2. 4 层架构

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3 — Skill / Adapter（执行层）                              │
│   leaf skills (4) + 协作 agents (8) + safety guards (4)         │
│   + 跨工具 wrappers (Codex / Cursor / Aider / Copilot)           │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2 — 16 Narrative Contracts（规则层，人读的契约）           │
│   harness-common/contracts/*.md                                  │
│   profile / routing / task-type / push-decision /                │
│   hard-floor-enforcement / aggression / autonomy / drift /       │
│   memory / knowledge / reviewer-gates / phase-init / hooks /     │
│   doctor-protocol / maintenance / project-detection              │
├─────────────────────────────────────────────────────────────────┤
│ Layer 1 — 持久化文件契约（数据层，git 跟踪）                     │
│   docs/memory/*.md（项目级长期 memory，跨工具共享）              │
│   docs/harness/knowledge/（5-domain 项目知识）                   │
│   .harness-profile（YAML marker，project profile 标记）          │
│   .harness-status.json（doctor / managed-files 状态快照）        │
├─────────────────────────────────────────────────────────────────┤
│ Layer 0 — Schema / 类型（机器读的契约，CI 守门）                 │
│   packages/harness-cli/src/types/constants.ts                    │
│   packages/harness-cli/resources/schemas/*.schema.json (12 份)   │
│   .github/workflows/schema-drift.yml                             │
└─────────────────────────────────────────────────────────────────┘
```

**为什么分这 4 层？**

- Layer 0 是机器约束，CI 强制；任何代码改 enum / type 必须重 gen schema 才能合 PR
- Layer 1 是文件契约，跨工具共享（claude-mem / codex resume / cursor history 都不能替代它）
- Layer 2 是规则的 narrative 副本，给人读 / 给 AI 读，但**代码 / schema 才是 source of truth**
- Layer 3 是触发执行，按 profile × task_type × aggression 三维路由到唯一一个 leaf skill

---

## 3. 任务执行流（用户说话 → 执行）

```
                   ┌───────────────────────────────────────┐
   每条用户消息 ──▶│ L0 评估（隐式，AI 脑内做，不必 Skill 调用）│
                   │   分解子任务数：单 / ≥2 ?              │
                   └────────────┬──────────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
        ≥2 独立子任务                       单任务（含查询）
              │                                   │
              ▼                                   ▼
   ┌────────────────────────────┐    ┌──────────────────────────────┐
   │ 显式 Skill(task-dispatcher)│    │ L1 入口分发                   │
   │ 加载派发协议 → 派 sub-agent│    │  代码任务 → Skill(harness-... │
   │     并行（每个仍走 L1）     │    │   workflow)                  │
   └────────────────────────────┘    │  生命周期 → harness <cmd>     │
                                     │  纯查询/解释 → 直接答         │
                                     └────────────┬──────────────────┘
                                                  │ 代码任务时
                                                  ▼
                                ┌────────────────────────────────┐
                                │ harness route (CLI, Tier 1+2)  │
                                │ profile-entry (md, Tier 3)     │
                                └────────────┬───────────────────┘
                                             │ 输出 exactly ONE leaf
                                             ▼
                ┌────────────┬────────────┬───────────────┬──────────────┐
                ▼            ▼            ▼               ▼              ▼
            harness-      harness-     harness-       harness-       company-*
            quick         bugfix       feature        refactor       overlay
            (S 级)        (M 级)       (L/XL 级)      (重构)         (公司 profile)
```

**重要分层语义：**

- **L0 评估**：每条消息都过，但**隐式**（AI 脑内判断），不需要也不应该每条都 Skill(task-dispatcher) — 那样会浪费 token 加载完整派发协议
- **显式 Skill(task-dispatcher)**：仅当 L0 评估命中 ≥2 独立子任务时触发，加载详细派发模板 / 不重叠边界规则 / 输出预期等协议
- **显式 Skill(harness-workflow)**：仅当 L1 评估命中代码任务时触发；纯查询不进 L1
- **leaf skill 自动派发**：harness route / profile-entry 输出 leaf 后由 harness-workflow 内部 invoke，用户层面看不到

**关键不变量：**

- 一条用户消息 → 一个 leaf skill 被执行（不并发激活多个 leaf）
- task-dispatcher 只做**外层并行**（如"修 bug + 调研免费额度 + 写文档"分解为 3 个独立 sub-task），每个 sub-task 仍然只走一个 leaf
- profile × task_type × aggression 是三维独立维度；hard_floor 优先级最高，flag 不可绕过

---

## 4. Skill 完整速查（按角色分组）

### 4.1 入口 / 路由层

| Skill | 角色 | 触发条件 | 输出 / 调用 |
|-------|------|---------|------------|
| `task-dispatcher` | 外层并行编排器 | **每条用户消息**自动评估 | 1 任务 → 直接执行；2+ 独立 → 派 sub-agent |
| `harness-workflow` | 公开入口（统一）| `/harness-workflow` 命令 / 任何代码任务关键词 | 调 `harness route` → 选 leaf skill |
| `harness-init` | 初始化入口（外部用户唯一入口）| `harness init` / "接入 harness" | 写 `.harness-profile` / `docs/memory/` / `CLAUDE.md` |
| `profile-entry` | Tier-3 fallback 路由器（无 node 时）| 仅在 CLI 不可用时被 leaf skill 间接 invoke | 手算等价 route object（profile / task_type / mode）|
| `harness-common` | 共享基础设施 + 16 contracts | leaf skill / overlay 通过 `Skill(harness-common)` invoke | passthrough CLI 命令、加载 contract、状态文件 IO |

### 4.2 执行层（leaf skill — 唯一执行者）

| Skill | 复杂度 | 触发 | 流程要点 |
|-------|-------|------|---------|
| `harness-quick` | S（< 10 行 / 1 文件 / 不碰 schema） | profile-entry **结构性 fast-path**（自动） | 跳过 PRD/architect/plan → edit + test + commit |
| `harness-bugfix` | M（bug 修复） | `--fix` flag / bug 语义关键词 / profile-entry 识别 | 五步 TDD：investigate → reproduce → fix → regression → commit |
| `harness-feature` | L/XL（新功能） | profile 默认（非 quick/bugfix/refactor 都走这） | 8-Stage：需求 → 架构 → 规划 → 实现 → 审查 → QA → 安全 → 收尾 |
| `harness-refactor` | 重构（行为不变） | `--refactor` flag | baseline capture → 增量 plan → 持续验证 → 对比 baseline |

> **关键铁律**：harness-refactor **不允许行为变化**；任何 behavior diff 必须升级到 harness-feature / harness-bugfix。

### 4.3 协作 agent（被 leaf skill 显式 invoke 的子角色）

| Agent | 角色 | 在哪一步被调用 |
|-------|------|--------------|
| `team-pd` | 产品设计师（PRD + DESIGN.md）| feature Stage 0~1 |
| `team-architect` | 系统架构（Torvalds 风格，会打回设计黑洞）| feature Stage 2 |
| `team-senior-dev` | 老登（代码洁癖，核心 + Code Review 小登）| feature Stage 3 |
| `team-junior-dev` | 小登（CRUD + 业务模块，受老登 review）| feature Stage 3 |
| `team-qa` | QA 工程师（覆盖率 / 集成 / E2E / 冒烟）| feature Stage 5 |
| `team-security` | SDL 安全（OWASP / 威胁建模 / 依赖审计）| feature Stage 6 |
| `team-commander` | team-* 工作流指挥官（状态机调度）| 老的 team-* 流程入口 |
| `team-init` | alias for harness-init | 旧用法兼容 |

### 4.4 审查 / 调试 / 教练 / 仲裁

| Skill | 角色 | 触发 |
|-------|------|------|
| `strict-reviewer` | 反谄媚审稿（默认 FAIL 立场 + 4 硬门：Grounding / Reproduction / Coverage / Knowledge）| feature Stage 4/5/6/7 自动 / 手动 PR review |
| `investigate` | 系统调试 4 阶段（根因 → 模式 → 假设 → 验证）| harness-bugfix Step 1 自动；用户说"调试" / "为什么坏了" |
| `office-hours` | 需求诊断教练（产品/工程模式 6 个逼问）| feature Stage 0 前置 / 用户说"想想这个需求" |
| `judge-agent` | 多 agent 冲突仲裁（**只读**，输入争议方案，输出仲裁结论 A/B/合并/回退）| 多 agent 结论冲突 / 文件边界重叠 / Stage verdict 分歧 |

### 4.5 安全防护（vendored from gstack@ed1e4be2）

| Skill | 角色 | 触发 / 用法 |
|-------|------|------------|
| `careful` | 危险命令拦截（rm -rf / DROP TABLE / force-push 等）| "careful mode" / 触发危险 Bash 时 |
| `freeze` | 编辑边界（限制 Write / Edit 在指定目录内）| "freeze mode" / 锁调试范围 |
| `guard` | careful + freeze 组合 | "guard mode" / 动 prod 或 live 系统 |
| `unfreeze` | 解除 freeze 边界 | freeze 后清理 |

> **Governance 注意**：当 active profile 的 `hard_floor` 含 `destructive_ops` / `rewrite_history` / `auto_push` / `force_push` 时，careful/guard 的 "可 override 警告" 行为**失效** —— hard_floor 直接 REFUSE，不再询问。详 `harness-common/contracts/hard-floor-enforcement.md`。

---

## 5. 16 Narrative Contracts（规则源头）

每份 contract 顶部都标注 source-of-truth header，引用 `packages/harness-cli/src/types/constants.ts` + `resources/schemas/*.schema.json`。

| # | Contract | 解决什么问题 |
|---|----------|------------|
| 1 | `profile.md` | 项目 profile schema、matcher 算法、bootstrap 派生流程 |
| 2 | `routing.md` | task_type 派发 + tie-break 规则（marker / matcher / fast-path / flag）|
| 3 | `task-type.md` | 4 种 task-type 的输入契约（什么样的输入算 quick / bugfix / feature / refactor）|
| 4 | `push-decision.md` | HIGH / MEDIUM / LOW 三档 push risk 裁决 |
| 5 | `hard-floor-enforcement.md` | 6 个 flag 不可被任何方式绕过的强制契约 |
| 6 | `aggression-mode.md` | conservative / standard / aggressive 三种执行模式 |
| 7 | `autonomy.md` | 用户介入边界（什么决策必须用户签字）|
| 8 | `drift.md` | managed file 漂移检测（doctor / maintain）|
| 9 | `memory.md` | 三层 memory 写入权限（docs/memory 必需、状态文件必需、claude-mem optional）|
| 10 | `knowledge.md` | Stage -0.5 知识检索 + 5-domain 扫描 |
| 11 | `reviewer-gates.md` | 4 硬门：Grounding / Reproduction / Coverage / Knowledge |
| 12 | `phase-init.md` | init / adopt / maintain 三阶段契约 |
| 13 | `hooks.md` | Stop Hook 自适应阈值（按 task_type 调整 context 警告点）|
| 14 | `doctor-protocol.md` | 诊断输出契约（JSON schema）|
| 15 | `maintenance.md` | 12 项 audit + 4 类一致性 + 7 步 drift 恢复 |
| 16 | `project-detection.md` | 技术栈探测 + `.harness-context.json` |

---

## 6. CLI 11 命令速查

| 命令 | 用途 | 输出 |
|------|------|------|
| `harness init [path]` | 新项目初始化 | 生成 `.harness-profile` / `docs/memory/` / `docs/harness/knowledge/` / 顶层 skills symlinks |
| `harness adopt [path]` | 现有项目接入（保留用户改过的文件）| 同上但走 four-state policy |
| `harness doctor [--json]` | 诊断当前接入状态 | exit 0=健康；1=warn；2=error；JSON 详细输出 |
| `harness maintain [--upgrade]` | 漂移报告 + 可促升 learnings 提醒 | drift list；`--upgrade` 重应用 templates |
| `harness scan [--json]` | 5-domain 项目知识扫描入口 | pipeline plan；AI 走 harness-feature Stage -0.5 |
| `harness install [--doctor]` | 用户级 setup（profiles + hook + skill symlinks）| 默认 check + auto-fix |
| `harness profile-bootstrap <slug>` | 派生 company profile | 写 `~/.claude/profiles/company-<slug>.yml` + repo `.harness-profile` |
| `harness profile-resolve [--json]` | 解析当前项目 profile（marker → matcher → precedence）| route 决策的第 0 步 |
| `harness route [--json]` | 统一路由：profile × task_type × aggression → leaf skill | `{ leaf_skill, profile, task_type, mode, ... }` |
| `harness memory check [--json]` | memory 三层写入权限校验 | docs/memory / status.json / claude-mem 状态 |
| `harness push-check [--hard-floor=...]` | push risk 裁决 | exit 0=LOW / 1=MEDIUM / 2=HIGH |

---

## 7. 工作流 Walkthrough（4 个典型场景端到端）

### 7.1 "修一个登录 bug" — harness-bugfix

```
用户："登录接口 500，帮我修一下"
  │
  ▼
L0: task-dispatcher
  → 单任务，跳过外层并行
  │
  ▼
L1: harness-workflow
  → 调 harness route --task-description="修登录接口 500"
  │
  ▼
harness route
  → profile = personal / company-* (按 marker/matcher)
  → task_type = bugfix（因为含 "修" + 错误码）
  → aggression = standard（profile 默认）
  → 输出 leaf_skill = harness-bugfix
  │
  ▼
harness-bugfix
  Step 1: invoke Skill(investigate) — 4 阶段调试
          → 根因调查 → 模式分析 → 假设 1：Cookie expire? 验证失败
                                      假设 2：DB 连接池打满？ 验证 ✓
  Step 2: 写复现测试（红）
  Step 3: 修复（绿）
  Step 4: 跑全套回归测试
  Step 5: commit + push（按 push-check 决策档位）
          + 写 docs/memory/cases/<incident>.md（如 errors_collection 命中阈值）
```

### 7.2 "加一个用户登录接口" — harness-feature 8-Stage

```
Stage -0.5: knowledge retrieval — 读 docs/harness/knowledge/INDEX.md，注入相关 binding rules
Stage 0   : office-hours（可选）— 需求诊断 6 个逼问
Stage 1   : team-pd — 产出 PRD.md + DESIGN.md
Stage 2   : team-architect — 审查并产出 ARCHITECTURE.md（含 schema / API 契约 / 目录规范）
Stage 3   : team-senior-dev + team-junior-dev — 老登/小登并行实现
Stage 4   : strict-reviewer — Grounding / Reproduction / Coverage / Knowledge 四硬门审稿（FAIL 阻塞）
Stage 5   : team-qa — 覆盖率 / 集成 / E2E / 冒烟（FAIL 阻塞）
Stage 6   : team-security — SDL / OWASP / 依赖审计（CRITICAL 阻塞）
Stage 7   : strict-reviewer 终审
Stage 8   : commit + push（按 push-decision 档位）+ memory observation + 可促升 learnings
```

### 7.3 "把 utils.ts 拆成 3 个模块" — harness-refactor

```
Step 1: baseline capture — 跑全套测试 + 行为快照（HTTP API / CLI 输出 / 关键 log）
Step 2: 增量 plan — 列拆分计划（每步单测保 PASS）
Step 3: 持续验证 — 每个增量步后跑测试，发现行为 diff → 回退并升级到 feature/bugfix
Step 4: 对比 baseline — 测试 + 行为快照 byte-equal
Step 5: commit + push
```

### 7.4 "改个 typo" — harness-quick

```
profile-entry 结构性 fast-path 自动识别：1 文件 + < 10 行 + 不碰 schema/export/deps
  ↓
跳过 PRD / architect / plan，直接：
  Step 1: edit
  Step 2: 跑相关单测（如有）
  Step 3: commit + push
  Step 4: 写一条 learnings observation（不写 memory case）
```

---

## 8. 跨工具 Adapter Map

| Tier | 工具 | 入口 / 形态 |
|------|------|------------|
| **Tier 1** | Claude Code | 顶层 skill 目录 + `harness install` symlink + `hooks/context-monitor.sh` |
| **Tier 1** | Codex CLI | `wrappers/codex/AGENTS.md` + harness-init kernel 重复（byte-equal）|
| **Tier 2** | Cursor | `wrappers/cursor/AGENTS.md` |
| **Tier 2** | Aider | `wrappers/aider/AGENTS.md` |
| **Tier 2** | GitHub Copilot | `wrappers/copilot/AGENTS.md` |
| **Tier 3** | 任何不带 npm 的环境 | `harness-init/lib/derive.sh`（bash fallback） + `profile-entry/SKILL.md`（markdown 路由）|

**7 kernel rules**（每个 Tier-1/2 wrapper 必须 byte-equal 重复）：

1. profile-resolve — 项目侧探测 profile 唯一性
2. task-type detect — 结构性 fast-path + LLM fallback
3. push-decision — 三档 risk 裁决
4. hard-floor enforcement — flag 不可绕过
5. memory write — `docs/memory/*.md` 为主，cross-session memory 为 optional
6. drift check — managed file 漂移检测
7. knowledge retrieval — Stage -0.5 注入

---

## 9. Memory 三层契约

| 层 | 路径 | 谁写 | 跨工具？ | 必需？ |
|----|------|------|---------|-------|
| **L1 持久化** | `docs/memory/{cases,decisions,constraints,archive}/*.md` | 所有工具（任何 AI 工具）| ✓ | **必需**，单一权威源 |
| **L2 状态** | `.harness-status.json` | CLI（doctor / maintain）| ✓ | **必需**，doctor 输出 |
| **L3 加速** | claude-mem（Claude Code）/ codex resume / cursor history | 各工具自带 | ✗ | optional acceleration |

**铁律**：L3 缺失不影响功能；L1 缺失会导致跨工具协作丢上下文。

---

## 10. 安全机制

### 10.1 hard_floor（不可绕过的 6 个 flag）

定义在 `packages/harness-cli/src/types/constants.ts`：

```ts
HARD_FLOOR_FLAGS = ['auto_push', 'force_push', 'destructive_ops',
                    'auto_merge', 'rewrite_history', 'network_install']
```

公司 profile（如 `company-mt`）默认全开。任何 `/yolo` flag 或用户 override 都不能突破。详 `harness-common/contracts/hard-floor-enforcement.md`。

### 10.2 push 决策（push-decision.md）

| 档位 | 触发 | 行为 |
|------|------|------|
| **HIGH** | 命中 hard_floor / force-push 主干 / 大规模删除 / 凭据泄漏迹象 | REFUSE；报告原因，等用户显式覆盖 |
| **MEDIUM** | 跨模块改动 / 影响公开契约 / 测试未覆盖 | ASK；输出 diff 摘要 + 1 句风险，等确认 |
| **LOW** | 单文件、有测试、conservative profile 内 | 自动 push（仅 standard/aggressive mode 下）|

### 10.3 Stop Hook 自适应阈值（hooks.md）

`hooks/context-monitor.sh` 按 task_type 自动调整 context 占用警告点：

| task_type | warn / hard 阈值 |
|-----------|-----------------|
| quick | 80% / 90% |
| bugfix | 70% / 85% |
| feature / refactor | 60% / 80% |

避免 quick 任务被过度提醒、feature 任务过晚提醒。

---

## 11. 仓库目录速查

```
myskills/
├── README.md                    顶层入口（精简版）
├── docs/
│   ├── ARCHITECTURE.md          本文档
│   ├── setup-without-cli.md     无 CLI 环境接入指南（Tier-3）
│   ├── archive/                 早期 archive 设计文档
│   └── superpowers/{specs,plans}/  历史 spec / plan
├── harness-common/
│   ├── SKILL.md                 共享基础设施 skill
│   └── contracts/               16 份 narrative contract（规则源）
├── harness-init/                项目首次接入入口（外部用户只装这一个）
│   ├── SKILL.md
│   └── lib/                     Tier-3 fallback bash 算法（无 CLI 也能用）
├── harness-workflow/            公开入口（统一）+ templates
├── harness-{quick,bugfix,feature,refactor}/   4 个 leaf skill
├── profile-entry/               Tier-3 fallback markdown 路由
├── task-dispatcher/             外层并行编排
├── strict-reviewer/             反谄媚审稿
├── investigate/ office-hours/   调试方法论 + 需求教练
├── team-{pd,architect,senior-dev,junior-dev,qa,security,commander,init}/
├── careful/ guard/ freeze/ unfreeze/   安全防护（vendored from gstack）
├── packages/harness-cli/        TypeScript CLI（11 命令）
│   ├── src/{commands,types,utils}/
│   ├── resources/schemas/       12 份 JSON Schema
│   └── tests/                   168 jest tests / 26 suites
├── wrappers/{codex,cursor,aider,copilot}/   跨工具 adapter
├── hooks/context-monitor.sh     Stop Hook（task-type 自适应阈值）
└── gstack/                      git submodule（可选，39 个补充 skill）
```

---

## 12. 故障排除

| 症状 | 排查 |
|------|------|
| **skill 不加载** | `ls -la ~/.claude/skills/<skill>` 看 symlink 是否死链；重跑 `harness install` |
| **profile 探测错** | 项目根 `echo "harness" > .harness-profile`；查 `~/.claude/profiles/*.yml` 的 `detection.matchers` |
| **knowledge 不生效** | 确认 `docs/harness/knowledge/INDEX.md` 存在；检查 `.harness-status.json` 的 `knowledgeCheck.effective_index_status` |
| **hard_floor flag 被绕过** | 不应该发生；查 `harness-common/contracts/hard-floor-enforcement.md` 实施清单 |
| **CLI 装不了** | 走 Tier-3：[`docs/setup-without-cli.md`](setup-without-cli.md) |
| **doctor 报 drift** | 跑 `harness maintain` 看具体差异；`harness maintain --upgrade` 重应用 templates |

---

## 13. 扩展指南

### 加一个 leaf skill

1. 在顶层建 `<new-leaf>/SKILL.md`，frontmatter 含 `name` + 不公开 `triggers`
2. 在 `harness-common/contracts/routing.md` 添加路由规则
3. 在 `packages/harness-cli/src/commands/route.ts` 加映射
4. 加 golden fixture：`packages/harness-cli/tests/fixtures/golden/routing-<scenario>.yml`
5. 跑 `npm test`（jest 26 suites 必须全过）

### 加一份 contract

1. 在 `harness-common/contracts/<name>.md` 写 narrative
2. 顶部加 source-of-truth header（引用 `constants.ts` 或 `*.schema.json`）
3. 如新 enum / type → 改 `constants.ts` + 跑 `npm run regen:schema`
4. update README.md / 本文档的 16 → 17 计数

### 加一个跨工具 wrapper

1. 复制 `wrappers/codex/AGENTS.md` 为 `wrappers/<tool>/AGENTS.md`
2. 7 kernel rules 必须 byte-equal（用 `tools/check-kernel-equality.sh` 守门，如有）
3. 在 README.md adapter map 表里加一行

---

## 14. 关键设计哲学

- **一份契约多种使用** — 同一份 16 contracts，CLI / markdown / 跨工具都用
- **机器读 > 人读** — 代码 / schema 是 source of truth，narrative 是副本
- **AI 决策 + CLI 执行** — AI 做判断（探测、对话、决策），CLI 做幂等写文件
- **profile-driven** — 个人项目松、公司项目紧，靠 profile + hard_floor 区分
- **零冗余** — 每条规则一处定义；其他文档只引用不重复（避免 drift）

---

## 15. 参考文档

| 文档 | 说明 |
|------|------|
| [`README.md`](../README.md) | 顶层入口（精简版） |
| [`docs/setup-without-cli.md`](setup-without-cli.md) | 无 CLI 环境接入指南 |
| [`harness-common/contracts/`](../harness-common/contracts/) | 16 份 narrative contract（规则源） |
| [`packages/harness-cli/README.md`](../packages/harness-cli/README.md) | CLI 详细命令文档 |
| [`docs/superpowers/specs/2026-04-26-unified-fusion-design.md`](superpowers/specs/2026-04-26-unified-fusion-design.md) | 当前架构 spec |
| [`docs/superpowers/plans/2026-04-26-unified-fusion-implementation.md`](superpowers/plans/2026-04-26-unified-fusion-implementation.md) | 实施计划 |
| [`docs/archive/`](archive/) | 早期 archive 设计文档 |
