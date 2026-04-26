---
name: harness-common
description: >
  Harness 叶子 skill（harness-{quick,bugfix,feature,refactor} 和 company-* overlay）
  共享的基础设施 skill。封装 harness-workflow-cli 命令 passthrough、
  .harness/current.json 读写契约、三层记忆写入权限、schema 版本哨兵。
  叶子 skill 通过 Skill(harness-common) 内部 invoke。
  使用场景：叶子 skill 内部引用；不直接对用户触发。
  触发命令：（无公开触发词）
---

# harness-common — 共享基础设施

> 叶子 skill 的共享库，不直接对用户触发。

## 提供的能力（4 类）

1. **CLI 命令 passthrough 封装** — 统一封装 `harness {doctor,init,adopt,maintain,scan}` 等命令调用
2. **`.harness/current.json` 读写契约** — Round 进度状态文件 schema + 写入权限
3. **三层记忆写入权限矩阵** — `.harness/learnings/` → `docs/memory/` → `docs/harness/knowledge/`
4. **Schema 版本哨兵（AD4 双向）** — Stage 3 实现前的版本兼容握手

## 硬边界

以下**不是**本 skill 的职责：

- 不承担任何具体任务类型（quick/bugfix/feature/refactor 各自叶子做）
- 不做 profile 路由（profile-entry 做）
- 不审稿（strict-reviewer 做）
- 不做 AI 扫描（harness-feature 在 Stage -0.5 做；CLI 只 `scan` 命令壳触发）

---

## 1. CLI 命令 passthrough 封装

| Skill 意图 | 调用 CLI |
|-----------|---------|
| Round 开始前健康检查 | `harness doctor` |
| team-init bootstrap 握手 | `harness doctor --json` |
| 初始化 / Adopt | `harness init [--preset ...]` / `harness adopt` |
| Round 结束漂移检查 | `harness maintain` |
| 升级项目到新 bundled | `harness maintain --upgrade` |
| 触发 knowledge 扫描 | `harness scan [--domain ...] [--apply-answers]` |

CLI 未装 → abort + 提示 `npm install -g harness-workflow-cli`。不允许手工 Edit/Write 代替。

## 2. `.harness/current.json` 读写契约

叶子 skill 更新 Round 进度时按以下 schema：

```json
{
  "schemaVersion": 1,
  "workflow_schema_version": "1.0.0",
  "currentFeature": "string | null",
  "currentStage": "requirement-analysis | plan-generation | feature-execution | verification | doc-sync | null",
  "currentItem": "string | null",
  "updatedAt": "<ISO-8601>"
}
```

**写入权限**：
- 叶子 skill 在 Stage 过渡时更新 `currentStage`
- Stage 8 收尾时清 `currentFeature`（写 null）
- 不直接改 `schemaVersion` 或 `workflow_schema_version`（那是 CLI 迁移时的事）

## 3. 三层记忆写入权限矩阵

记忆有三层：`.harness/learnings/`（rolling inbox）→ `docs/memory/{cases,decisions,constraints}/`（长期）→ `docs/harness/knowledge/`（静态 inventory）。

**谁写什么，什么时候写，按什么 schema** → [contracts/memory.md](contracts/memory.md)

**违反权限 → strict-reviewer Step 5 立即 FAIL。**

## 4. Schema 版本哨兵（AD4 双向）

Stage 3（实现）前读 `.harness/current.json.workflow_schema_version`：

- 缺失 → 硬 abort + 提示 `harness adopt`（触发 migration 写入当前版本）
- `> 1.0.0`（未来）→ 硬 abort + 提示升级 CLI
- `<= 1.0.0` → 正常继续

**完整握手逻辑** → [contracts/doctor-protocol.md](contracts/doctor-protocol.md)

## `harness maintain` 模式（drift detection + 一致性 audit）

叶子 skill 不直接跑 drift，由 `harness maintain` 命令做 6 类粗粒度 drift 检查：

1. Managed-files vs bundled 四态
2. `docs/memory/` tree 完整性
3. Memory frontmatter 合规
4. Learnings retention + promotion
5. Knowledge 扫描新鲜度
6. Schema 版本哨兵

**完整检查清单** → [contracts/drift.md](contracts/drift.md)

具体一致性校验项（WALKTHROUGH / CLAUDE.md ADR / evidence file:line / knowledge↔memory 反向链）+ 12 项 audit 详解 + 7 步 drift 恢复流程 + 7 条 red-flag 自检 → [contracts/maintenance.md](contracts/maintenance.md)

项目技术栈探测规则（init / adopt 阶段调用，写入 `.harness-context.json`） → [contracts/project-detection.md](contracts/project-detection.md)

## 引用

- CLI 实现：`packages/harness-cli/src/commands/*.ts` + `src/utils/*.ts`
- Phase → CLI 交叉核查：`harness-workflow/references/migration-checklist.md`
- 上游 spec：`docs/superpowers/specs/2026-04-24-harness-cli-integration-design.md` §6
