# myskills

个人 Claude Code Skills 集合，核心是 **Harness Workflow** —— 一套 8-Stage 自治开发工作流。

## Harness Workflow 是什么

让 Claude Code 像一个工程团队一样自治工作：用户说一句话，AI 自动跑完「需求分析 → 架构审查 → 规划 → 实现 → Spec 审查 → 质量审查 → QA 测试 → 安全审查 → 收尾」全流程。

- **完全自治**：S/M 级任务零介入；L/XL 级仅方向确认一次
- **技术栈无关**：自动探测 Node/Python/Go/Rust 等项目环境
- **任务自动分级**：S/M/L/XL 四档，XL 自动拆多轮串行执行
- **实时心跳监控**：Round 完成自动输出报告

## Harness Workflow 相关 Skill 清单

| Skill | 角色 | 工作流位置 |
|-------|------|-----------|
| `harness-workflow` | 工作流主入口（8-Stage 编排器） | 总控 |
| `team-init` | 项目初始化（生成 docs/、STATE.json、CLAUDE.md） | 接入前 |
| `team-commander` | 统一调度入口，读取 STATE.json 调度对应 Agent | 总控 |
| `team-pd` | 产品设计师 Agent，输出 PRD/DESIGN | Stage 0 |
| `team-architect` | 系统架构师 Agent（Torvalds 风格） | Stage 1 |
| `team-senior-dev` | 资深开发（Opus，核心模块） | Stage 3 |
| `team-junior-dev` | 初级开发（Sonnet，CRUD 业务） | Stage 3 |
| `team-qa` | QA 测试工程师 Agent | Stage 6 |
| `team-security` | SDL 安全工程师 Agent | Stage 7 |

## 安装使用

### 前置依赖

- [Claude Code](https://docs.claude.com/claude-code) 已安装
- 三个必装插件：
  - `claude-mem@thedotmack` —— 跨会话记忆
  - `codex@openai-codex` —— 跨模型 Code Review
  - `superpowers@claude-plugins-official` —— Anthropic 官方 superpowers

### 第一步：克隆仓库

```bash
git clone git@github.com:TerryGSL/myskills.git ~/myskills
```

### 第二步：把 Skill 接入 Claude Code

Claude Code 会从 `~/.claude/skills/` 自动加载 Skill。把仓库里的 skill 目录链接过去即可：

```bash
mkdir -p ~/.claude/skills

# 链接 Harness Workflow 相关全部 skill
for skill in harness-workflow team-init team-commander team-pd team-architect \
             team-senior-dev team-junior-dev team-qa team-security; do
  ln -sf ~/myskills/$skill ~/.claude/skills/$skill
done
```

> 也可以用 `cp -r` 复制过去，但用 `ln -s` 后续 `git pull` 就能直接更新。

### 第三步：在你的项目里启用

进入任意一个项目目录，让 Claude Code 接入 Harness Workflow：

```
新项目： /harness-workflow --init
现有项目：/harness-workflow --adopt
```

完成后会自动生成：

```
docs/
├── STATE.json          # Round 进度、pendingRounds、knownIssues
├── DESIGN.md           # VI 设计系统 / API 规范
├── WALKTHROUGH.md      # 操作日志
└── superpowers/
    ├── plans/          # 每轮规划文档
    └── specs/          # spec 文档
CLAUDE.md               # 项目规则、ADR、编码规范
.harness-context.json   # 自动探测的技术栈缓存
```

### 第四步：开始干活

直接说你要做什么就行，Claude Code 会自动走 Harness Workflow：

```
你：帮我加一个用户登录接口
AI：[自动判断为 M 级任务] → 自动执行 Stage 0 → 1 → 2 → 3 → 4 → 5 → 6 → 8
```

常用命令：

| 命令 | 用途 |
|------|------|
| `/harness-workflow` | 查看当前状态 + 工作流概览 |
| `/harness-workflow --init` | 新项目初始化 |
| `/harness-workflow --adopt` | 现有项目接入 |
| `/harness-workflow --maintain` | 检查持久化文件是否与代码同步 |
| `/harness-workflow --next` | 手动启动下一轮 |

## 任务规模分级（自动判断）

| 级别 | 判断依据 | 激活 Stage |
|------|---------|-----------|
| **S** | 1-3 文件、无架构变更 | 2 → 3 → 4 → 5 → 8 |
| **M** | 新功能模块、中等复杂度 | 0 → 2 → 3 → 4 → 5 → 6 → 8 |
| **L** | 跨模块改造、新子系统 | 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 |
| **XL** | 多个独立子系统 | 自动拆为多个 Round 串行执行 |

## 8-Stage 工作流

```
Stage 0  需求分析    team-pd            (Sonnet)
Stage 1  架构审查    team-architect     (Opus)
Stage 2  规划        superpowers:writing-plans
Stage 3  实现        senior-dev / junior-dev 并行
Stage 4  Spec 审查   spec-reviewer
Stage 5  质量审查    codex + code-reviewer
Stage 6  QA 测试     team-qa
Stage 7  安全审查    team-security
Stage 8  收尾        STATE.json + WALKTHROUGH + commit + push
```

详细工作流说明见 [`harness-workflow/skill.md`](harness-workflow/skill.md) 和 [`harness-workflow/references/`](harness-workflow/references/)。

## 仓库目录速览

```
harness-workflow/      # 工作流主 skill + references + prompts
team-init/             # 项目初始化
team-commander/        # 调度入口
team-pd/               # 产品设计 Agent
team-architect/        # 架构师 Agent
team-senior-dev/       # 资深开发 Agent
team-junior-dev/       # 初级开发 Agent
team-qa/               # QA Agent
team-security/         # 安全 Agent
```

## 卸载

```bash
for skill in harness-workflow team-init team-commander team-pd team-architect \
             team-senior-dev team-junior-dev team-qa team-security; do
  rm ~/.claude/skills/$skill
done
```
