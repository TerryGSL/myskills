---
name: harness-init
description: >
  Harness 工作流的初始化入口 skill。技术栈无关，探测项目类型，通过 harness-workflow-cli
  完成确定性文件生成。AI 负责探测 / 对话 / 决策；CLI 负责幂等写文件。
  本 skill 是 harness 体系对外的唯一入口 skill —— 外部用户只需装它 + 可用的 CLI
  （npm install 或 clone 本地 build 或无 CLI 手工 fallback 三选一），就能在任何项目
  接入 harness 工作流。
  使用场景：用户说"接入 harness / 初始化 harness / 扫描项目约定 / harness 没装 /
  harness 工作流 / 装 harness / 起 harness"时触发；新项目 + 已有项目都可。
  触发命令：无斜杠命令；AI 监听触发词自动调用。
---

# harness-init — 项目初始化入口

## 第一步：全局依赖预检

在跑 CLI 之前，先确认 harness 工作流所需的全局基础设施就位。缺失的项目级以上依赖
CLI 也修不了（它只管项目内文件），必须提示用户先装。

### 必须就位的全局依赖

| 依赖 | 检查方式 | 缺失时 |
|------|---------|-------|
| `claude-mem@thedotmack` 插件 | `ls ~/.claude/plugins/claude-mem 2>/dev/null` | 通过 Claude Code marketplace 安装 |
| `codex@openai-codex` 插件 | `ls ~/.claude/plugins/cache/openai-codex 2>/dev/null` | 同上（可选；Stage 5 跨模型审查用）|
| `superpowers@claude-plugins-official` 插件 | `ls ~/.claude/plugins/cache/claude-plugins-official 2>/dev/null` | 同上（Stage 2 writing-plans + Stage 3-4 审查） |
| MCP: `context7` | `grep context7 ~/.claude/mcp.json` | 加到 `~/.claude/mcp.json` |
| MCP: `playwright` | `grep playwright ~/.claude/mcp.json` | 同上（前端 QA 用） |
| 7 hooks | `ls ~/.claude/hooks/` | 见 `harness-workflow/references/hooks.md` 完整 settings.json + 7 脚本模板 |
| `/codex:setup` 验证 Codex CLI | `node "/Users/<you>/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs" setup --json` | 验证 Codex CLI + 登录就绪（用于 Stage 5 跨模型审稿） |

三大插件 + 2 MCP + 7 hooks + Codex setup 是 harness 工作流的**全局基础**，每个用户只配一次，跨项目共享。

**完整安装说明 + hook 脚本模板** → `harness-workflow/references/hooks.md`

## 第二步：CLI 探测（三级降级）

### Tier 1（推荐）：全局 npm 安装

```bash
npm install -g harness-workflow-cli
```

### Tier 2：从 myskills clone 本地构建（不依赖 npm registry）

```bash
cd <myskills-clone>
npm install                                   # monorepo 根装 workspace deps
cd packages/harness-cli
npm run build                                  # 产出 dist/cli.js
# 三选一加 PATH
ln -sf $PWD/bin/cli.js /usr/local/bin/harness
npm link
alias harness="node $PWD/bin/cli.js"
```

### Tier 3：完全无 CLI（应急 / 断网 / 无 node）

AI 手工读取 bundled templates 并逐一 Edit/Write 到目标项目：

```
读取源目录：<myskills-clone>/packages/harness-cli/resources/
投放映射（完整清单）：
  templates/root/CLAUDE.md.template          → <target>/CLAUDE.md
  templates/root/harness.config.json.template → <target>/harness.config.json
  templates/root/STATE.json.template          → <target>/docs/STATE.json
  templates/root/WALKTHROUGH.md.template      → <target>/docs/WALKTHROUGH.md
  templates/root/DESIGN.md.template           → <target>/docs/DESIGN.md
  templates/memory/*.template                 → <target>/docs/memory/<对应文件>
  templates/learnings/*.template              → <target>/.harness/learnings/<对应文件>
  templates/knowledge/INDEX.md.template       → <target>/docs/harness/knowledge/INDEX.md
  templates/knowledge/TODO.md.template        → <target>/docs/harness/knowledge/TODO.md
  templates/knowledge/<5 domains>/*.md.template → <target>/docs/harness/knowledge/<同路径>
  （company-mt 额外：presets/company-mt/skills/company-*/SKILL.md + references/*.md 按 spec §7.3 投放）

占位符替换：{{project_name}} / {{project_type}} / {{today}} / {{profile_name}} / {{profile_resolved_by}}
额外手工：
  - 写 <target>/.harness-profile（YAML: profile / resolved_by / updated_at）
  - 写 <target>/.harness/current.json（含 workflow_schema_version: "1.0.0"）
  - 写 <target>/.harness-context.json（按项目探测结果填 buildCommand / testCommand / lintCommand）
  - 往 <target>/.gitignore 追加 .harness-context.json / .harness/current.json / .harness/managed-files.json
```

**Tier 3 代价**：
- 无 ManagedFileRecord 双 hash 追踪 → 后续 `harness maintain --upgrade` 无法跑
- 无 `harness doctor` 健康检查 → schema 版本哨兵失效
- 无 `harness scan` 扫描 pipeline → Spec 1 knowledge scanner 不可用

建议尽快升到 Tier 1 或 Tier 2。

## 第三步：CLI 握手（仅 Tier 1/Tier 2 适用）

```bash
harness doctor --json
```

解析 JSON 输出的五字段：
- `version`：CLI 版本（期望 ≥ 0.1.0）
- `schema_version`：bundled schema 版本
- `installed_presets`：harness.config.json 的 extends 字段
- `managed_files_git_status`：`untracked` / `tracked` / `not-present`
- `issues[]`：health 问题清单（每条带 severity + code + message）

## 第四步：Schema 版本双向握手

- `schema_version` 低于当前 skill 期望最低版本 → 提示 `npm install -g harness-workflow-cli@latest`
- `schema_version` 高于当前 CLI 能理解最高版本（即项目由更新 CLI 写过）→ **硬 abort**：
  ```
  项目状态文件 (.harness/current.json) 由更新版本 CLI 写入。
  当前 CLI 版本 <X>，项目要求 ≥<Y>。请升级 CLI 后重试。
  ```

## 第五步：决策树（用户意图 → CLI 命令）

| 用户意图 | 调用 |
|---------|------|
| 新项目接入 harness | `harness init --preset <detected>` |
| 已有项目接入 | `harness adopt` |
| 检查项目状态 | `harness doctor` |
| 扫描代码约定 | `harness scan` |
| 处理 TODO.md 批量答复 | `harness scan --apply-answers` |
| 升级已 init 项目的模板 | `harness maintain --upgrade` |
| 日常漂移检查 | `harness maintain` |

## 第六步：检测 preset

跑 `init` 前，根据项目探测自动推荐 preset：

- 有 `pom.xml` 或 git remote 命中 company matcher → **company-mt**
- 其他 → **personal**

明确告知用户：
```
检测到 <Java/Node/Go/…> 项目，推荐 preset: <company-mt|personal>。
是否继续？（也可指定其他 preset）
```

## 第七步：安装项目级 skill symlink

`harness init` 不会自动把全局 skill symlink 到 `~/.claude/skills/`。用户在新电脑 / 新账号
首次用 harness 时需要一次性装：

```bash
cd <myskills-clone>
for d in harness-workflow harness-init profile-entry harness-common \
         harness-quick harness-bugfix harness-feature harness-refactor \
         strict-reviewer team-pd team-architect team-senior-dev \
         team-junior-dev team-qa team-security team-commander \
         task-dispatcher investigate office-hours gstack; do
  ln -sf "$PWD/$d" ~/.claude/skills/
done
# team-init 作向后兼容 alias 也要
ln -sf "$PWD/team-init" ~/.claude/skills/
```

## 第八步：交棒

CLI 命令成功后，harness-init 职责结束。用户后续开发通过 `/harness-workflow` 公开触发词，
由内部 `profile-entry` 路由到叶子 skill（`harness-{quick,bugfix,feature,refactor}` 或
`company-*`）。

harness-init 不参与后续开发 Round。

## Fallback 规则（汇总）

- **CLI 可用**（Tier 1/2）：按第 3-6 步正常路径
- **CLI 不可用但 myskills clone 存在**（Tier 3）：按第 2 步 Tier 3 手工投放 + 显式 warning
- **都没有** → abort + 提示 `git clone <myskills-url>` 后重试
- CLI 版本过低 → 提示升级
- 项目版本高于 CLI → 硬 abort 要求先升级 CLI

## 与任务分发的关系

本 skill 只管**初始化**（首次进入项目）。初始化完成后：

- **Layer 1: task-dispatcher**（顶层，外层 splitter）—— 用户一条消息含多个独立子任务时自动并行派发
- **Layer 2: harness-workflow**（代码任务入口）—— 每个代码子任务通过 /harness-workflow 触发
- **Layer 3: profile-entry**（内部路由）—— profile 解析 + fast-path + 叶子 skill 选择
- **Layer 4: 叶子 skill**（harness-quick/bugfix/feature/refactor 或 company-*）—— 执行

详见 `harness-workflow/references/protocols.md` 的 skill 分层说明。

## 引用

- CLI doctor --json 完整握手契约：`harness-common/references/doctor-protocol.md`
- 全局 hooks / MCP / plugins 安装步骤 + 7 脚本模板：`harness-workflow/references/hooks.md`
- spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md`
