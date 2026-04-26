# myskills

个人 Claude Code Skills 集合 + Harness 工程体系 monorepo —— **一套核心规则 + 两种使用方式 + 跨工具兼容**。

## 仓库定位

harness 是一套 profile-driven、四层分层的 AI 工程协作框架：核心规则（routing / push-decision / drift / memory / hard-floor / knowledge / reviewer-gates / ...）写一遍，所有支持的工具（Claude Code / Codex / Cursor / Aider / Copilot）共用同一份契约。两种使用方式（直接 markdown 接入 vs `harness` npm CLI 工程化）共享同一个核心，contract test 守门保证一致性。

```text
                       ┌────────────────────────────┐
   每条用户消息 ─────▶  │      task-dispatcher        │  通用并行编排（外层）
                       └─────────────┬──────────────┘
                                     │ 涉及代码任务时
                                     ▼
                       ┌────────────────────────────┐
                       │  harness route (CLI)        │  Tier 1 路由：profile + task_type + mode
                       │  profile-entry (markdown)   │  Tier 3 fallback：纯 markdown 解析
                       └─────────────┬──────────────┘
                                     │ exactly ONE leaf
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
       harness-quick        harness-bugfix        harness-feature / harness-refactor
       (S 级 trivial)       (定位 + 修)          (M/L/XL 级新功能 / 重构)
                                     │
                                     ▼
                              harness-common
                       (14 narrative contracts in contracts/)
```

## 4 层架构

| 层 | 内容 | 入口 |
|----|------|------|
| **Layer 0 — Schema / 类型** | TypeScript constants + JSON Schema（12 份），CI `schema-drift.yml` 守门 | `packages/harness-cli/src/types/constants.ts` |
| **Layer 1 — 持久化文件契约** | `docs/memory/*.md`（项目级长期 memory）/ `docs/harness/knowledge/`（5-domain 项目知识）/ `.harness-profile`（YAML marker）/ `.harness-status.json` | `harness-common/contracts/memory.md`、`harness-common/contracts/knowledge.md` |
| **Layer 2 — 14 narrative contracts** | profile / routing / push-decision / drift / memory / knowledge / hard-floor-enforcement / aggression-mode / autonomy / reviewer-gates / phase-init / hooks / doctor-protocol / task-type | `harness-common/contracts/`（14 份 .md，每份顶部 source-of-truth header） |
| **Layer 3 — Skill / Adapter** | leaf skills（4 task-type）+ team-* agents + Tier-1/2/3 adapters | 顶层 SKILL.md 文件 |

## 16 能力清单（精炼版）

| # | 能力 | 契约文档 |
|---|------|---------|
| 1 | profile 解析（marker / matcher / precedence） | `harness-common/contracts/profile.md` |
| 2 | routing（task_type 派发 + tie-break） | `harness-common/contracts/routing.md` |
| 3 | task-type 输入契约 | `harness-common/contracts/task-type.md` |
| 4 | push 决策（HIGH/MEDIUM/LOW 三档） | `harness-common/contracts/push-decision.md` |
| 5 | hard-floor 强制（flag 不可绕过） | `harness-common/contracts/hard-floor-enforcement.md` |
| 6 | aggression mode（conservative/standard/aggressive） | `harness-common/contracts/aggression-mode.md` |
| 7 | autonomy（用户介入边界） | `harness-common/contracts/autonomy.md` |
| 8 | drift 检测（managed file 漂移） | `harness-common/contracts/drift.md` |
| 9 | memory（三层写入权限） | `harness-common/contracts/memory.md` |
| 10 | knowledge retrieval（Stage -0.5 注入） | `harness-common/contracts/knowledge.md` |
| 11 | reviewer-gates（4 硬门：grounding / repro / coverage / knowledge） | `harness-common/contracts/reviewer-gates.md` |
| 12 | phase-init（init / adopt / maintain） | `harness-common/contracts/phase-init.md` |
| 13 | hooks（Stop Hook 自适应阈值） | `harness-common/contracts/hooks.md` |
| 14 | doctor protocol（诊断输出契约） | `harness-common/contracts/doctor-protocol.md` |
| 15 | maintenance（12 项 audit + 4 类一致性 + 7 步 drift 恢复） | `harness-common/contracts/maintenance.md` |
| 16 | project detection（技术栈探测 + `.harness-context.json`） | `harness-common/contracts/project-detection.md` |

完整 narrative spec → 参 `docs/superpowers/specs/2026-04-26-unified-fusion-design.md`。

## 7 kernel（精炼版）

跨工具复用的核心 kernel（每条规则在每个 Tier-1/2 wrapper 中以 AGENTS.md 重复出现，保持 byte-equal）：

1. **profile-resolve** — 项目侧探测 profile 唯一性
2. **task-type detect** — 结构性 fast-path + LLM fallback
3. **push-decision** — 三档 risk 裁决
4. **hard-floor enforcement** — flag 不可绕过
5. **memory write** — `docs/memory/*.md` 为主，cross-session memory 为 optional
6. **drift check** — managed file 漂移检测
7. **knowledge retrieval** — Stage -0.5 注入

详见各 wrapper 下 `AGENTS.md` 文件（Tier-1: Claude Code / Codex；Tier-2: Cursor / Aider / Copilot）。

## 跨工具 adapter map

| Tier | 工具 | 入口 / 形态 |
|------|------|------------|
| **Tier 1** | Claude Code | 顶层 skill + `harness install` symlink + `hooks/context-monitor.sh` |
| **Tier 1** | Codex CLI | `wrappers/codex/AGENTS.md` + `harness-init` kernel duplicated |
| **Tier 2** | Cursor | `wrappers/cursor/AGENTS.md` |
| **Tier 2** | Aider | `wrappers/aider/AGENTS.md` |
| **Tier 2** | GitHub Copilot | `wrappers/copilot/AGENTS.md` |
| **Tier 3** | 任何不带 npm 的环境 | `harness/profile-bootstrap/lib/` 纯 bash fallback + `profile-entry/` markdown 解析 |

## 两种使用方式

### 方式 A：`harness` npm CLI（工程化路线）

```bash
cd ~/myskills/packages/harness-cli && npm install && npm run build && npm link
harness install            # 零问题 user-global setup
harness doctor             # 验收
```

### 方式 B：纯 markdown / Tier 3 fallback（无 npm）

直接 symlink 顶层 skill 到 `~/.claude/skills/`，用 `harness/profile-bootstrap/lib/` 提供的 bash 算法派生 profile。完整接入文档见 [`harness/README.md`](harness/README.md)。

## 快速开始

### 前置依赖

| 类别 | 必需 | 可选（acceleration / 跨模型审查）|
|------|------|------|
| Claude Code 插件 | `superpowers@claude-plugins-official` | `codex@openai-codex`（Stage 5 跨模型审查）、`claude-mem@thedotmack`（仅 Claude Code 内的跨会话语义搜索加速；项目级 memory 不依赖它）|
| MCP server | `context7`、`playwright` | — |
| Hooks | 7 个标准 hook（含 Stop Hook → `hooks/context-monitor.sh`） | — |

> **跨工具 memory 契约**：项目级长期 memory = `docs/memory/*.md`（Layer 1 强约束，任何工具都能读写、git 跟踪）。跨会话 memory 由各工具自带能力（claude-mem / codex resume / cursor history）兜底，可选不强制。详见 `harness-common/contracts/memory.md`。

### Step 1 —— clone 仓库（含 submodule）

```bash
git clone --recurse-submodules git@github.com:TerryGSL/myskills.git ~/myskills
# 已克隆但漏 submodule:
cd ~/myskills && git submodule update --init --recursive
```

### Step 2 —— 装到 user-global

```bash
cd ~/myskills/packages/harness-cli && npm install && npm run build && npm link
harness install            # 零问题 setup：symlink skills + 注册 hook
harness doctor             # 验收
```

无 npm？走 Tier 3（纯 bash fallback）：手动 symlink 顶层 skill 到 `~/.claude/skills/`，用 `harness/profile-bootstrap/lib/` 提供的 bash 算法派生 profile。

### Step 3 —— 在你的项目里直接说需求

```bash
cd ~/your-project
# 直接说：「帮我加一个用户登录接口」
# task-dispatcher → harness route 自动派发到 harness-feature
```

公司内部项目首次接入要派生 profile：

```bash
harness profile-bootstrap <slug>   # 派生 company/<slug> profile（含 hard_floor）
```

## 8 命令（CLI）

| 命令 | 用途 |
|------|------|
| `harness install` | 零问题 user-global setup（symlink skills + hook 注册） |
| `harness doctor` | 验收当前接入是否健康 |
| `harness profile-bootstrap <slug>` | 派生 company/<slug> profile，含 `hard_floor` |
| `harness profile-resolve --json` | 解析当前项目 profile（marker / matcher / precedence 全链路输出） |
| `harness scan --json` | 项目知识扫描（5-domain pipeline 入口） |
| `harness route --json` | 统一路由：profile × task_type × aggression → 唯一 leaf skill |
| `harness memory check --json` | memory 三层写入权限 + claude-mem optional 状态 |
| `harness push-check --hard-floor=auto_push,force_push` | push 决策裁决（HIGH/MEDIUM/LOW） |
| `harness init` | 新项目初始化（生成 docs/、STATE.json、CLAUDE.md） |
| `harness adopt` | 现有项目接入 |
| `harness maintain` | 检查持久化文件是否与代码同步 |

兼容老命令：`/harness-workflow --init / --adopt / --maintain / --scan`。

## 目录结构速查

```text
harness-init/                项目首次接入入口（外部用户只装这一个）
profile-entry/               Tier-3 fallback router（纯 markdown 路由）
harness-quick/               S 级 trivial 任务
harness-bugfix/              bug 定位 + 修复
harness-feature/             新功能（M/L/XL）
harness-refactor/            跨模块重构
harness-common/              共享基础设施 + contracts/（14 份 narrative contract）
harness-workflow/            老命令兼容入口（--init/--adopt/--maintain/--scan）+ references
task-dispatcher/             通用并行任务编排
strict-reviewer/             反谄媚审稿（schema-driven）
team-{pd,architect,senior-dev,junior-dev,qa,security}/  6 个角色 agent
team-init/                   harness-init alias（向后兼容）
team-commander/              team-* 工作流指挥官
investigate/                 系统调试 4-阶段方法论
office-hours/                需求诊断教练（Stage 0 前置）
packages/harness-cli/        TypeScript CLI（harness 二进制 + 多命令）
hooks/context-monitor.sh     Stop Hook，task_type 自适应阈值
wrappers/                    跨工具 adapter（codex / cursor / aider / copilot）
harness/                     直接接入文档 + Tier-3 fallback bash + 历史档案
gstack/                      AI Skills 框架（git submodule）
docs/superpowers/{specs,plans}/  设计文档 + 实施计划
```

## 关键文档

| 文档 | 说明 |
|------|------|
| `docs/superpowers/specs/2026-04-26-unified-fusion-design.md` | 当前架构 design（最新） |
| `docs/superpowers/plans/2026-04-26-unified-fusion-implementation.md` | 实施计划 |
| `harness-common/contracts/` | 14 份 narrative contract（push-decision / drift / memory / ...） |
| `harness-init/SKILL.md` | 接入入口 |
| `harness/README.md` | 直接用法接入文档（Tier-3 fallback） |
| `packages/harness-cli/README.md` | CLI 详细命令文档 |

## Push 决策（risk-based）

由 `harness push-check` 或 markdown 契约（Tier 3 fallback）裁决，公司 profile 默认 `hard_floor: [auto_push, force_push, ...]`，任何 flag 都不能绕过。

| 档位 | 触发 | 行为 |
|------|------|------|
| **HIGH** | 命中 hard_floor / force-push 主干 / 大规模删除 / 凭据泄漏迹象 | 拒绝；报告原因，等用户显式覆盖 |
| **MEDIUM** | 跨模块改动 / 影响公开契约 / 测试未覆盖区 | 询问；输出 diff 摘要 + 1 句风险，等确认 |
| **LOW** | 单文件、有测试、conservative profile 内 | 自动 push（仅 standard/aggressive mode 下） |

aggression mode：`conservative`（默认）/ `standard` / `aggressive`，与 profile 正交。

## Stop Hook 自适应阈值

`hooks/context-monitor.sh` 按当前 task_type 调整 context 占用警告阈值：

| task_type | warn / hard 阈值 |
|-----------|-----------------|
| quick | 80% / 90% |
| bugfix | 70% / 85% |
| feature / refactor | 60% / 80% |

避免 quick 任务被过度提醒、feature 任务过晚提醒。

## 历史档案

`harness-workflow.legacy-backup-2026-04/` 是融合前**旧版单体 harness-workflow** 的快照（archived，不再开发）。
