---
name: team-init
description: >
  初始化项目工作目录的入口 skill。技术栈无关，探测项目类型，通过 harness-workflow-cli
  完成确定性文件生成。AI 负责探测 / 对话 / 决策；CLI 负责幂等写文件。
  本 skill 是 harness 体系对外的唯一入口 skill —— 外部用户只需装它 + npm install
  harness-workflow-cli，就能在任何项目接入 harness 工作流。
  使用场景：用户说"接入 harness / 初始化 harness / 扫描项目约定 / harness 没装 /
  harness 工作流"时触发；新项目 + 已有项目都可。
  触发命令：无斜杠命令；AI 监听触发词自动调用。
---

# team-init — 项目初始化入口

## 第一步：全局依赖预检

在跑 CLI 之前，先确认 harness 工作流所需的全局基础设施就位。缺失的项目级以上依赖
CLI 也修不了（它只管项目内文件），必须提示用户先装。

### 必须就位的全局依赖

| 依赖 | 检查方式 | 缺失时 |
|------|---------|-------|
| `claude-mem@thedotmack` 插件 | `ls ~/.claude/plugins/claude-mem 2>/dev/null` | 提示通过 Claude Code marketplace 安装 |
| `codex@openai-codex` 插件 | `ls ~/.claude/plugins/cache/openai-codex 2>/dev/null` | 同上（可选，用于 Stage 5 跨模型审查） |
| `superpowers@claude-plugins-official` 插件 | `ls ~/.claude/plugins/cache/claude-plugins-official 2>/dev/null` | 同上（Stage 2 writing-plans + Stage 3-4 审查） |
| MCP: `context7` | `grep context7 ~/.claude/mcp.json` | 提示加到 `~/.claude/mcp.json` |
| MCP: `playwright` | `grep playwright ~/.claude/mcp.json` | 同上（前端 QA 用） |
| 7 hooks | `ls ~/.claude/hooks/` | 见 `harness-workflow/references/hooks.md` 的完整 settings.json + 7 个脚本模板 |

三大插件 + 2 MCP + 7 hooks 是 harness 工作流的**全局基础**，每个用户只配一次，跨项目共享。

**完整安装说明 + hook 脚本模板** → `harness-workflow/references/hooks.md`

## 第二步：CLI 探测

```bash
harness doctor --json
```

解析 JSON 输出的五字段：
- `version`：CLI 版本（期望 ≥ 0.1.0）
- `schema_version`：bundled schema 版本（团队应同一大版本）
- `installed_presets`：harness.config.json 的 extends 字段
- `managed_files_git_status`：`untracked` / `tracked` / `not-present`
- `issues[]`：health 问题清单（每条带 severity + code + message）

**若 exit code 非 0 且 `command not found`** → abort，提示：

```
harness-workflow-cli 未安装。请运行：
  npm install -g harness-workflow-cli
或使用 npx（无全局安装）：
  npx harness-workflow-cli doctor
```

**禁止** 自己用 Edit/Write 手工初始化（会破坏 ManagedFile 一致性）。

## 第三步：Schema 版本双向握手

- `schema_version` 低于当前 skill 期望的最低版本 → 提示 `npm install -g harness-workflow-cli@latest`
- `schema_version` 高于当前 CLI 能理解的最高版本（即项目由更新 CLI 写过）→ **硬 abort**：
  ```
  项目状态文件 (.harness/current.json) 由更新版本 CLI 写入。
  当前 CLI 版本 <X>，项目要求 ≥<Y>。请升级 CLI 后重试。
  ```

## 第四步：决策树（用户意图 → CLI 命令）

| 用户意图 | 调用 |
|---------|------|
| 新项目接入 harness | `harness init --preset <detected>` |
| 已有项目接入 | `harness adopt` |
| 检查项目状态 | `harness doctor` |
| 扫描代码约定 | `harness scan` |
| 处理 TODO.md 批量答复 | `harness scan --apply-answers` |
| 升级已 init 项目的模板 | `harness maintain --upgrade` |
| 日常漂移检查 | `harness maintain` |

## 第五步：检测 preset

跑 `init` 前，根据项目探测自动推荐 preset：

- 有 `pom.xml` 或 git remote 命中 company matcher → **company-mt**
- 其他 → **personal**

明确告知用户：
```
检测到 <Java/Node/Go/…> 项目，推荐 preset: <company-mt|personal>。
是否继续？（也可指定其他 preset）
```

## 第六步：交棒

CLI 命令成功后，team-init 职责结束。用户后续开发通过 `/harness-workflow` 公开触发词，
由内部 `profile-entry` 路由到叶子 skill（`harness-{quick,bugfix,feature,refactor}`）。

team-init 不参与后续开发 Round。

## Fallback 规则

- CLI 版本过低 → 提示升级
- 项目版本高于 CLI → 硬 abort 要求先升级 CLI
- 全局依赖缺 → 列出缺失项，指向 `harness-workflow/references/hooks.md` 的安装步骤

### CLI 不可用的三级降级

**Tier 1（推荐）**：全局安装 CLI
```bash
npm install -g harness-workflow-cli
```

**Tier 2**：从 myskills clone 本地构建（不需要 npm publish）
```bash
cd <myskills-clone>/packages/harness-cli
npm install
npm run build
# 加入 PATH（三选一）
ln -sf $PWD/bin/cli.js /usr/local/bin/harness
# 或 alias
alias harness="node $PWD/bin/cli.js"
# 或 npm link
npm link
```

**Tier 3（最后降级）**：完全无 CLI，AI 手工初始化

如果用户没装 npm / node，或在断网环境：

```
[degraded] CLI 不可用，走 AI 手工 fallback
  读 packages/harness-cli/resources/templates/**
  按项目探测渲染占位符（{{project_name}} / {{project_type}} 等）
  Edit/Write 到目标项目对应路径（见 init.ts:planFiles 的 targetRelative 映射）
  跳过 ManagedFileRecord 双 hash 追踪（降级代价）
```

**Tier 3 代价**：后续 `harness maintain --upgrade` 无法跑；用户改了 bundled 文件无检测；
只建议在应急 / 临时 demo 用。用户应该尽快升到 Tier 1 或 Tier 2。

**Tier 判定流程**：
1. `which harness` 或 `harness --version` → 如 exit 0 → Tier 1 ✅
2. `ls <myskills-clone>/packages/harness-cli/bin/cli.js` → 如存在 → 提示用户走 Tier 2 命令
3. 都没有 → Tier 3 degraded，显式 warning

## 引用

- CLI doctor --json 完整握手契约：`harness-common/references/doctor-protocol.md`
- 全局 hooks / MCP / plugins 安装步骤：`harness-workflow/references/hooks.md`
- spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md`
