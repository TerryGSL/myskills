---
name: harness-workflow
description: >
  Harness Engineering 完整开发工作流：环境初始化 + 6-Stage 开发循环（头脑风暴→规划→实现→Spec审查→Codex跨模型审查→收尾）+ 持久化文件维护 + drift 恢复。
  Use when: (1) starting a new project, (2) adopting an existing project, (3) asking about the development workflow or round pipeline,
  (4) maintaining/syncing persistent files (STATE.json, WALKTHROUGH.md, CLAUDE.md),
  (5) recovering from process drift, (6) user says "下一轮", "开始新round", "维护harness", "初始化环境", "工作流是什么".
  Triggers: /harness-workflow, /harness-workflow --init, /harness-workflow --adopt, /harness-workflow --maintain
---

# Harness Workflow v2.0

> `/harness-workflow --init` — 新项目初始化
> `/harness-workflow --adopt` — 现有项目接入
> `/harness-workflow --maintain` — 日常维护对齐
> `/harness-workflow` — 查看工作流概览

## Quick Reference

| 模式 | 做什么 | 跳过什么 |
|------|--------|---------|
| 默认 | Phase 1-4 全部执行 | — |
| `--adopt` | 检测已有文件，只补缺失 | 不覆盖已有内容 |
| `--maintain` | 检查持久化文件是否与代码同步 | Phase 1 全局基础设施 |
| `--skip-global` | 跳过 Phase 1 | 全局 hooks/MCP/插件 |

---

## Phase 1: 全局基础设施

> 多个项目共享。已配置过（`~/.claude/hooks/` 存在）可跳过。

### 1.1 插件（3 个必装）

| 插件 | Marketplace | 工作流角色 |
|------|-------------|-----------|
| `claude-mem@thedotmack` | `thedotmack/claude-mem` | 每轮写 observation；新会话 mem-search 回溯 |
| `codex@openai-codex` | `openai/codex-plugin-cc` | Stage 4 跨模型 Code Review |
| `superpowers@claude-plugins-official` | Anthropic 官方 | Stage 0 头脑风暴 + Stage 1 规划 |

### 1.2 Hooks（6 个）

| Hook | 触发 | 用途 |
|------|------|------|
| `check-dangerous.sh` | PreToolUse(Bash) | 拦截 rm -rf / DROP TABLE / force push / reset --hard |
| `check-secrets.sh` | PreToolUse(Edit\|Write) | 拦截硬编码 API key / 密码 |
| `post-edit-reminder.sh` | PostToolUse(Edit\|Write) | 检测 inline style / 硬编码色值 |
| `pre-compact-reminder.sh` | PreCompact | 压缩前保存提醒 |
| `session-checklist.sh` | SessionStart | 会话就绪确认 |
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

```bash
mkdir -p docs/superpowers/{plans,specs} docs/test-reports/playwright tests/e2e
```

创建以下持久化文件（用 AskUserQuestion 收集项目信息后填充）：

| 文件 | 用途 | 更新时机 |
|------|------|---------|
| `CLAUDE.md` | 项目规则、ADR、编码规范、gotchas | 架构变更时 |
| `docs/STATE.json` | Round 进度、功能清单、knownIssues | **每轮结束** |
| `docs/DESIGN.md` | VI 设计系统（色彩/字体/组件/动画） | 新增 UI pattern 时 |
| `docs/WALKTHROUGH.md` | 操作日志 | **每轮结束** |
| `playwright.config.ts` | E2E 测试 | 首次创建 |

**各文件模板和必须包含的章节** → 见 [references/templates.md](references/templates.md)

### --adopt 模式

对每个持久化文件：存在 → 检查缺少章节 → 提示补充；不存在 → 从模板创建。
STATE.json 特殊：不存在时从 `git log` 反推 rounds。

---

## Phase 3: 记忆与审查

1. `/codex:setup` — 验证 Codex CLI 就绪
2. 写入 claude-mem 首条 observation（项目初始化记录）
3. 创建 auto memory 索引（`MEMORY.md` + `project_*.md` + `feedback_*.md`）

**Auto Memory vs. Claude-mem 的区别和选择标准** → 见 [references/memory.md](references/memory.md)

---

## Phase 4: 验证与提交

```bash
ls CLAUDE.md docs/STATE.json docs/DESIGN.md docs/WALKTHROUGH.md
git add CLAUDE.md docs/ playwright.config.ts tests/e2e/
git commit -m "chore: initialize harness engineering environment"
```

---

## 6-Stage 工作流（每一轮必须遵循）

> **核心原则：Autonomous + Rigorous。** 速度来自并行，不来自跳步。

```
 Round N
 ┌──────────────────────────────────────────────────┐
 │ Stage 0  头脑风暴  /superpowers:brainstorming    │
 │   └→ 对齐需求，确认做什么 & 不做什么              │
 │ Stage 1  规划     /superpowers:writing-plans     │
 │   └→ 输出 docs/superpowers/plans/roundN.md       │
 │ Stage 2  实现     Implementer agent(s) 可并行     │
 │   └→ 写代码 + 写测试 + 自测通过 + commit          │
 │ Stage 3  Spec 审查 Spec Reviewer subagent        │
 │   └→ 对照 specs/ 检查，不符合打回 Stage 2         │
 │ Stage 4  质量审查  /codex:rescue                  │
 │   └→ 跨模型 review，CRITICAL 必须修              │
 │ Stage 5  收尾     Coordinator                    │
 │   └→ 更新 STATE.json / WALKTHROUGH.md / CLAUDE.md│
 │   └→ 写 claude-mem observation                   │
 │   └→ git commit + push                           │
 └──────────────────────────────────────────────────┘
```

**各 Stage 详细操作指南、代码质量底线、审查标准** → 见 [references/workflow.md](references/workflow.md)
**并行 Agent 开发、多终端协作、任务划分原则** → 见 [references/parallel-agents.md](references/parallel-agents.md)

### Stage 5 自检清单（round 完成前必须全部通过）

```
- [ ] Plan doc 存在于 docs/superpowers/plans/
- [ ] TypeScript 编译通过 + 所有测试通过
- [ ] Spec Review 通过（或 N/A）
- [ ] Codex Review 无 CRITICAL
- [ ] STATE.json 已更新
- [ ] WALKTHROUGH.md 已追加
- [ ] CLAUDE.md 已更新（如有 ADR）
- [ ] claude-mem observation 已写入
- [ ] git commit + push 完成
```

---

## 维护与恢复（`--maintain` 模式）

### 同步检查

```
STATE.json.currentRound  vs  git log 实际轮次  → 是否落后？
WALKTHROUGH.md 最后条目  vs  STATE.json        → 是否一致？
CLAUDE.md ADR 数量       vs  实际架构决策       → 是否遗漏？
```

不一致 → **先同步文件，再写代码**。

### Drift Red Flags

如果你在想这些话，**停下来**——你在 drift：

| 想法 | 正确做法 |
|------|---------|
| "跳过 plan doc，就几个小任务" | 写。未来会话靠它恢复上下文 |
| "让测试当 reviewer" | 不行。codex 抓测试覆盖不到的盲区 |
| "STATE.json 等做完再更新" | 不行。context compress 后就忘了 |
| "CLAUDE.md 过时了回头补" | 现在补。过时的 CLAUDE.md 误导下一个会话 |

**详细恢复流程** → 见 [references/maintenance.md](references/maintenance.md)

---

## 与其他 Skill 的关系

| Skill | 工作流位置 | 何时用 |
|-------|-----------|--------|
| `superpowers:brainstorming` | Stage 0 | 新功能/新模块启动前 |
| `superpowers:writing-plans` | Stage 1 | 每轮开始 |
| `codex:rescue` | Stage 4 | 每轮质量审查 |
| `e2e-testing` | Stage 2-3 | 前端 E2E 测试 |
| `claude-mem:mem-search` | 会话开始 | 回溯之前的工作 |
| `design-systems` | Phase 2 | 生成品牌风格 DESIGN.md |
| `frontend-design` | Stage 2 | 高质量前端组件 |
| `simplify` | Stage 5 | 代码去重/质量检查 |
