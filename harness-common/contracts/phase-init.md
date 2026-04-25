# Phase Init — Phase 1-4 项目初始化 vs Round Stage 0-8

> **Source of truth**: `packages/harness-cli/src/types/constants.ts` + `resources/schemas/doctor-protocol.schema.json`。如本文档与代码不一致，以代码为准。

定义两种**不同层级**的编号：Phase 1-4 是项目一次性初始化；Stage 0-8 是 Round 内开发循环。两者不冲突、不混用。

## 术语区分

| 编号 | 范围 | 触发 | 频次 |
|------|------|------|------|
| **Phase 1-4** | 项目级一次性初始化 | `harness init` / `harness adopt` | 每个项目一次 |
| **Stage -0.5 / 0-8** | Round 内开发循环 | leaf skill 执行 | 每个 round 一次 |

Stage 详细语义见各 leaf skill 的 SKILL.md（quick / bugfix / feature / refactor）。本契约只覆盖 Phase 1-4。

## 快速参考

| 模式 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|---------|---------|---------|---------|
| `harness init` | 执行 | 执行 | 执行 | 执行 |
| `harness adopt` | 检测已有，只补缺失 | 检测已有，只补缺失 | 合并保护，不覆盖 | 执行 |
| `harness maintain` | 跳过 | 仅检查一致性 | 仅漂移检查 | 不执行 |
| `--skip-global` | 跳过 | 执行 | 执行 | 执行 |

## Phase 1: 全局基础设施

> 多个项目共享。已配置过可跳过。

### 1.1 工具集成（每个 wrapper 自管）

各工具 wrapper 自己管理插件 / SDK 接入：

- 工具的 cross-session memory 能力（如对话历史 / 项目记忆）→ 工具 wrapper
- 跨模型代码审查（codex / 其它 review CLI）→ 各工具 wrapper
- skill 注册 / 自动加载 → 各工具 wrapper

本契约**不规定**具体工具，只规定能力契约（项目级 memory `docs/memory/*` 必需，跨会话能力可选）。

### 1.2 Hooks

跨工具的 hook 模板见 [hooks.md](hooks.md)（context-monitor / heartbeat-check / 安全拦截）。各工具 wrapper 自己注册 hook 到对应配置文件。

### 1.3 MCP / 外部服务

工具自管。harness 不依赖任何特定 MCP server。

## Phase 2: 项目级配置

### 2.1 项目探测

运行项目探测器，自动识别技术栈：

```
项目探测 → 写入 .harness-context.json（缓存，跨 Round 复用）
    ├─ 语言: package.json → Node/TS; pyproject.toml → Python; go.mod → Go; Cargo.toml → Rust
    ├─ 框架: next.config → Next.js; electron-vite → Electron; django → Django; gin → Gin
    ├─ 测试: vitest/jest/pytest/go test → context.testCommand
    ├─ 构建: npm run build / python -m build / go build → context.buildCommand
    └─ 已有目录结构: src/ 布局
```

### 2.2 持久化文件骨架

```bash
mkdir -p docs/superpowers/{plans,specs}
```

| 文件 | 用途 | 更新时机 |
|------|------|---------|
| `CLAUDE.md`（或工具同义入口） | 项目规则、ADR、编码规范、工作流规则 | 架构变更时 |
| `docs/STATE.json` | Round 进度、pendingRounds、features、knownIssues | **每轮结束** |
| `docs/DESIGN.md` | VI 设计系统 / API 规范（按项目类型生成） | 新增 pattern 时 |
| `docs/WALKTHROUGH.md` | 操作日志 | **每轮结束** |

### 2.3 DESIGN.md 按项目类型

| 项目类型 | DESIGN.md 内容 |
|---------|---------------|
| 有 UI（前端 / 桌面 / 移动） | VI 系统：色彩 / 字体 / 间距 / 组件 token |
| 纯后端 API | API 规范：命名 / 版本 / 错误码 / 分页 |
| CLI 工具 | 交互规范：输出格式 / 颜色 / 进度条 |
| 库 / SDK | 公共 API 设计：命名 / 类型 / 错误处理 |

`projectType` 由项目探测器写入 `.harness-context.json`。

### 2.4 adopt 模式特殊处理

对每个持久化文件：

- 存在 → 检查缺少章节 → 提示补充
- 不存在 → 从模板创建

`STATE.json` 特殊：不存在时从 `git log` 反推 rounds。

## Phase 3: 项目记忆契约初始化

完整 memory 契约规范见 [memory.md](memory.md)。

### 3.1 生成 `.harness-memory.yml`（契约锚点）

从模板渲染：

- `project.name`（来源：`package.json.name` / `go.mod` / `pyproject.toml`）
- `project.type`（来源：`.harness-context.json.projectType`）
- `project.root_fingerprint`

写入 `docs/memory/.harness-memory.yml`。

### 3.2 生成 `docs/memory/` 骨架

```
docs/memory/
├── .harness-memory.yml             ← 上一步生成的契约
├── MEMORY.md                       ← 渲染 {{project_name}} / {{tech_stack_oneliner}}
├── ERRORS.md                       ← 含空 harness-errors marker 块
├── cases/README.md
├── decisions/README.md
├── constraints/README.md
└── archive/README.md
```

### 3.3 初始化评分卡

```yaml
# docs/memory/harness_reviewer_scorecard.yml
schema_version: "1.0.0"
totals:
  total_reviews: 0
  pass_count: 0
  fail_count: 0
  blocked_count: 0
reviews: []
false_pass_incidents: []
```

### 3.4 adopt 合并保护

如目标项目已有 `docs/memory/`：

- 只创建**缺失**文件，**绝不覆盖用户文件**
- `MEMORY.md` / `ERRORS.md` 只添加缺失的 harness marker 块
- 用户已有内容保持不变

### 3.5 契约验证（任一失败 → BLOCKED）

- `forbidden_paths` 非空
- `owned_paths` 无 broad unscoped 模式
- YAML parse 无异常

详见 [memory.md](memory.md) 的"硬约束"章节。

## Phase 4: 验证与提交

```bash
# 验证所有必要文件存在
ls CLAUDE.md docs/STATE.json docs/DESIGN.md docs/WALKTHROUGH.md docs/memory/.harness-memory.yml

# 将运行时文件加入 .gitignore
echo ".harness-status.json" >> .gitignore
echo ".harness-context.json" >> .gitignore

# 提交初始化产物
git add CLAUDE.md docs/ .gitignore
git commit -m "chore: initialize harness engineering environment"
```

### 验证清单

```
- [ ] CLAUDE.md（或同义入口）存在且含「工作流规则」段
- [ ] docs/STATE.json 可被 JSON.parse 解析
- [ ] docs/DESIGN.md 内容与 projectType 匹配
- [ ] docs/WALKTHROUGH.md 存在
- [ ] docs/memory/.harness-memory.yml 可被 YAML 解析且字段完整
- [ ] docs/memory/MEMORY.md 含 harness marker 块
- [ ] docs/memory/ERRORS.md 含 harness-errors marker 块
- [ ] .gitignore 含 .harness-status.json 和 .harness-context.json
- [ ] git commit 成功（push 需用户确认）
```

## install / doctor handshake

`harness install --doctor` 在 Phase 1 之前自检：

- 检查 CLI 已装（`harness --version`）
- 检查 schema 版本兼容
- 详见 [doctor-protocol.md](doctor-protocol.md) 双向哨兵

`harness doctor --json` 在每个 Round 开始前用，确认项目健康（memory 树 / managed-files / schema）。

## 触发保障（三层保险）

跨工具通用：

1. **会话起点 hook**（硬保障） — 工具新会话注入 reminder，告知必须走 harness 工作流
2. **项目入口文件规则**（软保障） — `CLAUDE.md`（或同义入口）的「工作流规则」段
3. **STATE.json 检测** — Skill 被调用时检测 `docs/STATE.json`：存在 → 已接入；不存在 → 自动 `harness adopt`

## 实现位置

- 探测：`packages/harness-cli/src/utils/detect.ts`
- 模板：`packages/harness-cli/resources/templates/`
- init 命令：`packages/harness-cli/src/commands/init.ts`
- adopt 命令：`packages/harness-cli/src/commands/adopt.ts`
- maintain 命令：`packages/harness-cli/src/commands/maintain.ts`
