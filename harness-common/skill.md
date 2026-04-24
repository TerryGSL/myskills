---
name: harness-common
description: >
  Harness skill 家族的共享基础设施。所有 `harness-{quick,bugfix,feature,refactor}` 叶子
  skill 通过 `Skill(harness-common)` 调本地的：drift 检测、--maintain 辅助、
  .harness/current.json 读写、skill 间的共享参考文档。本 skill 自己不承担任务类型 -
  每种任务类型由叶子 skill 负责。
  使用场景：叶子 skill 内部引用；不直接对用户触发。
  触发命令：（无公开触发词）
---

# harness-common — 共享基础设施（v1）

> 这是叶子 skill 之间的共享库。用户不直接触发。

## 提供的能力

### 1. 生命周期命令转发（to CLI）

叶子 skill 需要调 CLI 时用此处的封装：

```
harness doctor        ← 入 Round 前健康检查
harness doctor --json ← 机器读（team-init bootstrap 用）
harness adopt         ← Round 中发现 memory 树缺 → 补上再继续
harness maintain      ← Stage 8 收尾的漂移检查
harness scan          ← Spec 1 knowledge 扫描触发
```

CLI 未装 → abort + 提示 `npm install -g harness-workflow-cli`。

### 2. `.harness/current.json` 读写

叶子 skill 更新 Round 进度时用：

```json
{
  "schemaVersion": 1,
  "workflow_schema_version": "1.0.0",
  "currentFeature": "string | null",
  "currentStage": "requirement-analysis | plan-generation | feature-execution | verification | doc-sync | null",
  "currentItem": "string | null",
  "updatedAt": "ISO-8601"
}
```

**写入权限**：叶子 skill 在 Stage 过渡时更新 `currentStage`；Stage 8 收尾时清 `currentFeature`。

### 3. Drift detection（for `--maintain`）

检查项：
- `.harness/managed-files.json` 的 hash 与磁盘实际内容 vs bundled — 四态判定
- `docs/memory/{cases,decisions,constraints}/` 每条 entry 的 frontmatter 合规
- `.harness/learnings/` 超 30 天未 triage 的 pending entries
- `docs/harness/knowledge/` 的 INDEX.md `last_full_scan` > 180 天 → mark stale

所有 drift 报告通过 `harness doctor` 输出；`harness maintain` 额外列出 promotable 条目。

### 4. 会话 schema 版本哨兵（AD4）

叶子 skill 进 Stage 3（实现）前，读 `.harness/current.json.workflow_schema_version`：

- 缺失 → 硬 abort + 提示运行 `harness adopt`（会触发 migration 写入当前版本）
- `> 1.0.0`（未来版本）→ 硬 abort + 提示升级 CLI
- `<= 1.0.0` → 正常继续

### 5. 三层记忆读写 contract（from spec §6.2）

叶子 skill 写记忆按分层：

| 层 | 写入权限 | 时机 |
|----|---------|------|
| `.harness/learnings/*` | 任何 skill | 随时追加 entry |
| `docs/memory/cases/` | Stage 8 / `--maintain` | Round 结束 / 漂移归档 |
| `docs/memory/decisions/` | Stage 2（写 plan 时） | 每 ADR 一条 |
| `docs/memory/constraints/` | 人工 / doc-sync | 新增业务边界 |
| `docs/harness/knowledge/*` | **只** `harness scan` / `harness maintain` | Stage 3/4 禁止直接写 |

违反会被 strict-reviewer Step 5 捕获 → FAIL。

## 不做的事

- 不承担任何具体任务类型（quick/bugfix/feature/refactor 各自叶子做）
- 不做 profile 路由（profile-entry 做）
- 不审稿（strict-reviewer 做）
- 不做 AI 扫描（harness-workflow skill 在 Stage -0.5 做；CLI 只壳触发）

## 参考

- spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md` §6.1-§6.5
- 原 Phase 1-4 内容：`harness-workflow/archive/pre-reshape-backup.md`（v0 备份）
- Phase→CLI crosscheck：`harness-workflow/references/migration-checklist.md`
