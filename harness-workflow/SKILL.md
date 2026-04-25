---
name: harness-workflow
description: >
  Harness 工作流的公开入口。用户通过 /harness-workflow 触发任何代码任务（新功能、bug 修复、
  重构、trivial 编辑），由本 skill 内部路由到合适的叶子 skill（harness-{quick,bugfix,feature,refactor}
  或 company-* overlay）。生命周期命令（--init / --adopt / --maintain / --doctor / --scan）
  passthrough 到 harness-workflow-cli。
  使用场景：
  (1) 用户说"做 XXX / 加 XXX / 修 XXX / 改 XXX / 实现 XXX"等开发请求
  (2) 用户执行 init / adopt / maintain / doctor / scan 生命周期命令
  (3) "下一轮 / 继续开发 / 扫描项目约定"
  触发命令：/harness-workflow, /harness-workflow --init, /harness-workflow --adopt,
  /harness-workflow --maintain, /harness-workflow --doctor, /harness-workflow --scan,
  /harness-workflow --next
---

# harness-workflow — 公开工作流入口

> 这是 harness 体系的公开触发词。代码任务路由由内部 `profile-entry` 完成。

## 职责

1. 保留 `/harness-workflow` 公开触发词（SessionStart hook + CLAUDE.md 规则 + 用户肌肉记忆）
2. 生命周期命令 passthrough 到 `harness-workflow-cli` CLI
3. 代码任务 → invoke `Skill(profile-entry)` 让它做路由 + 叶子 skill 选择
4. 零任务类型逻辑、零激进模式策略（由 profile-entry 和叶子 skill 承担）

## 路由规则

### 生命周期命令（passthrough 到 CLI）

| 触发 | 调用 CLI |
|------|---------|
| `/harness-workflow --init` | `harness init` |
| `/harness-workflow --adopt` | `harness adopt` |
| `/harness-workflow --maintain` | `harness maintain` |
| `/harness-workflow --doctor` | `harness doctor` |
| `/harness-workflow --scan` | `harness scan` |
| `/harness-workflow` （无参） | `harness doctor` + 显示当前 profile / Round |

CLI 未安装 → abort + 提示 `npm install -g harness-workflow-cli`。

### 代码任务（转发到 profile-entry）

```
Skill(profile-entry) with:
  forced_profile: null              # 关键：不硬塞 harness —— 让 profile-entry 正常做 marker → matcher → default 解析
  public_entrypoint: harness-workflow
  requested_flags: <解析后的 flag>
  cwd: <当前仓库>
  task_description: <原用户请求>
```

**`forced_profile: null` 是硬要求**：
- 公开入口是所有 profile 的共用触发词，不能替用户选 profile
- 项目的 `.harness-profile` marker 和 `~/.claude/profiles/*.yml` matcher 决定 profile
- company-mt 的 Java 项目通过 matcher（pom.xml / git remote）自动路由到 `company-*` 叶子
- 只有个别场景（用户跑 `/harness-workflow --force-personal` 之类显式 flag，或 CLI 测试钩子）才传 `forced_profile`

profile-entry 做：marker 查 → fallback matcher → 结构化 fast-path → 优先级解析 → 加载
exactly ONE 叶子 skill（`harness-{quick,bugfix,feature,refactor}` 或对应 `company-*`）。

## 会话 schema 版本哨兵

代码任务入口前读 `.harness/current.json.workflow_schema_version`：

- 缺失 / null → 触发一次性 migration（写入 `"1.0.0"`）
- `<= 1.0.0` → 正常继续
- `> 1.0.0`（未来版本）→ 硬 abort + 提示 `npm install -g harness-workflow-cli@latest`

## 引用

### Canonical Reference Bank（harness 生态共享权威规范）

以下 references 文档是 harness 工作流的跨 skill 共享权威源，由各叶子 skill 按需 cross-link：

- `references/monitoring.md` — 心跳监控协议（`.harness-status.json` schema + `cronJobId` + CronCreate 轮询频率）
- `references/templates.md` — `docs/STATE.json` / `docs/WALKTHROUGH.md` / `docs/DESIGN.md` 模板
- `references/workflow.md` — Stage 详细描述 + 自治决策分支 + subagent 派发规则
- `references/maintenance.md` — `--maintain` 同步检查 + 漂移恢复 playbook
- `references/hooks.md` — 7 个 hook 完整模板 + settings.json 配置
- `references/autonomy.md` — 自治决策树 + 人工介入触发条件
- `references/parallel-agents.md` — Stage 3 senior/junior 并行策略
- `references/protocols.md` — skill 间参数传递约定
- `references/project-detection.md` — 各语言 / 框架详细探测规则
- `references/reviewer-integration.md` — review_target 完整字段 + Stage-specific 审稿点
- `references/memory.md` — memory doctrine 完整论证
- `references/memory-migrations.md` — memory schema 版本升级路径
- `references/migration-checklist.md` — Phase → CLI 动作交叉核查表

### Templates

- `templates/project-memory/*` — memory 模板集（CLI 已打进 bundled，用户通常不用手动拷贝）

### Specs

- `specs/2026-04-23-project-knowledge-scanner-design.md` — knowledge scanner 设计
- `specs/2026-04-24-harness-cli-integration-design.md` — CLI + skill 生态设计

## 硬边界

- 不自己做代码任务路由（交 profile-entry）
- 不自己写代码（交叶子 skill）
- 不公开 `/profile-entry` 触发词（内部 only）
- 生命周期命令必须 passthrough 到 CLI（不允许 AI 手工 Edit/Write 代替）
