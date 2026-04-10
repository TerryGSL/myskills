---
name: team-init
description: 初始化 Agent Team 项目工作目录。生成标准 docs/ 目录结构、STATE.json 状态机、CLAUDE.md 项目规范和 DESIGN.md VI 模板。在新项目启动前必须先执行。
version: 1.0.0
---

# Team Init — 项目初始化

在当前工作目录下初始化 Agent Team 所需的完整项目结构。这是所有 team-* 技能的前置步骤。

## 触发方式

```
/team-init
/team-init "项目名称" --stack java-spring+react --desc "项目描述"
```

## 初始化流程

### Step 1: 信息收集

如果用户没有提供参数，依次询问：

1. **项目名称**（用于 STATE.json 和 CLAUDE.md 标题）
2. **技术栈**（影响 CLAUDE.md 中的规范预设）
   - 选项：`java-spring+react` / `java-spring+vue` / `node+react` / `node+vue` / `python+react` / `go+react` / `其他（自定义描述）`
3. **项目描述**（一句话，写入 STATE.json 和 CLAUDE.md）
4. **是否有 VI 规范文件**（如有，路径是什么？没有则生成默认模板）

### Step 2: 创建目录结构

```bash
mkdir -p docs/01-requirements docs/02-design docs/03-architecture docs/04-implementation docs/05-testing docs/06-security
```

### Step 3: 生成 STATE.json

在 `docs/STATE.json` 写入：

```json
{
  "project_name": "<项目名>",
  "description": "<项目描述>",
  "tech_stack": "<技术栈>",
  "created_at": "<ISO时间>",
  "current_phase": "Phase 1: Requirements",
  "active_agent": "commander",
  "status": "waiting_for_requirements",
  "phases": [
    { "id": "requirements", "name": "Phase 1: Requirements", "status": "pending", "agent": "pd", "output": "docs/01-requirements/PRD.md" },
    { "id": "design",       "name": "Phase 2: Product Design", "status": "pending", "agent": "pd", "output": "docs/02-design/DESIGN.md" },
    { "id": "architecture", "name": "Phase 3: Architecture",   "status": "pending", "agent": "architect", "output": "docs/03-architecture/ARCHITECTURE.md" },
    { "id": "implementation","name": "Phase 4: Implementation","status": "pending", "agent": "senior-dev+junior-dev", "output": "src/" },
    { "id": "testing",      "name": "Phase 5: Testing",        "status": "pending", "agent": "qa", "output": "docs/05-testing/TEST-REPORT.md" },
    { "id": "security",     "name": "Phase 6: Security Review","status": "pending", "agent": "security", "output": "docs/06-security/SECURITY-REVIEW.md" }
  ],
  "history": []
}
```

### Step 4: 生成 CLAUDE.md

根据技术栈在项目根目录生成 `CLAUDE.md`，包含以下章节：

```markdown
# CLAUDE.md — <项目名>

> 本文件是 AI Agent 的行为规范，优先级高于 Skill 中的默认配置。

## 项目概览
- **名称**: <项目名>
- **描述**: <描述>
- **技术栈**: <技术栈>
- **文档目录**: docs/

## 编码规范

### 通用
- 所有代码注释和文档使用**英文**
- 禁止硬编码配置项（数据库连接、密钥、URL）——必须通过环境变量或配置文件
- 禁止 TODO/FIXME 进入主分支，要么修，要么删
- 新建文件前先确认是否已有可复用的现有文件

### [Java 规范，如适用]
- 使用 Spring Boot 3.x + Java 17+
- 统一异常处理通过 @ControllerAdvice，禁止在 Controller 层 try-catch
- 返回值统一封装 Result<T>，不直接返回裸数据
- Service 层禁止直接依赖 HTTP 上下文
- 数据库操作统一走 Repository，禁止在 Service 中写原生 SQL（除非有性能原因且注释说明）
- 所有接口加参数校验注解（@Valid / @Validated）

### [前端规范，如适用]
- 禁止内联 style，所有样式走设计 token（参见 DESIGN.md）
- 组件禁止超过 300 行，超过则拆分
- 国际化文案统一走 i18n key，禁止硬编码中文字符串
- 异步操作统一处理 loading/error 状态

## 文件职责（禁止越权修改）
- `src/core/` — 仅架构师和老登可修改
- `docs/03-architecture/ARCHITECTURE.md` — 仅架构师可修改，接口契约一旦锁定需走审批
- `CLAUDE.md` / `DESIGN.md` — 仅指挥官可修改

## Agent 工作协议
- 每次开始工作前先读 `docs/STATE.json` 确认当前阶段
- 完成阶段工作后必须更新 `docs/STATE.json` 的对应 phase status → completed
- 跨 Agent 的信息传递通过文件，不依赖上下文记忆
- 发现前置产物有问题时，写明问题后更新 STATE.json status → blocked，并通知指挥官

## 禁止操作（Hooks 会拦截）
- `rm -rf` 任何非 `tmp/` 目录
- `DROP TABLE` / `DROP DATABASE`
- 直接 `git push --force` 到主分支
- 修改 `CLAUDE.md` 本身（除非是指挥官角色）
```

### Step 5: 生成 DESIGN.md（VI 规范）

在项目根目录生成 `DESIGN.md`（如用户未提供现有文件）：

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

### Step 6: 生成 WALKTHROUGH.md

```markdown
# WALKTHROUGH — <项目名> 进度追踪

## 当前状态
- **阶段**: Phase 1: Requirements
- **负责 Agent**: PD
- **更新时间**: <时间>

## 进度日志
| 时间 | Agent | 动作 | 结果 |
|------|-------|------|------|
| <时间> | team-init | 项目初始化 | ✅ 完成 |
```

### Step 7: 汇报完成

```
✅ 项目初始化完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
项目: <项目名>
目录: <当前路径>
技术栈: <技术栈>

生成文件:
  📁 docs/STATE.json           工作流状态机
  📁 docs/01-requirements/     需求文档目录
  📁 docs/02-design/           产品设计目录
  📁 docs/03-architecture/     架构设计目录
  📁 docs/04-implementation/   实现计划目录
  📁 docs/05-testing/          测试报告目录
  📁 docs/06-security/         安全审查目录
  📄 CLAUDE.md                 AI 行为规范
  📄 DESIGN.md                 VI 设计 Token

下一步: 运行 /team-commander 开始工作流，
        或直接运行 /team-pd 开始需求分析。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
