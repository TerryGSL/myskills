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

## Wrapper Kernel（duplicated；与 AGENTS.md 一致）

> Spec 强约束：每个 Tier-1 wrapper 必须自带完整 7 条 kernel 规则，**不是** one-line
> pointer。本节内容与 `AGENTS.md` 顶部 7 Core Kernel Rules 严格一致；source-of-truth
> 为 `harness-common/contracts/routing.md`。

1. **Profile resolution order** — read `<repo>/.harness-profile` marker first; fallback to
   `~/.claude/profiles/*.yml` matchers (path_glob / git_remote_regex / file_exists).
   Marker 命中即跳过 fallback；marker 缺失/malformed 才进 matcher 阶段。
2. **Task routing** — quick (trivial 1 file <10 lines, 不碰 schema/export/deps) /
   bugfix (debug + fix 现有功能) / feature (新模块 / 新 API / 新功能) /
   refactor (behavior 完全不变的结构调整). 路由由 fast-path 检测 + 关键词 + 显式 flag
   联合决策；详见 `harness-common/contracts/task-type.md`.
3. **Hard-floor precedence** — `profile.hard_floor > invocation flag`。例如 profile 含
   `auto_push` 时，用户加 `/yolo` 也不能跳过 push 决策；hard_floor 不可被任何 flag、
   mode、aggression level 静默绕过。
4. **CLI-first + markdown fallback** — Tier 1+2（有 node + harness CLI）：
   `harness route --task "<msg>" --flags "<flags>" --json` 是 canonical 路由执行点。
   Tier 3（无 node）：按 `profile-entry/SKILL.md` 描述手算，产出等价 7-field route
   object（leaf_skill / resolved_profile / resolved_mode / task_description /
   hard_floor / knowledge_manifest / fast_path_hit / context_to_inject）。
5. **Stage -0.5 retrieval** — feature / bugfix / refactor 在 knowledge-enabled 项目
   （`docs/harness/knowledge/INDEX.md` 存在）必须在审查前读取 5-domain manifest
   （architecture / api-contracts / data-schemas / business-rules / deployment）。
   详见 `harness-common/contracts/knowledge.md`.
6. **Refusal rule** — 当 invocation flag 与 profile.hard_floor 冲突时返回 REFUSE，
   不可静默降级。例：profile 含 `force_push` hard-floor，用户输入 `/yolo --force-push`
   → wrapper 必须拒绝，并要求用户先调整 profile 或换路径，不可自行裁决跑过。
7. **Routing handoff** — leaf skill 输入只能来自 `harness route --json` 输出（Tier 1+2）
   或 Tier 3 等价 route object。Wrapper 不可重新 parse 用户原文消息推导 route 字段；
   一旦路由决定，下游只消费 route object。

完整契约 → `harness-common/contracts/routing.md`

## 第一步：全局依赖预检

在跑 CLI 之前，先确认 harness 工作流所需的全局基础设施就位。缺失的项目级以上依赖
CLI 也修不了（它只管项目内文件），必须提示用户先装。

### 必须就位的全局依赖

| 依赖 | 必需性 | 检查方式 | 缺失时 |
|------|-------|---------|-------|
| `superpowers@claude-plugins-official` 插件 | 必需（Claude Code） | `ls ~/.claude/plugins/cache/claude-plugins-official 2>/dev/null` | 通过 Claude Code marketplace 安装（Stage 2 writing-plans + Stage 3-4 审查） |
| MCP: `context7` | 必需 | `grep context7 ~/.claude/mcp.json` | 加到 `~/.claude/mcp.json` |
| MCP: `playwright` | 必需（前端 QA） | `grep playwright ~/.claude/mcp.json` | 同上 |
| 7 hooks | 必需（Claude Code） | `ls ~/.claude/hooks/` | 见 `harness-workflow/references/hooks.md` 完整 settings.json + 7 脚本模板 |
| `codex@openai-codex` 插件 | 可选 | `ls ~/.claude/plugins/cache/openai-codex 2>/dev/null` | 通过 Claude Code marketplace 安装（Stage 5 跨模型审查用） |
| `/codex:setup` 验证 Codex CLI | 可选（装了 codex 才用） | `node "/Users/<you>/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs" setup --json` | 验证 Codex CLI + 登录就绪 |
| `claude-mem@thedotmack` 插件 | **可选 acceleration layer**（仅 Claude Code 内有效；非跨工具契约） | `ls ~/.claude/plugins/claude-mem 2>/dev/null` | 通过 Claude Code marketplace 安装（跨会话 observation 加速回溯；项目级 memory 已通过 `docs/memory/*.md` 跨工具持久化，不依赖 claude-mem） |

必需项是 harness 工作流的**全局基础**，每个用户只配一次，跨项目共享。可选项仅 Claude Code 体系内增益，缺失不阻塞工作流（Tier 1+2 跨工具均不依赖）。

> **跨工具 memory 契约**：项目级长期 memory 落 `docs/memory/*.md`（任何工具都能读写、git 跟踪、跨会话/跨工具持久），是 Layer 1 强约束。跨会话 memory 由各工具自带能力（claude-mem / codex resume / cursor history）兜底，可选不强制；详见 `harness-common/contracts/memory.md`。

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

**Tier 3 工具依赖**：环境必须有 `bash >= 3.2` / `python3` / `realpath`。
`harness install --doctor` 探测这 3 个工具，缺失即 warn（不 fail）。

如果环境同时缺 node + 上述任一 → 走"完全无 CLI 手工"路径，AI 直接逐 file Edit/Write。

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

**无 node 派生 fallback**：调 `harness/profile-bootstrap/lib/derive.sh`，需 bash + realpath。
Tier 3 fallback rules: see harness-init/SKILL.md#第二步

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
| 建公司 profile（派生 + 落盘 ~/.claude/profiles/）| `harness profile-bootstrap company-mt --slug acme` |

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
首次用 harness 时需要一次性装。

推荐用 `harness install --doctor` 校验（仅打印 active/inactive 状态）。
缺失项自动修复跑 `harness install`（默认 check + auto-fix）。

```bash
harness install --doctor   # 只检查，不写
harness install            # check + auto-fix（profiles + settings.json hook + skills 一键就位）
```

`harness install` 的 4 步契约（spec §A PR 2）：
1. `~/.claude/profiles/` 不存在则 mkdir
2. `default.yml` / `harness.yml` / `company.yml.template` 缺失即原子写入
3. `~/.claude/settings.json` 三态分支：missing → 写最小合法 JSON；malformed → 备份 `.bak.invalid`
   并 `exit 1`；valid → 备份 `.bak` 后 merge `hooks.Stop[]`（hook 路径定死为
   `<myskills-repo>/hooks/context-monitor.sh`）
4. skills symlink 检查 + 修复（覆盖坏链）

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

- CLI doctor --json 完整握手契约：`harness-common/contracts/doctor-protocol.md`
- 全局 hooks / MCP / plugins 安装步骤 + 7 脚本模板：`harness-workflow/references/hooks.md`
- spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md`
