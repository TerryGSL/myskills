# Phase Init — 项目一次性初始化四步骤

> 本文档从 `harness-workflow/SKILL.md` 的 Phase 1-4 章节抽取整合（harness 架构重构），供所有 harness-* task-type sub-skill 共享引用。

**术语区分**：Phase 1-4 是**一次性初始化步骤**，仅在 `--init` 或 `--adopt` 时执行。Round 内的开发循环使用 Stage 0-8 编号。两者是不同层级，不冲突。

---

## 快速参考

| 模式 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|---------|---------|---------|---------|
| `--init` | 执行 | 执行 | 执行 | 执行 |
| `--adopt` | 检测已有，只补缺失 | 检测已有，只补缺失 | 合并保护，不覆盖 | 执行 |
| `--maintain` | 跳过 | 仅检查一致性 | 仅漂移检查 | 不执行 |
| `--skip-global` | 跳过 | 执行 | 执行 | 执行 |

---

## Phase 1: 全局基础设施

> 多个项目共享。已配置过（`~/.claude/hooks/` 存在）可跳过。

### 1.1 插件（3 个必装）

| 插件 | Marketplace | 工作流角色 |
|------|-------------|-----------|
| `claude-mem@thedotmack` | `thedotmack/claude-mem` | 每轮写 observation；新会话 mem-search 回溯 |
| `codex@openai-codex` | `openai/codex-plugin-cc` | Stage 5 跨模型 Code Review |
| `superpowers@claude-plugins-official` | Anthropic 官方 | Stage 2 规划 + Stage 3-4 审查 |

**安装方式**：在 Claude Code 插件市场搜索对应名称安装，或通过 `settings.json` 声明。

### 1.2 Hooks（7 个）

| Hook | 触发 | 用途 |
|------|------|------|
| `check-dangerous.sh` | PreToolUse(Bash) | 拦截 rm -rf / DROP TABLE / force push / reset --hard |
| `check-secrets.sh` | PreToolUse(Edit\|Write) | 拦截硬编码 API key / 密码 |
| `post-edit-reminder.sh` | PostToolUse(Edit\|Write) | 检测 inline style / 硬编码色值 |
| `pre-compact-reminder.sh` | PreCompact | 压缩前保存提醒 |
| `session-checklist.sh` | SessionStart | 会话就绪确认 |
| `session-init-prompt.txt` | SessionStart | 自动注入 harness 触发提示 |
| `heartbeat-check.sh` | PostToolUse(Bash\|Edit\|Write) | **强制心跳保障** — 检测 `.harness-status.json` 存在但无 `cronJobId` → 警告 Claude 立即 CronCreate |

**Hook 模板和 settings.json 完整配置** 由各子 skill 通过 `references/hooks.md` 引用（待补充）。

### 1.3 MCP

```json
{
  "mcpServers": {
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp@latest"] },
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest", "--browser", "chromium", "--headless"] }
  }
}
```

将上述配置合并到 `~/.claude/claude_desktop_config.json` 的 `mcpServers` 节点下。

---

## Phase 2: 项目级配置

### 2.1 项目探测

首先运行**项目探测器**，自动识别技术栈：

```
项目探测 → 写入 .harness-context.json（缓存，跨 Round 复用）
    ├─ 语言: package.json → Node/TS; pyproject.toml → Python; go.mod → Go; Cargo.toml → Rust
    ├─ 框架: next.config → Next.js; electron-vite → Electron; django → Django; gin → Gin
    ├─ 测试: vitest/jest/pytest/go test → context.testCommand
    ├─ 构建: npm run build / python -m build / go build → context.buildCommand
    └─ 已有目录结构: src/ 布局
```

**详细探测规则** → 见 [`project-detection.md`](project-detection.md)

### 2.2 持久化文件骨架

```bash
mkdir -p docs/superpowers/{plans,specs}
```

| 文件 | 用途 | 更新时机 |
|------|------|---------|
| `CLAUDE.md` | 项目规则、ADR、编码规范、工作流规则 | 架构变更时 |
| `docs/STATE.json` | Round 进度、pendingRounds、features、knownIssues | **每轮结束** |
| `docs/DESIGN.md` | VI 设计系统 / API 规范（按项目类型生成） | 新增 pattern 时 |
| `docs/WALKTHROUGH.md` | 操作日志 | **每轮结束** |

### 2.3 DESIGN.md 按项目类型

| 项目类型 | DESIGN.md 内容 |
|---------|---------------|
| 有 UI（前端/桌面/移动） | VI 系统：色彩/字体/间距/组件 token |
| 纯后端 API | API 规范：命名/版本/错误码/分页 |
| CLI 工具 | 交互规范：输出格式/颜色/进度条 |
| 库/SDK | 公共 API 设计：命名/类型/错误处理 |

`projectType` 由项目探测器写入 `.harness-context.json`，详见 [`project-detection.md`](project-detection.md) 的 `projectType 映射` 表。

### 2.4 --adopt 模式特殊处理

对每个持久化文件：
- 存在 → 检查缺少章节 → 提示补充
- 不存在 → 从模板创建

`STATE.json` 特殊：不存在时从 `git log` 反推 rounds。
`WALKTHROUGH.md` 如在根目录 → 移动到 `docs/`。

---

## Phase 3: 项目记忆契约初始化

> `--init` 或 `--adopt` 时执行。`--maintain` 不重跑（只做漂移检查）。

**完整 memory 契约规范** → 见 [`memory-contract.md`](memory-contract.md)

### 3.1 生成 `.harness-memory.yml`（契约锚点）

从模板渲染，填充：
- `project.name`（来源：`package.json.name` / `go.mod` / `pyproject.toml`）
- `project.type`（来源：`.harness-context.json.projectType`）
- `project.root_fingerprint`（格式：`package.json:name=<value>` 或同类锚点）

写入 `docs/memory/.harness-memory.yml`。

### 3.2 生成 `docs/memory/` 骨架

```
docs/memory/
├── .harness-memory.yml              ← 上一步生成的契约
├── MEMORY.md                        ← 渲染 {{project_name}} / {{project_description}} / {{tech_stack_oneliner}}
├── ERRORS.md                        ← 含空 harness-errors marker 块
├── cases/
│   └── README.md
├── decisions/
│   └── README.md
├── constraints/
│   └── README.md
└── archive/
    └── README.md
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

### 3.4 --adopt 合并保护

如目标项目已有 `docs/memory/`：
- 只创建**缺失**文件，**绝不覆盖用户文件**
- `MEMORY.md` / `ERRORS.md` 里只添加缺失的 `harness-memory:start` / `harness-errors:start` 标记块
- 用户已有内容保持不变

### 3.5 契约验证

初始化完成后，必须通过以下所有验证，任一失败 → **BLOCKED**，停止 `--init`，要求用户确认：

- `forbidden_paths` 非空
- `owned_paths` 无 broad unscoped 模式（不含非 `harness_` 前缀的通配符）
- YAML parse 无异常

**校验规则详情** → 见 [`memory-contract.md`](memory-contract.md) 第 2.4 节"硬约束"

### 3.6 其他初始化操作

- `/codex:setup` — 验证 Codex CLI 就绪
- 写入 claude-mem 首条 observation（记录：项目名、技术栈、接入时间）

---

## Phase 4: 验证与提交

所有初始化文件生成完毕后，执行最终验证与提交：

```bash
# 验证所有必要文件存在
ls CLAUDE.md docs/STATE.json docs/DESIGN.md docs/WALKTHROUGH.md docs/memory/.harness-memory.yml

# 将运行时文件加入 .gitignore（不提交到 git）
echo ".harness-status.json" >> .gitignore
echo ".harness-context.json" >> .gitignore

# 提交初始化产物
git add CLAUDE.md docs/ .gitignore
git commit -m "chore: initialize harness engineering environment"
```

**验证清单**：

```
- [ ] CLAUDE.md 存在且含「工作流规则」段
- [ ] docs/STATE.json 可被 JSON.parse 解析
- [ ] docs/DESIGN.md 内容与 projectType 匹配
- [ ] docs/WALKTHROUGH.md 存在
- [ ] docs/memory/.harness-memory.yml 可被 YAML 解析且字段完整
- [ ] docs/memory/MEMORY.md 含 harness marker 块
- [ ] docs/memory/ERRORS.md 含 harness-errors marker 块
- [ ] .gitignore 含 .harness-status.json 和 .harness-context.json
- [ ] git commit 成功（push 需用户确认）
```

---

## 触发保障（三层保险）

### 层级 1：SessionStart Hook（硬保障）

`session-init-prompt.txt` 每次新会话自动注入，AI 被告知必须走工作流。

### 层级 2：CLAUDE.md 规则（软保障）

CLAUDE.md 末尾有「工作流规则」段，明确要求所有开发任务通过 harness 工作流执行。

### 层级 3：STATE.json 检测

Skill 被调用时自动检测 `docs/STATE.json`：
- 存在 → 已接入，正常执行
- 不存在 → 自动执行 `--adopt`

---

## 交叉引用

- **技术栈探测细节** → [`project-detection.md`](project-detection.md)
- **Memory 契约完整规范** → [`memory-contract.md`](memory-contract.md)
- **Reviewer 集成协议** → `references/reviewer-integration.md`（待补充）
- **Hooks 完整配置** → `references/hooks.md`（待补充）
- **维护与恢复流程** → `references/maintenance.md`（待补充）
