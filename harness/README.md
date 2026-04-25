# harness/ — 直接用法接入文档（Tier-3 fallback）

> 本目录是 harness 工作流的**直接 markdown 接入路径** —— 不依赖 npm CLI，纯 markdown + bash fallback。
>
> 完整规则源在仓库顶层 `harness-common/contracts/` 下的 14 份 narrative contract。本目录是 markdown-only 接入路径与历史档案。
>
> CLI 工程化路线（`harness install` 一键 setup + jest 测试 + GitHub workflow CI）参 `packages/harness-cli/README.md`。

## 1. 概览

`harness` 是 myskills 仓库的工程协作 skill 体系。整体设计：profile × task_type × aggression mode 三维正交，hard_floor 强制不可绕过；4 个 task-type leaf skill（quick / bugfix / feature / refactor）按 routing 契约派发；14 份 narrative contract 集中在仓库顶层 `harness-common/contracts/`。

**直接用法（本目录）的能力**：

- `harness/profile-bootstrap/lib/` — Tier-3 fallback 的纯 bash profile 派生算法 + test oracle
- `harness/profile-entry/references/` — profile / precedence / fast-path / task-type 历史 reference 档案
- `harness/harness-feature/prompts/` — feature scanner prompts 历史档案
- `harness/harness-workflow/specs|plans/` — 工作流历史 spec / plan 档案
- `harness/docs/` — 历史 narrative 档案

## 2. 接入步骤（无 npm 环境）

### Step 1 —— Clone + symlink

```bash
git clone --recurse-submodules git@github.com:TerryGSL/myskills.git ~/Music/myskills

mkdir -p ~/.claude/skills

# 链顶层 skill 到 ~/.claude/skills/（B 套；唯一推荐）
for skill in \
  harness-init profile-entry \
  harness-quick harness-bugfix harness-feature harness-refactor \
  harness-common harness-workflow profile-bootstrap \
  task-dispatcher strict-reviewer \
  team-pd team-architect team-senior-dev team-junior-dev team-qa team-security \
  team-init team-commander \
  investigate office-hours; do
  ln -sf ~/Music/myskills/${skill} ~/.claude/skills/${skill} 2>/dev/null || true
done

# 链接 gstack 基础 skill
ln -sf ~/Music/myskills/gstack/skills/* ~/.claude/skills/
```

### Step 2 —— 派生 profile（无 npm 用 bash fallback）

公司项目接入：

```bash
cd ~/work/acme-api
bash ~/Music/myskills/harness/profile-bootstrap/lib/derive-profile.sh acme   # Tier-3 fallback
```

会自动算 path_glob / git_remote_regex，写 `~/.claude/profiles/company-acme.yml` + repo 根 `.harness-profile`。

> 有 npm？推荐用 `harness profile-bootstrap acme` 命令（同算法，工程化封装）。

### Step 3 —— Stop Hook 注册

```bash
# Claude Code 内执行 /update-config，把 hooks/context-monitor.sh 注册为 Stop Hook
```

阈值按 task_type 自适应（quick: 80/90 / bugfix: 70/85 / feature/refactor: 60/80），无需手动调整。

## 3. 14 narrative contract

完整规则在 `harness-common/contracts/`（仓库顶层），按能力分文件：

| Contract | 说明 |
|----------|------|
| `profile.md` | profile schema、matcher 算法、bootstrap 派生 |
| `routing.md` | task_type 派发 + tie-break |
| `task-type.md` | 4 task-type 输入契约 |
| `push-decision.md` | HIGH/MEDIUM/LOW 三档裁决 |
| `hard-floor-enforcement.md` | flag 不可绕过 |
| `aggression-mode.md` | conservative / standard / aggressive |
| `autonomy.md` | 用户介入边界 |
| `drift.md` | managed file 漂移检测 |
| `memory.md` | 三层 memory 写入权限 |
| `knowledge.md` | Stage -0.5 知识检索 |
| `reviewer-gates.md` | 4 硬门审稿 |
| `phase-init.md` | init / adopt / maintain |
| `hooks.md` | Stop Hook 自适应阈值 |
| `doctor-protocol.md` | 诊断输出契约 |

> **Source of truth**：每份 contract 顶部都标注其代码 / schema 来源（`packages/harness-cli/src/types/constants.ts` + `resources/schemas/*.schema.json`）。如本文档与代码不一致，以代码为准。

## 4. 日常使用

### 4.1 最简流程

正常情况下，用户只需直接说需求，框架自动完成路由：

```
你：帮我加个用户登录接口

→ task-dispatcher   外层分解，识别为代码任务
→ harness route     探测当前项目 profile + task_type + mode
                    git diff 无改动，无 /fix /refactor flag → task_type = feature
→ harness-feature   加载 8-Stage 主体
→ Stage -0.5        读 knowledge INDEX，注入 Binding Rules
→ Stage 0~8         完整走通
```

无 npm 环境用 `profile-entry/SKILL.md`（顶层）作为 markdown router 兜底。

### 4.2 显式 flags

| Flag | 效果 |
|------|------|
| `/quick` | 强制走 `harness-quick` fast-path |
| `/fix` | 走 `harness-bugfix`（investigate → reproduce → fix） |
| `/refactor` | 走 `harness-refactor`（baseline → 增量 → verify） |
| `/yolo` | aggressive mode（受 profile `hard_floor` 约束） |
| `/safe` | conservative mode（强制手动确认每步） |

**Precedence 铁律**：`profile hard_floor > 调用 flag > profile default > conservative`。

### 4.3 老命令兼容

| 命令 | 效果 |
|------|------|
| `/harness-workflow --init` | 新项目初始化 |
| `/harness-workflow --adopt` | 现有项目接入 |
| `/harness-workflow --maintain` | 周期性健康审计 |
| `/harness-workflow --scan` | 5-phase knowledge scan |

### 4.4 push 决策（自动 risk-based）

leaf skill 在 commit 之后会自动按 `push-decision` 契约评估 risk，详 `harness-common/contracts/push-decision.md`。

## 5. 各 Skill 职责速查

| Skill | 角色 | 何时触发 |
|-------|------|---------|
| `task-dispatcher` | 外层任务分解 | 每条用户消息 |
| `profile-entry` | Tier-3 fallback router（markdown 解析） | 无 npm CLI 时兜底 |
| `harness-quick` | 1 文件 / < 10 行 fast-path | fast-path 命中 / `/quick` flag |
| `harness-bugfix` | investigate → reproduce → fix → 回归 | `/fix` flag |
| `harness-feature` | 完整 8-Stage 主体 | profile 默认路由 |
| `harness-refactor` | baseline → 增量 → verify | `/refactor` flag |
| `harness-common` | 14 contracts 集合 | 各 sub-skill 引用 |
| `strict-reviewer` | 4 硬门审稿 | Stage 4/5/6/7 自动调用 |
| `harness-workflow` | 老命令 passthrough | 用户用老命令时 |
| `team-pd / team-architect / team-{senior,junior}-dev / team-qa / team-security` | 各角色 subagent | Stage 0~7 |
| `investigate` | 调试方法论 | `harness-bugfix` Step 1 |
| `office-hours` | 需求诊断教练 | Stage 0 前置 |

## 6. 目录结构

```
harness/
├── profile-bootstrap/lib/    Tier-3 fallback bash 算法 + test oracle（保留）
├── profile-entry/references/ Profile / precedence / fast-path 历史档案
├── harness-common/contracts/ 14 narrative contract 的本地副本（如有）
├── harness-feature/prompts/  Feature scanner prompts 档案
├── harness-workflow/         specs/ + plans/ 历史档案
├── docs/                     历史 narrative 档案
├── README.md                 本文档
└── DESIGN.md                 早期设计思路（archived）
```

> **保留原则**：`profile-bootstrap/lib/` 是活的（Tier-3 fallback bash + oracle）；其余目录是历史档案。
> 完整规则源在仓库顶层 `harness-common/contracts/`，这里只做接入入口和历史档案。

## 7. 故障排除

### Skill 不加载

检查 symlink 是否存在且指向正确目标：

```bash
ls -la ~/.claude/skills/profile-entry
ls -la ~/.claude/skills/harness-feature
```

若是死链，重新执行 Step 1 的 `ln -sf` 命令。

### Profile 探测不对

1. 在项目根目录手动创建 marker：`echo "harness" > .harness-profile`
2. 检查 `~/.claude/profiles/` 下的 YAML 文件是否存在：`ls ~/.claude/profiles/`
3. 检查 YAML 中 `detection.matchers` 是否覆盖当前项目路径

### Knowledge 不生效

1. 确认 `docs/harness/knowledge/INDEX.md` 存在
2. 检查项目 `CLAUDE.md` 中无 `harness-knowledge: disabled` 标记
3. 若 INDEX.md 存在但 Stage -0.5 跳过，检查 `.harness-status.json` 里 `knowledgeCheck.effective_index_status` 字段值

## 8. 参考文档

| 文档 | 说明 |
|------|------|
| `harness-common/contracts/` | 14 份 narrative contract |
| `docs/superpowers/specs/2026-04-26-unified-fusion-design.md` | 当前架构 spec |
| `docs/superpowers/plans/2026-04-26-unified-fusion-implementation.md` | 实施计划 |
| `packages/harness-cli/README.md` | CLI 详细命令文档 |
| `harness/DESIGN.md` | 早期设计思路 |

---

*完整规则源 = 仓库顶层 `harness-common/contracts/` 下的 14 份 narrative contract。本目录是 markdown-only 接入路径 + Tier-3 fallback + 历史档案。*
