---
name: harness-quick
description: >
  无仪式快速路径。1 文件 <10 行、不碰 schema/export/deps 的 trivial 改动走这里。
  跳过 PRD / architect / plan，直接 edit + test + commit + learnings observation。
  **不对外公开触发词** —— 由 profile-entry 的结构化 fast-path 自动路由到此。
  使用场景：typo 修正、文案更新、注释补充、config 数值微调等 trivial diff。
  触发命令：（无公开触发词；profile-entry 路由）
---

# harness-quick — 无仪式快速路径

> 由 profile-entry 的 fast-path 确定性路由到这里。用户不直接触发。

## 输入契约（来自 profile-entry）

`resolved_profile` / `resolved_mode` / `task_description` / `hard_floor`。

## 五步极简流程

1. **读 knowledge manifest**（如存在）
   `cat docs/harness/knowledge/*/manifest.md` — 仅读，不改。
   若本次 diff 会违反任一 rule → 立即**退回 profile-entry**（见 [references/exit-conditions.md](references/exit-conditions.md)）。

2. **Edit**
   用 Edit 工具做 1 文件 <10 行改动。

3. **测试**
   只跑和本文件相关的测试。全量 `npm test` 不必要 — fast-path 前提是不动 schema/export。

4. **Commit**
   Conventional Commits 格式。

5. **Learnings observation**（可选）
   `.harness/learnings/LEARNINGS.md` 追加一条，仅当发现非平凡 insight。

## Exit conditions（必须退回 feature path 的情况）

若任一触发 → 中止 quick，退回 profile-entry 让它按 `task-type: feature` 重新路由。

**完整清单** → [references/exit-conditions.md](references/exit-conditions.md)

总结：diff 超限 / 文件类型禁止（pom.xml / migration / schema）/ 内容触发（exported 符号 / 装饰器 / 签名）/ knowledge rule 违反。

## 硬边界

- 不调 team-pd / team-architect / strict-reviewer（quick 不值得）
- 不写 ADR
- 不启动完整 Round
- 不触发 claude-mem observation（只 learnings.md append）
- 不修改 `docs/harness/knowledge/*`（只读）
- 不修改 `docs/memory/*`（只读）
