---
name: harness-quick
description: >
  无仪式快速路径。1 文件 <10 行改动、不碰 schema / export / deps 的任务走这里。
  跳过 PRD / architect / plan，直接 edit + test + commit + learnings observation。
  **不对外公开触发词** —— 由 profile-entry 的结构化 fast-path 自动路由到此。
  使用场景：typo 修正、文案更新、小注释补充、config 数值微调等 trivial 改动。
  触发命令：（无公开触发词；仅 profile-entry 路由）
---

# harness-quick — 无仪式快速路径（v1）

> 由 `profile-entry` 的 fast-path 确定性路由到这里。用户不直接触发。
> Source: 原 harness-workflow v0 的 S 级 Stage 集（见 `harness-workflow/archive/pre-reshape-backup.md` 的 `任务规模自动分级` 段）。

## 输入

由 profile-entry 传入：
- `resolved_profile`
- `resolved_mode`（quick 一般是 standard）
- `task_description`
- `hard_floor`

## 极简流程（5 步）

### 1. 读 knowledge manifest（如果存在）

`cat docs/harness/knowledge/*/manifest.md` — 仅读，不改。
若违反某规则 → 不走 quick 路径，**升级到** harness-bugfix 或 harness-feature。

### 2. Edit

用 `Edit` 工具做 1 文件 <10 行改动。

### 3. 测试

只跑和本文件相关的测试（若有）。全量 `npm test` 不必要 — fast-path 的前提是不碰 schema/export。

### 4. Commit

Conventional commit message。

### 5. Learnings observation

`.harness/learnings/LEARNINGS.md` 追加一条（可选，仅当发现非平凡 insight）。

## 硬限制（违反即路由失败，应该回 profile-entry 走 feature 路径）

- Diff > 10 行 → 路由错误，退回 profile-entry
- 修改 >1 文件 → 同上
- 涉及 exported 符号 / 函数签名 / 类型 → 退回
- 修改 SQL schema / migration → 退回
- 动 `package.json` / `go.mod` / `pyproject.toml` / `Cargo.toml` 的依赖段 → 退回

## 不做的事

- 不调 team-pd / team-architect / strict-reviewer（quick 不值得）
- 不写 ADR
- 不启动 Round
- 不触发 claude-mem observation（只 learnings.md append）

## 参考

- fast-path 规则真源：`harness-workflow-cli/src/types/profile.ts` `FastPathRule` 类型
- 原 S 级 Stage 定义：`harness-workflow/archive/pre-reshape-backup.md`
