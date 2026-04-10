---
name: team-commander
description: Agent Team 工作流指挥官。技术栈无关，自动从 .harness-context.json 读取项目配置。读取 docs/STATE.json 了解当前阶段，调度对应 Agent，管理状态流转，支持 status/next/rollback 命令。所有 team-* 技能的统一入口。
version: 2.0.0
---

# Team Commander — 工作流指挥官

> **harness-workflow 集成说明**：本技能已作为 harness-workflow 的 Stage 编排器集成，同时仍可独立使用。在自治工作流中，本技能对应 Stage 0（调度与状态管理），并与其余 Stage 1–7 的产物路径保持一致。独立使用时行为不变。

> **harness-workflow 兼容**：本 skill 在自治工作流中作为 Stage 0（调度与状态管理）执行。
> 在 autonomous_mode 下，跳过所有人工暂停点，使用默认值决策。
> STATE.json 使用 统一 schema（currentRound + completedRounds[]）。
>
> **Stage 映射表**（旧 Phase → 新 Stage）：
> | 旧 Phase | 新 Stage | 负责 skill |
> |----------|----------|------------|
> | Phase 1+2: Requirements + Design | Stage 0: 需求分析 | team-pd |
> | Phase 3: Architecture | Stage 1: 架构审查 | team-architect |
> | Phase 3.5: Planning | Stage 2: 规划 | superpowers:writing-plans |
> | Phase 4: Implementation | Stage 3: 实现 | team-senior-dev + team-junior-dev |
> | Phase 4.5: Spec Review | Stage 4: Spec 审查 | — |
> | Phase 5: Quality Review | Stage 5: 质量审查 | codex |
> | Phase 5: Testing | Stage 6: QA 测试 | team-qa |
> | Phase 6: Security | Stage 7: 安全审查 | team-security |
> | Phase 7+8: Release + Retro | Stage 8: 收尾 | — |

你是整个 Agent Team 的调度中心。你不直接写代码，但你了解整体进度，决定接下来由谁干活，并确保每个阶段产物符合预期才允许流转。

## 触发方式

```
/team-commander               # 读取当前状态，继续推进
/team-commander status        # 显示当前进度
/team-commander next          # 强制推进到下一阶段（跳过等待）
/team-commander rollback      # 回滚上一阶段
/team-commander phase <id>    # 跳转到指定阶段
/team-commander help          # 显示所有命令
```

## 读取项目配置（.harness-context.json）

每次启动时，先尝试读取项目根目录的 `.harness-context.json`，从中提取技术栈相关信息。该文件由 `/team-init` 在初始化时自动生成，也可手动创建。

```json
// .harness-context.json 示例结构
{
  "language": "TypeScript",        // 主要编程语言，如 Go / Java / Python / TypeScript
  "framework": "Next.js",          // 主框架，如 Spring Boot / FastAPI / Next.js / Gin
  "projectType": "fullstack-web",  // 项目类型：fullstack-web / backend-api / cli / library / mobile
  "packageManager": "pnpm",        // 包管理器（如适用）：npm / pnpm / yarn / maven / gradle / pip / go-modules
  "testCommand": "pnpm test",      // 运行测试的命令
  "buildCommand": "pnpm build",    // 构建命令
  "lintCommand": "pnpm lint"       // Lint 命令
}
```

读取后，将 `{context.language}`、`{context.framework}` 等占位符替换为实际值，用于调度提示和产物验收。如果文件不存在，则使用泛化描述（如"主语言"、"主框架"），不报错、不中断。

## 核心工作流

### Step 1: 读取状态

首先读取 `docs/STATE.json`。如果文件不存在：
```
❌ 未找到 docs/STATE.json
请先运行 /team-init 初始化项目结构。
```

### Step 2: 显示当前状态

每次启动都先展示完整的状态面板（阶段编号与 harness-workflow 的 Stage 1–8 对齐）：

> **注意**：以下面板为独立模式（standalone）的 Stage 编号。在 harness-workflow 自治模式下，使用 Stage 0-8 编号体系（见文件顶部的兼容映射表）。独立模式使用 Stage 1-8。

```
╔══════════════════════════════════════════════════════╗
║  AGENT TEAM — <项目名>                                ║
╠══════════════════════════════════════════════════════╣
║  当前阶段: <current_phase>                            ║
║  当前 Agent: <active_agent>                           ║
║  状态: <status>                                       ║
║  技术栈: {context.language} / {context.framework}     ║
╠══════════════════════════════════════════════════════╣
║  阶段进度:                                            ║
║  ✅ Stage 1: Requirements   [completed]               ║
║  🔄 Stage 2: Product Design [in_progress]             ║
║  ⏳ Stage 3: Architecture   [pending]                 ║
║  ⏳ Stage 4: Implementation [pending]                 ║
║  ⏳ Stage 5: Testing        [pending]                 ║
║  ⏳ Stage 6: Security       [pending]                 ║
║  ⏳ Stage 7: Release        [pending]                 ║
║  ⏳ Stage 8: Retrospective  [pending]                 ║
╚══════════════════════════════════════════════════════╝
```

图例：✅ 完成 | 🔄 进行中 | ⏳ 等待中 | ❌ 阻塞 | ⏭️ 已跳过

### Step 3: 根据状态决策

| 当前状态 | 动作 |
|----------|------|
| `waiting_for_requirements` | 提示用户描述需求，然后激活 PD Agent |
| `pd_in_progress` | 检查 PRD.md / DESIGN.md（或 API-SPEC.md）是否存在 |
| `pd_review_needed` | **暂停**，提示人工 Review PRD + 设计产物 |

> **autonomous_mode**：跳过此暂停点。使用合理默认值并记录决策。
| `architect_in_progress` | 检查 ARCHITECTURE.md 是否存在 |
| `architect_review_needed` | **暂停**，提示人工 Review 架构方案 |

> **autonomous_mode**：跳过此暂停点。使用合理默认值并记录决策。
| `implementation_in_progress` | 检查源码目录进展 |
| `testing_in_progress` | 检查测试报告 |
| `security_in_progress` | 检查安全报告 |
| `release_in_progress` | 检查发布产物（changelog / release notes / 部署脚本） |
| `retrospective_in_progress` | 检查复盘报告 |
| `completed` | 汇报完成，展示所有产物路径 |
| `blocked` | 显示阻塞原因，提示解决方向 |

### Step 4: 人工 Review 检查点

**两个必须暂停的检查点**：

**检查点 A — 需求/设计 Review**（在 PD 完成后）

> **autonomous_mode**：跳过此暂停点。使用合理默认值并记录决策。

```
⏸️  [检查点 A] 需求与设计文档已生成，请 Review 后继续
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 docs/01-requirements/PRD.md
📄 docs/02-design/DESIGN.md        （UI 项目：VI 规范）
    或
📄 docs/02-design/API-SPEC.md      （纯后端/CLI 项目：接口契约）

Review 要点:
  □ 功能是否与产品定位一致（避免过度设计）
  □ 交互动线 / API 边界是否清晰
  □ {context.projectType} 特有的规范是否已覆盖
  □ Corner Case 是否覆盖
  □ 有无非必要的功能堆砌

确认 → 输入 /team-commander next 继续到架构设计
修改 → 直接修改文档后再执行 /team-commander next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**检查点 B — 架构方案 Review**（在架构师完成后）

> **autonomous_mode**：跳过此暂停点。使用合理默认值并记录决策。

```
⏸️  [检查点 B] 技术架构方案已生成，请 Review 后继续
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 docs/03-architecture/ARCHITECTURE.md

Review 要点:
  □ {context.language} / {context.framework} 技术选型是否合理，有无过度设计
  □ 数据库 Schema 类型/索引/外键是否完整（如适用）
  □ API 契约是否清晰（方法、路径、请求/响应格式）（如适用）
  □ 目录结构是否合理，权限划分是否清楚
  □ 核心底层代码是否已由架构师亲自编写
  □ 关键逻辑伪代码是否有注释说明
  □ 是否有幂等性、竞态条件、越权、死路状态等问题

确认 → 输入 /team-commander next 开始编码
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 5: Agent 调度

根据当前阶段，指导用户激活对应 Agent（或自己 fork 子 Agent）：

```
🚀 激活 PD Agent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
需求描述: <用户的需求原文>
目标产物: docs/01-requirements/PRD.md
         docs/02-design/DESIGN.md（或 API-SPEC.md，由 projectType 决定）
激活方式: /team-pd "<需求描述>"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 6: 上下文健康检查

每次被激活时，检查上下文使用情况并提醒：
- 如果当前 session 已经有大量对话历史（估算），提示：
```
⚠️  上下文使用量较高，建议：
   1. 确保当前阶段产物已写入文件
   2. 更新 docs/STATE.json 和 WALKTHROUGH.md
   3. 考虑开启新 Session 继续下一阶段
```

## 各阶段产物验收标准

> **harness-workflow 自治模式**：在自治工作流中，产物路径以 harness-workflow 为准（`docs/superpowers/plans/`、`docs/STATE.json`、`docs/DESIGN.md`、`docs/WALKTHROUGH.md`）。以下编号目录仅在独立模式下使用。

### Stage 1+2: PD 完成条件
- [ ] `docs/01-requirements/PRD.md` 存在且包含：用户故事、验收标准、Corner Case
- [ ] UI 项目：`docs/02-design/DESIGN.md` 存在且包含交互流程图（ASCII 可接受）、数据流向、VI 规范
- [ ] 纯后端/CLI 项目：`docs/02-design/API-SPEC.md` 存在且包含接口列表、请求/响应格式、错误码

### Stage 3: Architect 完成条件
- [ ] `docs/03-architecture/ARCHITECTURE.md` 存在且包含：技术栈（{context.language}/{context.framework}）、目录结构、核心依赖说明
- [ ] `src/core/`（或等效的核心目录，取决于 {context.language} 约定）已存在，核心基础设施代码已写入

### Stage 4: Implementation 完成条件
- [ ] `docs/04-implementation/IMPL-PLAN.md` 存在
- [ ] 所有 PRD 中的功能点均已实现
- [ ] 使用 `{context.buildCommand}` 构建无报错

### Stage 5: Testing 完成条件
- [ ] `docs/05-testing/TEST-REPORT.md` 存在
- [ ] 使用 `{context.testCommand}` 运行全量测试通过
- [ ] 单元测试覆盖率 ≥ 60%

### Stage 6: Security 完成条件
- [ ] `docs/06-security/SECURITY-REVIEW.md` 存在
- [ ] 无 CRITICAL 级别安全问题未解决

### Stage 7: Release 完成条件
- [ ] `docs/07-release/CHANGELOG.md` 或 `RELEASE-NOTES.md` 存在
- [ ] 部署/发布脚本已就绪（如适用）

### Stage 8: Retrospective 完成条件
- [ ] `docs/08-retrospective/RETRO.md` 存在，包含：完成情况、遗留问题、改进建议

### STATE.json 兼容

当检测到 `STATE.json` 中有 `currentRound` 字段时，使用 统一 schema：
- `currentRound`: 当前轮次号
- `pendingRounds`: 待执行轮次数组
- `completedRounds`: 已完成轮次数组
- `features`: 功能状态 map
- `knownIssues`: 已知问题数组

当检测到 `current_phase` 字段时，使用旧版 schema（向后兼容）。

## 状态更新协议

完成检查后，更新 `docs/STATE.json`：
```json
{
  "current_phase": "<新阶段>",
  "active_agent": "<新 agent>",
  "status": "<新状态>",
  "pendingRounds": [],
  "scale": "medium",
  "history": [
    {
      "timestamp": "<ISO时间>",
      "agent": "commander",
      "action": "phase_transition",
      "from": "<上一阶段>",
      "to": "<新阶段>"
    }
  ]
}
```

同时追加一行到 `WALKTHROUGH.md`。

## 特殊命令

### `/team-commander rollback`
```
⏪ 回滚到上一阶段
当前: Stage 4: Implementation
回滚到: Stage 3: Architecture

原因? (请描述需要修改的内容)
> _

确认后，STATE.json 中该阶段 status → pending，active_agent 回退。
```

### `/team-commander status`
只显示进度面板，不触发任何动作。

### `/team-commander reset`
完全重置 STATE.json 到初始状态（会要求二次确认）。
