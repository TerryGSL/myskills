# myskills

个人 Claude Code Skills 集合 + Harness 体系 monorepo —— 仓库里**两套并存的独立 harness 实现**，可以分别接入。

## ⚠ 仓库结构（读之前先看这段）

仓库**同时容纳两套完全独立的 harness 工作流实现**，互不依赖、互不导入：

| 套别 | 位置 | 入口 | 特点 |
|------|------|------|------|
| **A 套** | `harness/` 子目录 | `harness/harness-workflow/SKILL.md` + `harness/setup/setup-harness.sh`（bash） | profile-entry 嵌套在 `harness/profile-entry/` 下；4 leaf skill 在 `harness/harness-{quick,bugfix,feature,refactor}/SKILL.md`；纯 markdown + bash 脚本，无 npm 依赖 |
| **B 套** | 仓库**顶层** + `packages/harness-cli/` | 顶层 `harness-init/SKILL.md` + `harness` npm CLI | 顶层 skill 平铺（`profile-entry/`、`harness-{quick,bugfix,feature,refactor}/`、`harness-common/`、`harness-init/` 等）；TypeScript CLI 提供 8 个命令；`hooks/context-monitor.sh` 自适应阈值；`scripts/regen-schema.ts` 守门 |

**怎么选**：
- 想要**完全无 node 环境**也能跑 → 用 A 套（symlink `harness/` 下的 skill 到 `~/.claude/skills/`）
- 想要 **CLI 工程化 + jest 测试 + GitHub workflow CI** → 用 B 套（`harness install` 一键接入）
- 不要**两套混链**到 `~/.claude/skills/`——会 skill name 撞名

旧版单体 harness-workflow 的备份快照在 `harness-workflow.legacy-backup-2026-04/`（属于 archived，不再开发）。

## 项目概览

下面所有架构图、命令清单、push 决策表 **默认描述 B 套**（顶层 + CLI 那一套）。A 套的对应文档在 [`harness/README.md`](harness/README.md)。

定位：一次配置，所有项目共享；profile × task_type × aggression 三维正交，硬底线（hard floor）不可绕过。

## 架构一图

```text
                       ┌────────────────────────────┐
   每条用户消息 ─────▶  │      task-dispatcher        │  通用并行编排
                       └─────────────┬──────────────┘
                                     │ 涉及代码任务时
                                     ▼
                       ┌────────────────────────────┐
                       │       profile-entry         │  探测 profile + task_type
                       └─────────────┬──────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
       harness-quick        harness-bugfix        harness-feature / harness-refactor
       (S 级 trivial)       (定位 + 修)          (M/L/XL 级新功能 / 重构)
                │                    │                    │
                └────────────────────┴────────────────────┘
                                     │ 共享
                                     ▼
                              harness-common
                       (push-decision / drift / memory / ...)

   生命周期入口：harness-init           （首次接入项目）
   兼容老命令： /harness-workflow --init|--adopt|--maintain|--scan
   底层 CLI：   packages/harness-cli/   8 命令
   Stop Hook：  hooks/context-monitor.sh （task_type 自适应阈值）
```

## 三个核心组件

### Harness Workflow（自治开发流）

profile-entry 路由到 4 个 leaf skill，按 task_type 选执行路径：

| Leaf skill | 适用 | Stage 路径 |
|------------|-----|-----------|
| `harness-quick` | trivial 编辑、1-3 文件、无架构变更 | 2 → 3 → 5 → 8 |
| `harness-bugfix` | 已知 bug 定位 + 修复 | investigate → 3 → 5 → 6 → 8 |
| `harness-feature` | 新功能 / M/L/XL 级 | 0 → 1 → 2 → 3 → 4 → 5 → 6 → (7) → 8 |
| `harness-refactor` | 跨模块重构、行为不变 | 1 → 2 → 3 → 5 → 6 → 8 |

共享基础设施在 `harness-common/contracts/`（push-decision / drift / memory / doctor-protocol / profile / task-type / aggression-mode / knowledge / autonomy / reviewer-gates / phase-init / hooks / hard-floor-enforcement / routing — 14 个 narrative contract）。

### Task Dispatcher（通用并行编排）

`task-dispatcher/` 在每条用户消息上自动评估并行化机会，派发 sub-agent 处理独立子任务并汇总。不限于代码 —— research、ops、Q&A、debugging 都可用。与 harness-workflow 互补：dispatcher 做外层任务拆分，harness-* 做内层代码开发流程。

### Harness CLI（`packages/harness-cli/`）

TypeScript 写的 `harness` 二进制，所有 enum/type 来自 `src/types/constants.ts`（schema 由 `scripts/regen-schema.ts` 派生，CI `.github/workflows/schema-drift.yml` 守门）。8 个命令见下方「常见命令」段。

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

推荐 Tier 1（npm 已就绪）：

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
# task-dispatcher → profile-entry 自动路由到 harness-feature
```

公司内部项目首次接入要派生 profile：

```bash
harness profile-bootstrap <slug>   # 派生 company/<slug> profile（含 hard_floor）
```

## 目录结构速查

```text
harness-init/                项目首次接入入口（外部用户只装这一个）
profile-entry/               项目侧路由器：探测 profile + 加载 leaf skill
harness-quick/               S 级 trivial 任务
harness-bugfix/              bug 定位 + 修复
harness-feature/             新功能（M/L/XL）
harness-refactor/            跨模块重构
harness-common/              共享基础设施（push-decision / drift / memory layers）
harness-workflow/            老命令兼容入口（--init/--adopt/--maintain/--scan）+ references
task-dispatcher/             通用并行任务编排
strict-reviewer/             反谄媚审稿（schema-driven）
team-{pd,architect,senior-dev,junior-dev,qa,security}/  6 个角色 agent
team-init/                   harness-init alias（向后兼容）
team-commander/              team-* 工作流指挥官
investigate/                 系统调试 4-阶段方法论
office-hours/                需求诊断教练（Stage 0 前置）
packages/harness-cli/        TypeScript CLI（harness 二进制 + 8 命令）
hooks/context-monitor.sh     Stop Hook，task_type 自适应阈值
harness/                     沙盒：profile-bootstrap/lib/ + 历史档案 + symlink
harness-workflow.legacy-backup-2026-04/  旧版单体 harness-workflow 快照
gstack/                      AI Skills 框架（git submodule）
docs/superpowers/{specs,plans}/  设计文档 + 实施计划
```

## 关键文档

| 文档 | 说明 |
|------|------|
| `docs/superpowers/specs/2026-04-26-harness-fusion-design.md` | 当前架构 design（最新） |
| `docs/superpowers/specs/2026-04-25-setup-zero-questionnaire-design.md` | 零问题 setup 设计 |
| `docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md` | profile-based dispatch 设计 |
| `docs/superpowers/plans/2026-04-26-harness-fusion-implementation.md` | fusion 实施计划 |
| `harness-common/contracts/push-decision.md` | push 决策三档 markdown 契约 |
| `harness-common/contracts/drift.md` | 状态漂移检测 |
| `harness-init/SKILL.md` / `profile-entry/SKILL.md` | 接入入口 + 路由器 |
| 各 leaf 的 `SKILL.md` | 4 个 task-type leaf 的执行 spec |

## 常见命令

| 命令 | 用途 |
|------|------|
| `harness install` | 零问题 user-global setup（symlink skills + hook 注册） |
| `harness doctor` | 验收当前接入是否健康 |
| `harness profile-bootstrap <slug>` | 派生 company/<slug> profile，含 `hard_floor` |
| `harness push-check --hard-floor=auto_push,force_push` | push 决策裁决（HIGH/MEDIUM/LOW） |
| `harness init` | 新项目初始化（生成 docs/、STATE.json、CLAUDE.md） |
| `harness adopt` | 现有项目接入 |
| `harness maintain` | 检查持久化文件是否与代码同步 |
| `harness scan` | 项目知识扫描 |
| `/harness-workflow --init / --adopt / --maintain / --scan` | 老命令兼容入口（仍可用） |

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

## 在 A / B 两套之间切换

`~/.claude/skills/` 同时只链一套，避免 skill 名撞名。

**切到 A 套**（纯 bash，无 node 依赖）：

```bash
# 清掉顶层 B 套 symlink
for s in harness-init profile-entry harness-quick harness-bugfix harness-feature \
         harness-refactor harness-common harness-workflow strict-reviewer \
         task-dispatcher; do rm -f ~/.claude/skills/$s; done

# 软链 A 套 (harness/ 子目录) 各 skill
for s in harness-quick harness-bugfix harness-feature harness-refactor \
         profile-entry harness-common harness-workflow profile-bootstrap; do
  ln -sf $(pwd)/harness/$s ~/.claude/skills/$s
done
~/Music/myskills/harness/setup/setup-harness.sh
```

**切到 B 套**（npm CLI 工程化）：

```bash
# 清掉 A 套 symlink，重新链顶层
for s in harness-quick harness-bugfix harness-feature harness-refactor \
         profile-entry harness-common harness-workflow profile-bootstrap; do
  rm -f ~/.claude/skills/$s
done

# 装/链 B 套
npm install -g harness-workflow-cli   # 或用 packages/harness-cli/ 本地 build
harness install
```

## 旧版完全单体备份

`harness-workflow.legacy-backup-2026-04/` 是融合前**旧版单体 harness-workflow** 的快照（archived，不再开发）。如果想回到完全的老体验：

```bash
rm ~/.claude/skills/harness-workflow
ln -s $(pwd)/harness-workflow.legacy-backup-2026-04 ~/.claude/skills/harness-workflow
```

旧版用 `/harness-workflow --init / --adopt / --maintain / --next` 命令；A/B 两套都兼容这些命令名。
