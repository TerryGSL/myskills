---
name: profile-entry
description: >
  [Thin alias] Harness 工作流的 Tier-3 fallback 路由器。本副本保留作历史路径
  兼容；canonical 内容已迁至顶层 `profile-entry/SKILL.md` 与
  `harness-common/contracts/routing.md`。Tier 1+2 主路径走 `harness route --json`，
  不加载本 SKILL。
  触发命令：（无公开触发词；仅 Tier-3 fallback 内部 invoke）
---

# profile-entry — Thin Alias

> **Canonical 位置**：`profile-entry/SKILL.md`（顶层）
> **完整 routing 契约**：[`harness-common/contracts/routing.md`](../../harness-common/contracts/routing.md)
>
> 本文件保留作历史路径兼容（旧 invoke 走 `harness/profile-entry`）；新引用请用顶层 `profile-entry/SKILL.md`。

## 何时加载

仅 Tier-3 fallback（无 node / `harness route` 不可用 / 手动调试 routing）。Tier 1+2 走 CLI，不加载本 SKILL。

## 行为契约

按顶层 [`profile-entry/SKILL.md`](../../profile-entry/SKILL.md) 的 5 步手算流程产出等价 route object（8 字段，符合 `route-output.schema.json`）。

完整决策顺序 / fast-path / hard-floor / knowledge retrieval / 输出 schema 全部见：

- 顶层 SKILL：[`profile-entry/SKILL.md`](../../profile-entry/SKILL.md)
- canonical 契约：[`harness-common/contracts/routing.md`](../../harness-common/contracts/routing.md)

## 硬边界

- 不写代码、不改文件
- 不做 LLM 语义任务分类
- 不持久化跨 turn 状态
- 不在 Tier 1+2 路径加载

## 引用

- Canonical SKILL：`profile-entry/SKILL.md`（顶层）
- Routing 契约：`harness-common/contracts/routing.md`
- 各分契约：`harness-common/contracts/{profile,task-type,aggression-mode,hard-floor-enforcement,knowledge}.md`
- CLI 实现：`packages/harness-cli/src/commands/route.ts`
- Schema：`packages/harness-cli/resources/schemas/route-output.schema.json`
- Spec：`docs/superpowers/specs/2026-04-26-unified-fusion-design.md` §Canonical fallback
