---
name: team-init
description: 初始化 Agent Team 项目工作目录。技术栈无关，自动从 package.json/go.mod/pyproject.toml 等探测项目类型。生成标准 docs/ 目录结构、STATE.json 状态机（harness-workflow 兼容）、CLAUDE.md 项目规范，以及按项目类型条件生成 DESIGN.md（UI 项目）或 API-SPEC.md（后端/CLI 项目）。支持 --adopt 模式接入已有项目。在新项目启动前必须先执行。
version: 2.0.0
---

# Team Init — 项目初始化

> **harness-workflow 兼容**：本 skill 在自治工作流中作为 Stage -1（预初始化）执行，为 Stage 0–8 准备目录结构和状态文件。
> 在 autonomous_mode 下，跳过所有人工暂停点，使用默认值决策。
> STATE.json 使用 统一 schema（currentRound + completedRounds[]）。
>
> **行为协议**：遵守 [protocols.md](../harness-workflow/references/protocols.md)（反谄媚 + 完成状态 + 升级协议 + 经验沉淀）。

在当前工作目录下初始化 Agent Team 所需的完整项目结构。这是所有 team-* 技能的前置步骤。

## 触发方式

```
/team-init
/team-init "项目名称" --desc "项目描述"
/team-init --adopt          # 接入已有项目，读取现有文件后补全缺失部分
/team-init --adopt --dry-run  # 仅显示将生成哪些文件，不实际写入
```

## 初始化流程

### Step 0: --adopt 模式（接入已有项目）

如果传入了 `--adopt` 参数，在做任何其他事情之前先扫描已有文件：

```
📂 扫描现有项目文件...
  ✅ docs/STATE.json          已存在，读取后合并（不覆盖）
  ✅ CLAUDE.md                已存在，跳过生成
  ⬜ docs/01-requirements/   不存在，将创建
  ⬜ DESIGN.md                不存在，将按项目类型决定是否创建
```

**合并规则**：
- `docs/STATE.json` 存在时：只补充缺失字段（如 `pendingRounds`、`scale`），不覆盖已有阶段进度
- `CLAUDE.md`、`DESIGN.md`、`API-SPEC.md` 存在时：完全跳过，不覆盖
- 目录存在时：跳过 mkdir，不影响已有文件

如果是 `--dry-run`，列出计划后直接退出，不写入任何文件。

### Step 1: 自动探测技术栈

**不询问技术栈**，优先通过文件自动探测：

| 探测文件 | 推断结论 |
|----------|----------|
| `package.json` 含 `next` | language=TypeScript, framework=Next.js, projectType=fullstack-web |
| `package.json` 含 `react` 但无 `next` | language=TypeScript, framework=React, projectType=frontend |
| `package.json` 含 `express`/`fastify`/`koa` | language=TypeScript/JavaScript, framework=Express 等, projectType=backend-api |
| `go.mod` 存在 | language=Go, framework=（读 go.mod 主包名推断 Gin/Echo/Fiber 等）, projectType=backend-api |
| `pyproject.toml` / `requirements.txt` 含 `fastapi`/`flask`/`django` | language=Python, framework=对应框架, projectType=backend-api |
| `Cargo.toml` 存在 | language=Rust, framework=（读 Cargo.toml 推断）, projectType=（cli 或 backend-api）|
| `pom.xml` / `build.gradle` 存在 | language=Java, framework=Spring Boot（如含 spring-boot-starter）, projectType=backend-api |
| 仅有 `*.sh` / `Makefile` | language=Shell, framework=N/A, projectType=cli |
| 无法探测 | 询问用户，选项：fullstack-web / backend-api / cli / library / mobile / 其他 |

探测结果写入 `.harness-context.json`（根目录），供 team-commander 和其他 team-* 技能读取：

```json
{
  "language": "<探测到的主语言>",
  "framework": "<探测到的主框架，或 N/A>",
  "projectType": "<fullstack-web | frontend | backend-api | cli | library | mobile>",
  "packageManager": "<npm | pnpm | yarn | maven | gradle | pip | go-modules | cargo | N/A>",
  "testCommand": "<探测到的测试命令，如 pnpm test / go test ./... / pytest>",
  "buildCommand": "<探测到的构建命令，如 pnpm build / go build . / mvn package>",
  "lintCommand": "<探测到的 lint 命令，如 pnpm lint / golangci-lint run / ruff check .>"
}
```

### Step 2: 信息收集（仅补充无法自动探测的信息）

如果以下信息无法自动探测，才依次询问：

1. **项目名称**（优先从 `package.json` `.name` / `go.mod` 模块名 / `pyproject.toml` `[project].name` 读取）
2. **项目描述**（优先从 `package.json` `.description` 或 `README.md` 第一段读取）
3. **是否有现有 VI 规范文件**（仅 UI 项目询问：如有，路径是什么？没有则生成默认模板）

### Step 3: 创建目录结构

根据 harness-workflow 的 8-Stage 结构创建目录（Stage 7/8 为可选，默认也创建）：

```bash
mkdir -p docs/01-requirements \
         docs/02-design \
         docs/03-architecture \
         docs/04-implementation \
         docs/05-testing \
         docs/06-security \
         docs/07-release \
         docs/08-retrospective
```

### STATE.json 兼容

当检测到 `STATE.json` 中有 `currentRound` 字段时，使用 统一 schema：
- `currentRound`: 当前轮次号
- `pendingRounds`: 待执行轮次数组
- `completedRounds`: 已完成轮次数组
- `features`: 功能状态 map
- `knownIssues`: 已知问题数组

当检测到 `current_phase` 字段时，使用旧版 schema（向后兼容）。

### Step 4: 生成 STATE.json

在 `docs/STATE.json` 写入（harness-workflow 兼容结构）：

```json
{
  "project_name": "<项目名>",
  "description": "<项目描述>",
  "tech_stack": "<language>/<framework>",
  "project_type": "<projectType>",
  "created_at": "<ISO时间>",
  "currentRound": 0,
  "current_phase": "Stage 1: Requirements",
  "active_agent": "commander",
  "status": "waiting_for_requirements",
  "pendingRounds": [],
  "scale": "medium",
  "phases": [
    { "id": "requirements",    "name": "Stage 1: Requirements",    "status": "pending", "agent": "pd",                      "output": "docs/01-requirements/PRD.md" },
    { "id": "design",          "name": "Stage 2: Product Design",  "status": "pending", "agent": "pd",                      "output": "docs/02-design/DESIGN.md" },
    { "id": "architecture",    "name": "Stage 3: Architecture",    "status": "pending", "agent": "architect",               "output": "docs/03-architecture/ARCHITECTURE.md" },
    { "id": "implementation",  "name": "Stage 4: Implementation",  "status": "pending", "agent": "senior-dev+junior-dev",   "output": "src/" },
    { "id": "testing",         "name": "Stage 5: Testing",         "status": "pending", "agent": "qa",                      "output": "docs/05-testing/TEST-REPORT.md" },
    { "id": "security",        "name": "Stage 6: Security Review", "status": "pending", "agent": "security",                "output": "docs/06-security/SECURITY-REVIEW.md" },
    { "id": "release",         "name": "Stage 7: Release",         "status": "pending", "agent": "senior-dev",              "output": "docs/07-release/CHANGELOG.md" },
    { "id": "retrospective",   "name": "Stage 8: Retrospective",   "status": "pending", "agent": "commander",               "output": "docs/08-retrospective/RETRO.md" }
  ],
  "history": []
}
```

### Step 5: 生成 CLAUDE.md

根据探测到的技术栈在项目根目录生成 `CLAUDE.md`，包含以下章节：

```markdown
# CLAUDE.md — <项目名>

> 本文件是 AI Agent 的行为规范，优先级高于 Skill 中的默认配置。

## 项目概览
- **名称**: <项目名>
- **描述**: <描述>
- **语言**: <language>
- **框架**: <framework>
- **项目类型**: <projectType>
- **文档目录**: docs/

## 编码规范

### 通用
- 所有代码注释和文档使用**英文**
- 禁止硬编码配置项（数据库连接、密钥、URL）——必须通过环境变量或配置文件
- 禁止 TODO/FIXME 进入主分支，要么修，要么删
- 新建文件前先确认是否已有可复用的现有文件

### [<language> 规范 — 按实际技术栈填充]
<!-- team-init 根据 context.language 自动填充对应规范预设，以下为示例 -->

<!-- Java 示例：-->
<!-- - 使用 Spring Boot 3.x + Java 17+ -->
<!-- - 统一异常处理通过 @ControllerAdvice，禁止在 Controller 层 try-catch -->
<!-- - 返回值统一封装 Result<T>，不直接返回裸数据 -->

<!-- Go 示例：-->
<!-- - 错误必须显式处理，禁止 _ 忽略 error -->
<!-- - 接口定义放在使用方包，不放在实现方包 -->
<!-- - 禁止 init() 产生副作用 -->

<!-- Python 示例：-->
<!-- - 使用 type hints，配合 mypy 静态检查 -->
<!-- - 禁止裸 except，必须指定异常类型 -->
<!-- - 异步代码统一使用 asyncio，禁止混用 threading -->

### [前端规范，如 projectType 包含 UI]
- 禁止内联 style，所有样式走设计 token（参见 DESIGN.md）
- 组件禁止超过 300 行，超过则拆分
- 国际化文案统一走 i18n key，禁止硬编码中文字符串
- 异步操作统一处理 loading/error 状态

## 文件职责（禁止越权修改）
- `src/core/`（或等效核心目录）— 仅架构师和老登可修改
- `docs/03-architecture/ARCHITECTURE.md` — 仅架构师可修改，接口契约一旦锁定需走审批
- `CLAUDE.md` / `DESIGN.md` / `API-SPEC.md` — 仅指挥官可修改

## Agent 工作协议
- 每次开始工作前先读 `docs/STATE.json` 确认当前阶段
- 完成阶段工作后必须更新 `docs/STATE.json` 的对应 phase status → completed
- 跨 Agent 的信息传递通过文件，不依赖上下文记忆
- 发现前置产物有问题时，写明问题后更新 STATE.json status → blocked，并通知指挥官

## 禁止操作（Hooks 会拦截）
- `rm -rf` 任何非 `tmp/` 目录
- `DROP TABLE` / `DROP DATABASE`（如适用）
- 直接 `git push --force` 到主分支
- 修改 `CLAUDE.md` 本身（除非是指挥官角色）
```

### Step 6: 条件生成设计产物

> **canonical 路径**：`docs/DESIGN.md`（全局设计系统），`docs/superpowers/specs/` 下为单轮设计产物。

**根据 `projectType` 决定生成哪种设计文档**：

#### 情况 A：UI 项目（projectType 为 `fullstack-web` / `frontend` / `mobile`）

在 `docs/DESIGN.md` 生成（如用户未提供现有文件；兼容旧路径：根目录 `DESIGN.md` 或 `docs/02-design/DESIGN.md`）：

```markdown
# DESIGN.md — Design System Tokens

> All frontend components MUST use these tokens. No hardcoded colors, spacing, or typography.

## Color Tokens
| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#1677FF` | Primary actions, links |
| `--color-primary-hover` | `#0958D9` | Hover state |
| `--color-success` | `#52C41A` | Success states |
| `--color-warning` | `#FAAD14` | Warning states |
| `--color-error` | `#FF4D4F` | Error states |
| `--color-text-primary` | `#1F2937` | Main text |
| `--color-text-secondary` | `#6B7280` | Secondary text |
| `--color-text-disabled` | `#9CA3AF` | Disabled text |
| `--color-bg-base` | `#FFFFFF` | Page background |
| `--color-bg-container` | `#F9FAFB` | Container background |
| `--color-border` | `#E5E7EB` | Borders |

## Spacing Scale (8px base grid)
| Token | Value |
|-------|-------|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-6` | `24px` |
| `--space-8` | `32px` |
| `--space-12` | `48px` |

## Typography
| Token | Value |
|-------|-------|
| `--font-size-xs` | `12px` |
| `--font-size-sm` | `14px` |
| `--font-size-base` | `16px` |
| `--font-size-lg` | `18px` |
| `--font-size-xl` | `20px` |
| `--font-size-2xl` | `24px` |
| `--font-weight-normal` | `400` |
| `--font-weight-medium` | `500` |
| `--font-weight-bold` | `600` |
| `--line-height-tight` | `1.25` |
| `--line-height-normal` | `1.5` |

## Border Radius
| Token | Value |
|-------|-------|
| `--radius-sm` | `4px` |
| `--radius-md` | `6px` |
| `--radius-lg` | `8px` |
| `--radius-xl` | `12px` |
| `--radius-full` | `9999px` |

## Shadows
| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.07)` |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` |

## Component Conventions
- **Button heights**: sm=28px, md=36px, lg=44px
- **Input heights**: sm=28px, md=36px, lg=44px
- **Table row height**: 48px (comfortable), 40px (compact)
- **Modal widths**: sm=400px, md=560px, lg=720px, xl=960px
- **Page max-width**: 1280px, padding: 24px
```

#### 情况 B：纯后端/CLI/Library 项目（projectType 为 `backend-api` / `cli` / `library`）

在 `docs/02-design/` 生成 `API-SPEC.md` 骨架（而非 DESIGN.md）：

```markdown
# API-SPEC.md — <项目名> 接口契约

> 本文件由架构师在 Stage 3 填充完整内容。PD 阶段先列出接口清单和边界。

## 接口清单（PD 阶段填写）

| 接口 | 方法 | 路径 | 描述 |
|------|------|------|------|
| 示例 | GET  | /api/v1/items | 获取列表 |

## 详细契约（架构师阶段填写）

> 每个接口包含：请求参数、响应格式、错误码、幂等性说明

## 错误码规范

| 错误码 | HTTP 状态 | 含义 |
|--------|-----------|------|
| 1000   | 400       | 请求参数错误 |
| 1001   | 401       | 未认证 |
| 1003   | 403       | 无权限 |
| 1004   | 404       | 资源不存在 |
| 5000   | 500       | 服务器内部错误 |
```

### Step 7: 生成 WALKTHROUGH.md

```markdown
# WALKTHROUGH — <项目名> 进度追踪

## 当前状态
- **阶段**: Stage 1: Requirements
- **负责 Agent**: PD
- **更新时间**: <时间>

## 进度日志
| 时间 | Agent | 动作 | 结果 |
|------|-------|------|------|
| <时间> | team-init | 项目初始化 | ✅ 完成 |
```

### Step 8: 汇报完成

```
✅ 项目初始化完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
项目: <项目名>
目录: <当前路径>
语言: <language>  框架: <framework>
项目类型: <projectType>

生成文件:
  📄 .harness-context.json         技术栈配置（供所有 team-* 技能读取）
  📁 docs/STATE.json               工作流状态机（harness-workflow 兼容）
  📁 docs/01-requirements/         需求文档目录
  📁 docs/02-design/               产品设计目录
  📁 docs/03-architecture/         架构设计目录
  📁 docs/04-implementation/       实现计划目录
  📁 docs/05-testing/              测试报告目录
  📁 docs/06-security/             安全审查目录
  📁 docs/07-release/              发布记录目录
  📁 docs/08-retrospective/        复盘目录
  📄 CLAUDE.md                     AI 行为规范
  📄 DESIGN.md                     VI 设计 Token  （仅 UI 项目）
   或
  📄 docs/02-design/API-SPEC.md    接口契约骨架    （仅后端/CLI 项目）

下一步: 运行 /team-commander 开始工作流，
        或直接运行 /team-pd 开始需求分析。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
