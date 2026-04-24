---
name: team-init
description: >
  初始化 Agent Team 项目工作目录。技术栈无关，探测项目类型，
  调用 harness-workflow-cli 完成确定性文件生成。
  v0 用 Edit/Write 手工初始化 → v1 升级为 AI 调 CLI 分层：
  AI 负责探测 / 对话 / 决策，CLI 负责幂等写文件。
  本 skill 是 harness 体系唯一对外分发的入口 skill（CLI 投放到项目级 .claude/skills/）。
  使用场景：新项目/已有项目接入 harness 工作流；用户说"接入 harness / 初始化 harness /
  扫描项目约定 / harness 没装 / harness 工作流"时触发。
  触发命令：无斜杠命令；AI 监听触发词自动调用。
---

# team-init（v1，CLI 集成版）

> v0 用 AI 手工 Edit/Write 生成所有项目级文件；v1 把"硬写文件"全部下放给
> `harness-workflow-cli` CLI，AI 只负责探测 / 对话 / 决策。
> 原 v0 备份在 `team-init/archive/v0-backup.md`。

## 第一步：探测 CLI 是否已装

所有后续决策前，必须先跑：

```bash
harness doctor --json
```

解析 JSON 输出的五字段：
- `version`：CLI 版本（期望 ≥ 0.1.0）
- `schema_version`：bundled schema 版本（团队所有 harness 使用者应同一大版本）
- `installed_presets`：harness.config.json 的 extends 字段
- `managed_files_git_status`：`untracked` / `tracked` / `not-present`
- `issues[]`：health 问题清单（每条带 severity + code + message）

**若 exit code 非 0 且 code = ENOENT / command not found** → abort，提示用户：

```
harness-workflow-cli 未安装。请运行：
  npm install -g harness-workflow-cli
或使用 npx（无全局安装）：
  npx harness-workflow-cli doctor
```

**禁止** 自己用 Edit/Write 手工初始化（会破坏 ManagedFile 一致性）。

## 第二步：Schema 版本双向握手（AD4）

- `schema_version` 低于当前 skill 期望的最低版本 → 提示升级：
  ```
  npm install -g harness-workflow-cli@latest
  ```
- `schema_version` 高于当前 skill 能理解的最高版本（即项目由更新版本 CLI 写过）→ **硬 abort**：
  ```
  项目状态文件 (.harness/current.json) 由更新版本 CLI 写入。
  当前 CLI 版本 <X>，项目要求 ≥<Y>。请升级 CLI 后重试。
  ```

## 第三步：决策树（用户意图 → CLI 命令）

| 用户意图 | 调用 |
|---------|------|
| 新项目接入 harness | `harness init --preset <detected>` |
| 已有项目接入 | `harness adopt` |
| 检查项目状态 | `harness doctor` |
| 扫描代码约定 | `harness scan` |
| 处理 TODO.md 批量答复 | `harness scan --apply-answers` |
| 升级已 init 项目的模板 | `harness maintain --upgrade` |
| 日常漂移检查 | `harness maintain` |

## 第四步：检测 preset

跑 `init` 前，根据项目探测自动推荐 preset：

- 有 `pom.xml` 或 git remote 命中 company matcher → **company-mt**
- 其他 → **personal**

明确告知用户：
```
检测到 <Java/Node/Go/…> 项目，推荐 preset: <company-mt|personal>。
是否继续？（也可指定其他 preset）
```

## 第五步：交棒

CLI 命令成功后，team-init 职责结束。用户后续开发通过项目级投放的
`harness-workflow` skill（保名触发词 `/harness-workflow`）进入 8-Stage 循环，
由其内部 `profile-entry` 路由到具体叶子 skill（harness-{quick,bugfix,feature,refactor}）。

team-init 不参与后续开发 Round。

## Fallback 规则

- CLI 不可用 → 禁止手工初始化，只允许 abort 提示装 CLI
- CLI 版本过低 → 提示升级
- 项目版本高于 CLI → 硬 abort 要求先升级 CLI
- 双 registry 场景：用户不指定 registry 时默认用公共 registry 安装

## 双重身份

本 skill 有两份存在：

1. **myskills 源仓库**：`team-init/SKILL.md`（当前文件，维护源）
2. **CLI 投放副本**：`harness init` 执行时会把本 skill 投到目标项目的
   `.claude/skills/team-init/SKILL.md`（外部用户只需装这一个 skill）

两份内容必须保持同步。`harness-workflow-cli` 的 `resources/skills/team-init/` 在
Round 12 后会包含编译版（R12 做 company-mt preset 投放时顺带更新）。

## 与其他 skill 的关系

- `profile-entry`（内部 only）：init 完成后，用户代码任务由它路由
- `harness-workflow`（保名 stub）：仍是公开代码任务触发词
- `harness-common`：叶子 skill 共享基础设施
- `strict-reviewer`：Stage 4/5 审稿，含 Step 5 知识合规

完整 skill 处理矩阵：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md` 附录 C
