---
name: harness-workflow
description: >
  Harness Engineering 自治开发工作流。8-Stage 自治循环（需求分析→架构审查→规划→实现→Spec审查→质量审查→QA测试→安全审查→收尾）。
  融合 team-pd/architect/senior-dev/junior-dev/qa/security 六角色。
  支持任意技术栈（Node/Python/Go/Rust），自动探测项目环境。
  任务规模自动分级（S/M/L/XL），XL 级自动拆多轮串行执行。
  实时心跳监控，Round 完成自动输出报告。
  Use when:
  (1) 用户提出任何开发任务（"做XXX"/"加XXX"/"修XXX"/"改XXX"/"实现XXX"）
  (2) "下一轮"/"开始新round"/"继续开发"
  (3) "初始化环境"/"接入harness"/"harness-workflow --init"
  (4) "维护harness"/"同步状态"/"harness-workflow --maintain"
  (5) "工作流状态"/"当前进度"
  Triggers: /harness-workflow, /harness-workflow --init, /harness-workflow --adopt, /harness-workflow --maintain, /harness-workflow --next
---

# Harness Workflow.0 — 自治开发工作流

> `/harness-workflow --init` — 新项目初始化
> `/harness-workflow --adopt` — 现有项目接入
> `/harness-workflow --maintain` — 日常维护对齐
> `/harness-workflow --next` — 手动触发下一轮
> `/harness-workflow` — 查看当前状态 + 工作流概览

## Quick Reference

| 模式 | 做什么 | 跳过什么 |
|------|--------|---------|
| 默认（无参数） | 显示当前状态 + 工作流概览 | — |
| `--init` | Phase 1-4 全部执行（新项目） | — |
| `--adopt` | 检测已有文件，只补缺失 | 不覆盖已有内容 |
| `--maintain` | 检查持久化文件是否与代码同步 | Phase 1 全局基础设施 |
| `--skip-global` | 跳过 Phase 1 | 全局 hooks/MCP/插件 |
| `--next` | 手动启动下一轮 | Phase 1-2 |

---

## 核心原则

**Autonomous + Rigorous。** 用户说一句话，AI 自动完成全流程。

- **完全自治**：S/M 级任务全流程零介入；L/XL 级仅方向确认一次
- **8-Stage 编排**：每轮按规模激活对应 Stage
- **实时可见**：心跳轮询自动输出进度表
- **技术栈无关**：运行时自动探测，不硬编码框架

---

> **术语区分**：下文 Phase 1-4 是**一次性初始化步骤**（仅 `--init`/`--adopt` 时执行）。Round 内的开发循环使用 **Stage 0-8** 编号。两者是不同层级，不冲突。

## Phase 1: 全局基础设施

> 多个项目共享。已配置过（`~/.claude/hooks/` 存在）可跳过。

### 1.1 插件（3 个必装）

| 插件 | Marketplace | 工作流角色 |
|------|-------------|-----------|
| `claude-mem@thedotmack` | `thedotmack/claude-mem` | 每轮写 observation；新会话 mem-search 回溯 |
| `codex@openai-codex` | `openai/codex-plugin-cc` | Stage 5 跨模型 Code Review |
| `superpowers@claude-plugins-official` | Anthropic 官方 | Stage 2 规划 + Stage 3-4 审查 |

### 1.2 Hooks（7 个）

| Hook | 触发 | 用途 |
|------|------|------|
| `check-dangerous.sh` | PreToolUse(Bash) | 拦截 rm -rf / DROP TABLE / force push / reset --hard |
| `check-secrets.sh` | PreToolUse(Edit\|Write) | 拦截硬编码 API key / 密码 |
| `post-edit-reminder.sh` | PostToolUse(Edit\|Write) | 检测 inline style / 硬编码色值 |
| `pre-compact-reminder.sh` | PreCompact | 压缩前保存提醒 |
| `session-checklist.sh` | SessionStart | 会话就绪确认 |
| `session-init-prompt.txt` | SessionStart | **自动注入 harness-workflow 触发提示** |
| Notification (inline) | Notification | macOS beep 通知 |

**Hook 模板和 settings.json 完整配置** → 见 [references/hooks.md](references/hooks.md)

### 1.3 MCP

```json
{
  "mcpServers": {
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp@latest"] },
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest", "--browser", "chromium", "--headless"] }
  }
}
```

---

## Phase 2: 项目级配置

首先运行**项目探测器**，自动识别技术栈：

```
项目探测 → 写入 .harness-context.json（缓存，跨 Round 复用）
    ├─ 语言: package.json → Node/TS; pyproject.toml → Python; go.mod → Go; Cargo.toml → Rust
    ├─ 框架: next.config → Next.js; electron-vite → Electron; django → Django; gin → Gin
    ├─ 测试: vitest/jest/pytest/go test → context.testCommand
    ├─ 构建: npm run build / python -m build / go build → context.buildCommand
    └─ 已有目录结构: src/ 布局
```

**详细探测规则** → 见 [references/project-detection.md](references/project-detection.md)

然后创建持久化文件：

```bash
mkdir -p docs/superpowers/{plans,specs}
```

| 文件 | 用途 | 更新时机 |
|------|------|---------|
| `CLAUDE.md` | 项目规则、ADR、编码规范、工作流规则 | 架构变更时 |
| `docs/STATE.json` | Round 进度、pendingRounds、features、knownIssues | **每轮结束** |
| `docs/DESIGN.md` | VI 设计系统 / API 规范（按项目类型生成） | 新增 pattern 时 |
| `docs/WALKTHROUGH.md` | 操作日志 | **每轮结束** |

**各文件模板** → 见 [references/templates.md](references/templates.md)

### DESIGN.md 按项目类型

| 项目类型 | DESIGN.md 内容 |
|---------|---------------|
| 有 UI（前端/桌面/移动） | VI 系统：色彩/字体/间距/组件 token |
| 纯后端 API | API 规范：命名/版本/错误码/分页 |
| CLI 工具 | 交互规范：输出格式/颜色/进度条 |
| 库/SDK | 公共 API 设计：命名/类型/错误处理 |

### --adopt 模式

对每个持久化文件：存在 → 检查缺少章节 → 提示补充；不存在 → 从模板创建。
STATE.json 特殊：不存在时从 `git log` 反推 rounds。
WALKTHROUGH.md 如在根目录 → 移动到 `docs/`。

---

## Phase 3: 记忆与审查

1. `/codex:setup` — 验证 Codex CLI 就绪
2. 写入 claude-mem 首条 observation（项目初始化记录）
3. 创建 auto memory 索引（`MEMORY.md` + 项目/反馈 memory 文件）

**Auto Memory vs. Claude-mem 的区别和选择标准** → 见 [references/memory.md](references/memory.md)

---

## Phase 4: 验证与提交

```bash
ls CLAUDE.md docs/STATE.json docs/DESIGN.md docs/WALKTHROUGH.md
echo ".harness-status.json" >> .gitignore
echo ".harness-context.json" >> .gitignore
git add CLAUDE.md docs/ .gitignore
git commit -m "chore: initialize harness engineering environment"
```

---

## 触发保障（三层保险）

### 层级 1：SessionStart Hook（硬保障）

`session-init-prompt.txt` 每次新会话自动注入，AI 被告知必须走工作流。

### 层级 2：CLAUDE.md 规则（软保障）

CLAUDE.md 末尾有「工作流规则」段，明确要求所有开发任务通过 harness-workflow 执行。

### 层级 3：STATE.json 检测

Skill 被调用时自动检测 `docs/STATE.json`：
- 存在 → 已接入，正常执行
- 不存在 → 自动执行 `--adopt`

---

## 任务规模自动分级

用户输入后 AI 自动判断规模，**不问用户**：

| 级别 | 判断依据 | 激活 Stage |
|------|---------|-----------|
| **S** | 1-3 文件、无架构变更 | 2 → 3 → 4 → 5 → 8 |
| **M** | 新功能模块、中等复杂度 | 0 → 2 → 3 → 4 → 5 → 6 → 8 |
| **L** | 跨模块改造、新子系统 | 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 |
| **XL** | 多个独立子系统 | 自动拆为多个 Round，每轮 M/L 级 |

---

## 8-Stage 自治工作流（每一轮遵循）

```
 Round N
 ┌──────────────────────────────────────────────────────┐
 │ Stage 0  需求分析    team-pd (Sonnet)                │
 │   └→ 输出需求摘要，更新 STATE.json                    │
 │ Stage 1  架构审查    team-architect (Opus)            │
 │   └→ 输出 ADR 或 "无需变更"                           │
 │ Stage 2  规划        superpowers:writing-plans (Opus) │
 │   └→ 输出 docs/superpowers/plans/round-N.md          │
 │ Stage 3  实现        subagent-driven (Opus/Sonnet)    │
 │   └→ 写代码 + 测试 + commit                          │
 │ Stage 4  Spec 审查   spec-reviewer (Sonnet)           │
 │   └→ 不通过自动修复（最多 2 轮）                       │
 │ Stage 5  质量审查    codex + code-reviewer             │
 │   └→ Critical 自动修复（最多 3 轮）                    │
 │ Stage 6  QA 测试     team-qa (Sonnet)                 │
 │   └→ P0 bug 自动修复                                  │
 │ Stage 7  安全审查    team-security (Sonnet)            │
 │   └→ 漏洞自动修复                                     │
 │ Stage 8  收尾        Coordinator                      │
 │   └→ STATE.json + WALKTHROUGH + CLAUDE.md + mem       │
 │   └→ CronDelete + git push + 最终报告                 │
 └──────────────────────────────────────────────────────┘
```

**各 Stage 详细指南** → 见 [references/workflow.md](references/workflow.md)
**自治决策树与人工介入规则** → 见 [references/autonomy.md](references/autonomy.md)
**实时监控机制** → 见 [references/monitoring.md](references/monitoring.md)
**并行 Agent 指南** → 见 [references/parallel-agents.md](references/parallel-agents.md)

### Stage 角色 Prompt 模板

| Stage | Prompt 文件 |
|-------|------------|
| Stage 0 | [prompts/pd-prompt.md](prompts/pd-prompt.md) |
| Stage 1 | [prompts/architect-prompt.md](prompts/architect-prompt.md) |
| Stage 6 | [prompts/qa-prompt.md](prompts/qa-prompt.md) |
| Stage 7 | [prompts/security-prompt.md](prompts/security-prompt.md) |

### XL 级自动拆轮

大需求自动拆为多个 Round，写入 `STATE.json.pendingRounds`，依次串行执行。

**拆轮原则**：
- 每轮产出可独立运行和测试
- 后轮依赖前轮产出但不修改前轮代码
- 每轮 ≤ 10 个 Task

### Round 间衔接

```
Round N Stage 8 完成 → 检查 pendingRounds
    → 有 → 自动启动 Round N+1
    → 无 → 输出最终汇总报告
```

---

## Stage 8 自检清单

```
- [ ] Plan doc 在 docs/superpowers/plans/
- [ ] 编译通过 + 测试通过（命令从 .harness-context.json 读取）
- [ ] Spec Review 通过（或跳过）
- [ ] Codex Review 无 CRITICAL
- [ ] QA 测试通过（或跳过）
- [ ] Security 审查通过（或跳过）
- [ ] STATE.json 已更新
- [ ] WALKTHROUGH.md 已追加
- [ ] CLAUDE.md 已更新（如有 ADR）
- [ ] claude-mem observation 已写入
- [ ] CronDelete 已执行（如有心跳）
- [ ] .harness-status.json 已删除
- [ ] git commit + push 完成
```

---

## 维护与恢复（`--maintain` 模式）

### 同步检查

```
STATE.json.currentRound  vs  git log 实际轮次  → 是否落后？
WALKTHROUGH.md 最后条目  vs  STATE.json        → 是否一致？
CLAUDE.md ADR 数量       vs  实际架构决策       → 是否遗漏？
.harness-context.json    vs  当前 package.json  → 技术栈变了？
```

不一致 → **先同步文件，再写代码**。

### Drift Red Flags

| 想法 | 正确做法 |
|------|---------|
| "跳过 plan doc，就几个小任务" | 写。未来会话靠它恢复上下文 |
| "让测试当 reviewer" | 不行。codex 抓测试覆盖不到的盲区 |
| "STATE.json 等做完再更新" | 不行。context compress 后就忘了 |
| "直接写代码不走工作流" | 不行。SessionStart Hook 会提醒你 |

**详细恢复流程** → 见 [references/maintenance.md](references/maintenance.md)

---

## 与其他 Skill 的关系

| Skill | 工作流位置 | 何时用 |
|-------|-----------|--------|
| `team-pd` | Stage 0 | 需求分析 |
| `team-architect` | Stage 1 | 架构审查 |
| `superpowers:writing-plans` | Stage 2 | 每轮规划 |
| `superpowers:subagent-driven-development` | Stage 3 | 实现（senior/junior 并行） |
| `superpowers:requesting-code-review` | Stage 4 | Spec 审查 |
| `codex:rescue` | Stage 5 | 跨模型质量审查 |
| `team-qa` | Stage 6 | QA 测试 |
| `team-security` | Stage 7 | 安全审查 |
| `multi-agent-collab` | Stage 5（L/XL 级） | 争议点讨论 |
| `claude-mem:mem-search` | 会话开始 | 回溯之前的工作 |
| `design-systems` | Phase 2 | 生成品牌风格 DESIGN.md |
| `frontend-design` | Stage 3 | 高质量前端组件 |
| `simplify` | Stage 8 | 代码去重/质量检查 |
