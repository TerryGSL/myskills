---
name: harness-workflow
description: >
  Harness 工作流的公开兼容入口。保留 /harness-workflow 触发词，真正的路由通过内部 profile-entry 完成。
  生命周期命令（--init / --adopt / --maintain / --doctor / --scan）作为显式 passthrough 到
  harness-workflow-cli（CLI）。代码任务保持薄：接入、强制 harness profile 交棒。
  使用场景：
  (1) 用户沿用 /harness-workflow 旧习惯开发代码
  (2) 用户执行 init / adopt / maintain / doctor / scan 生命周期命令
  (3) 老文档、hook、CLAUDE.md 仍引用 harness-workflow 触发词
  (4) 多项目 harness 升级（/harness-workflow --next 或 --maintain）
  触发命令：/harness-workflow, /harness-workflow --init, /harness-workflow --adopt,
  /harness-workflow --maintain, /harness-workflow --doctor, /harness-workflow --scan,
  /harness-workflow --next
历史说明：v0 是 14949 字节 / 363 行的单体 skill（所有 Phase 1-4 + 8 Stage + 自治决策 + 监控 …）。
v1 重塑为 ≤100 行 compatibility stub；原内容归档在 archive/pre-reshape-backup.md 作历史参考。
Phase 1-4 职责已迁到 harness-workflow-cli（npm 包），详见 references/migration-checklist.md。
8-Stage 循环迁到 harness-feature skill（Stage 2 里由 profile-entry 路由）。
---

# harness-workflow — 兼容入口（v1）

> 公开兼容名（保留用户肌肉记忆）。
> 内部路由器是 `profile-entry`；**不对用户暴露 `/profile-entry` 触发词**。

## 职责

1. 保留现有触发词 + 迁移安全（SessionStart hook / CLAUDE.md 无需改动）
2. 将生命周期命令 passthrough 到 `harness-workflow-cli` CLI
3. 对代码任务：invoke `profile-entry` 并强制 `forced_profile: harness`
4. 当老文档仍指向这里时发迁移提示（首次会话提示一次即可）
5. **零任务类型逻辑，零激进模式策略** —— 全部交 profile-entry / 叶子 skill

## 非职责

- 不自己分类任务类型（quick/bugfix/feature/refactor）
- 不解析 profile matcher（profile-entry 做）
- 不持久化会话模式
- 不实现公司策略（company-mt overlay 做）
- 不重复叶子 skill 选择

## 路由规则

**生命周期命令（passthrough 到 CLI）**：

| 触发 | 调用 |
|------|------|
| `/harness-workflow --init` | `harness init` |
| `/harness-workflow --adopt` | `harness adopt` |
| `/harness-workflow --maintain` | `harness maintain` |
| `/harness-workflow --doctor` | `harness doctor` |
| `/harness-workflow --scan` | `harness scan` |
| `/harness-workflow` (无参) | `harness doctor` + 显示当前 profile / Round |

如果 CLI 未安装 → abort + 提示 `npm install -g harness-workflow-cli`。

**代码任务（转发到 profile-entry）**：

```
invoke Skill(profile-entry) with:
  forced_profile: harness
  public_entrypoint: harness-workflow
  requested_flags: <解析后的 flag>
  cwd: <当前仓库>
```

profile-entry 会做：marker 查找 → fallback matcher → 结构化 fast-path → 优先级解析 → 加载 exactly ONE 叶子 skill（`harness-{quick,bugfix,feature,refactor}`）。

## 会话 schema 版本哨兵（R6/T4）

进入任何代码任务之前，读 `.harness/current.json.workflow_schema_version`：

- 缺失 / null → 触发一次性 migration（写入 "1.0.0"）
- `<= 1.0.0` → 正常继续
- `> 1.0.0`（未来版本）→ **硬 abort** + 提示 `npm install -g harness-workflow-cli@latest`（AD4 双向哨兵）

## 迁移提示

老文档和 hook 调用 `/harness-workflow` 仍**完全有效**。
新架构文档可以提到 `profile-entry`，但只作为内部组件不对外宣传。

## Canonical Reference Bank（本 skill 保留的原 v0 资产）

虽然 `skill.md` 从 363 行 reshape 到 103 行 stub，**原 13 个 references + templates 目录全部保留**
作为整个 harness 生态的 **canonical reference bank**（跨 skill 共享的权威规范）：

- `references/monitoring.md` — 心跳监控 + cronJobId 协议（XL Round 实时监控）
- `references/templates.md` — `docs/STATE.json` / `docs/WALKTHROUGH.md` / `docs/DESIGN.md` 模板
- `references/workflow.md` — Stage 细节 + 自治决策分支
- `references/maintenance.md` — `--maintain` 完整流程
- `references/hooks.md` — 7 个 hook 模板 + settings.json 配置
- `references/autonomy.md` / `parallel-agents.md` / `protocols.md` / `project-detection.md`
- `references/reviewer-integration.md` / `memory.md` / `memory-migrations.md`
- `references/migration-checklist.md`（R5/T10 产出，Phase → CLI 交叉核查）
- `templates/project-memory/*` — memory 模板集

新 skill（harness-feature / harness-common 等）的 references/ 只写**新增 / 关键对外契约**；
详细规范（监控 / STATE.json / hook 模板 / 审稿细节 / memory doctrine）由它们**跨引用**到本目录。
完整索引 → [harness-feature/references/stages.md](../harness-feature/references/stages.md) 末尾
"Canonical Reference Bank" 章节。

原 v0 `skill.md` 全文存档 → `archive/pre-reshape-backup.md`（历史考古用）。

原 v0 的 8-Stage 全文 + Phase 1-4 指令在以下位置：
- **Phase 1-4 实现** → `harness-workflow-cli` (npm 包)；mapping 见 `references/migration-checklist.md`
- **8-Stage 循环** → `harness-feature` skill
- **Quick/Bugfix/Refactor 变体** → `harness-{quick,bugfix,refactor}` skill
- **共享基础设施** → `harness-common` skill
- **原 v0 备份** → `archive/pre-reshape-backup.md`

## 与其他 skill 的关系

| Skill | 位置 | 何时调用 |
|-------|------|---------|
| `profile-entry` | 内部路由（不对外） | 代码任务首次入口 |
| `harness-common` | 共享基础设施 | Phase 1-4 逻辑（drift 检测、--maintain 共享） |
| `harness-feature` | 8-Stage 完整流程 | L/XL 级新功能 |
| `harness-bugfix` | TDD 五步 | bug 修复 |
| `harness-quick` | 无仪式快速路径 | 1 文件 <10 行改动（fast-path 自动路由） |
| `harness-refactor` | baseline + 增量 | 重构任务 |
| `team-init` | 初始化入口 skill | 用户提"接入 harness"时调 CLI |
| `strict-reviewer` | 审稿（含 Step 5 知识合规） | Stage 4/5 |
| `team-pd` / `team-architect` / `team-{senior,junior}-dev` / `team-qa` / `team-security` | 原 8-Stage 子角色 | harness-feature 内部 Stage invoke |

完整 skill 保留矩阵 → `references/` 下的 spec 附录 C。
