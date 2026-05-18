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

## 输入契约

本 SKILL 由 `harness route --json` 输出的 route object 驱动。route object 8 字段（spec §Routing-as-CLI）：

- `leaf_skill`: 必为 `harness-quick`
- `resolved_profile`: string
- `resolved_mode`: conservative | standard | aggressive
- `task_description`: string（原用户请求 verbatim）
- `hard_floor`: HARD_FLOOR_FLAGS 子集
- `knowledge_manifest`: KnowledgeCheck 8-field state object
- `fast_path_hit`: boolean（quick 路径通常 true）
- `context_to_inject`: markdown 字符串（Binding Rules + Advisory Context；prepend 到第一个 subagent task prompt）

**Tier 1+2（默认）**：调用方通过 `harness route --json` 拿到 route object 直接 invoke 本 SKILL。
**Tier 3（无 node）**：CLI 不可用 → 由 `profile-entry` SKILL 手算等价 route object。

完整契约 → [`harness-common/contracts/routing.md`](../harness-common/contracts/routing.md)

## 五步极简流程

1. **读 knowledge manifest**（如存在）
   `cat docs/harness/knowledge/*/manifest.md` — 仅读，不改。
   若本次 diff 会违反任一 rule → 立即**退回 profile-entry**（见 [references/exit-conditions.md](references/exit-conditions.md)）。

2. **Edit**
   用 Edit 工具做 1 文件 <10 行改动。

3. **测试**
   只跑和本文件相关的测试。全量 `npm test` 不必要 — fast-path 前提是不动 schema/export。

4. **Commit + Push 评估**
   Conventional Commits 格式。
   commit 后调用 `harness push-check`；不可用时按 `harness-common/contracts/push-decision.md` 规则手算。
   Tier 3 fallback rules: see harness-init/SKILL.md#第二步

5. **Learnings observation**（**必做，default-on**）
   `.harness/learnings/LEARNINGS.md` 追加一条 — 不管是否"非平凡"，本次 quick 任何 user feedback / 纠正 / 偏好都要落盘。3 行模板：

   ```
   ## [LRN-YYYYMMDD-NNN] <slug>
   **Logged**: <ISO-8601>  **Status**: resolved
   ### Summary
   <一句话规则>
   ### Why
   <用户原话或纠正动机>
   ### Related Files
   <paths>
   ```

   **跳过条件**（必须满足**全部**才允许跳过）：
   - 用户**未**给出任何反馈、纠正、偏好
   - diff 是纯 typo / 格式化 / 注释微调（无规则可提）
   - 用户明确说"这次不用记"

   **写入失败不阻塞 commit**，但 Stop hook 会再次提示。

## Exit conditions（必须退回 feature path 的情况）

若任一触发 → 中止 quick，退回 profile-entry 让它按 `task-type: feature` 重新路由。

**完整清单** → [references/exit-conditions.md](references/exit-conditions.md)

总结：diff 超限 / 文件类型禁止（pom.xml / migration / schema）/ 内容触发（exported 符号 / 装饰器 / 签名）/ knowledge rule 违反。

## 硬边界

- 不调 team-pd / team-architect / strict-reviewer（quick 不值得）
- 不写 ADR
- 不启动完整 Round
- 项目级 memory 写入仅限 `.harness/learnings/LEARNINGS.md` append（Step 5 default-on）；不写 `docs/memory/decisions/` / `cases/`（quick 路径不达阈值）
- **claude-mem 跨会话记忆 = Layer 0 必读**：本会话首次接到 quick 任务前必跑 `mcp__plugin_claude-mem_mcp-search__search`（query=task 关键词），命中相关历史 observation 时 `get_observations([IDs])` 取详情；codex resume / cursor history 仍为 acceleration 不强制
- 不修改 `docs/harness/knowledge/*`（只读）
- 不修改 `docs/memory/*`（只读）

## 引用（rule expansion 不在本 skill 内嵌）

- [`harness-common/contracts/push-decision.md`](../harness-common/contracts/push-decision.md) — push 决策（Step 4 调用）
- [`harness-common/contracts/hard-floor-enforcement.md`](../harness-common/contracts/hard-floor-enforcement.md) — hard_floor 6 flags
- [`harness-common/contracts/knowledge.md`](../harness-common/contracts/knowledge.md) — knowledge manifest 只读约束
- [`harness-common/contracts/memory.md`](../harness-common/contracts/memory.md) — learnings 写入权限
