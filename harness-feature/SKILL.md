---
name: harness-feature
description: >
  L/XL 级新功能的 8-Stage 自治流程。显式调用 team-pd / team-architect /
  team-{senior,junior}-dev / team-qa / team-security + strict-reviewer 完成
  需求 → 架构 → 规划 → 实现 → 审查 → QA → 安全 → 收尾闭环。
  Stage -0.5 集成 knowledge scanner；Stage 8 按 profile.hard_floor 强制执法。
  不对外公开触发词 —— 由 profile-entry 路由（默认所有非 quick/bugfix/refactor 都走这里）。
  使用场景：新功能开发、跨模块改造、新子系统引入。
  触发命令：（无公开触发词；profile-entry 路由）
---

# harness-feature — 8-Stage 自治新功能流程

## 输入契约

本 SKILL 由 `harness route --json` 输出的 route object 驱动。route object 8 字段（spec §Routing-as-CLI）：

| 字段 | 语义 |
|------|------|
| `leaf_skill` | 必为 `harness-feature` |
| `resolved_profile` | profile.name（含 hard_floor 清单） |
| `resolved_mode` | `conservative` / `standard` / `aggressive` |
| `task_description` | 原用户请求 verbatim |
| `hard_floor` | HARD_FLOOR_FLAGS 子集（Stage 8 强制执法） |
| `knowledge_manifest` | KnowledgeCheck 8-field state object（Stage -0.5 注入） |
| `fast_path_hit` | boolean（feature 路径通常 false） |
| `context_to_inject` | markdown 字符串（Binding Rules + Advisory Context；prepend 到第一个 subagent task prompt） |

**Tier 1+2（默认）**：调用方通过 `harness route --json` 拿到 route object 直接 invoke 本 SKILL。
**Tier 3（无 node）**：CLI 不可用 → 由 `profile-entry` SKILL 手算等价 route object。

完整契约 → [`harness-common/contracts/routing.md`](../harness-common/contracts/routing.md)

## 硬边界

- Stage -0.5 若 `knowledge_requirements` 非空但 Stage 4 未核查 → FAIL
- Stage 8 hard_floor 动作 → 硬 abort（即使 `/yolo`）
- 连续 10 Round 未 PASS Stage 4 → 停下反思路径是否错

## 8-Stage 总览

```
Stage -0.5  Project Context Retrieval     (knowledge scanner 注入)
Stage 0     需求分析                      team-pd
Stage 1     架构审查                      team-architect
Stage 2     规划                          superpowers:writing-plans
Stage 3     实现                          subagent-driven (senior/junior 并行)
Stage 4     Spec 审查                     strict-reviewer (含 Step 5 知识合规)
Stage 5     质量审查                      codex + code-reviewer
Stage 6     QA 测试                       team-qa (+ gstack/browse / gstack/canary / gstack/design-review 前端 — 可选 ln)
Stage 7     安全审查                      team-security
Stage 8     收尾                          Coordinator (hard_floor 执法)
```

**每 Stage 详细契约 + invoke 模板** → [references/stages.md](references/stages.md)

---

## Round 规模（S/M/L/XL 自动分级）

由 team-pd 在 Stage 0 评估，不问用户。XL 级自动拆多 Round 写入 `.harness/current.json.pendingRounds`。

**分级表 + 拆轮原则** → [references/round-sizing.md](references/round-sizing.md)

## Knowledge Scanner 集成

Stage -0.5 注入 `.harness-status.json.knowledgeCheck`（8 字段）给下游 Stage。Render 为：

- **Binding Rules**（Status=active）→ 违反即 reviewer FAIL
- **Advisory Context**（Status=expired / user_override）→ 仅风格参考

**完整集成契约 + Late Recovery 兜底 + disabled 模式** → [references/knowledge-integration.md](references/knowledge-integration.md)

## Stage 8 Hard-Floor 执法

`profile.hard_floor` 六种动作（`auto_push` / `force_push` / `destructive_ops` / `auto_merge` / `rewrite_history` / `network_install`）在 Stage 8 **强制禁止**，纵深防御（profile-entry 已剔除，Stage 8 再验证一次）。

**6 flags 完整语义 + 5 处执法点 + 优先级表 + 用户 explicit 授权机制** → [`harness-common/contracts/hard-floor-enforcement.md`](../harness-common/contracts/hard-floor-enforcement.md)

## Stage 8 Commit + Push 评估

commit 后调用 `harness push-check`；不可用时按 `harness-common/contracts/push-decision.md` 规则手算。
Tier 3 fallback rules: see harness-init/SKILL.md#第二步

## Stage Prompt 模板

各 Stage 的 subagent invoke prompt 模板：

- Stage 0 team-pd：[prompts/pd-prompt.md](prompts/pd-prompt.md)
- Stage 1 team-architect：[prompts/architect-prompt.md](prompts/architect-prompt.md)
- Stage 6 team-qa：[prompts/qa-prompt.md](prompts/qa-prompt.md)
- Stage 7 team-security：[prompts/security-prompt.md](prompts/security-prompt.md)
- Stage -0.5 Knowledge Scanner（5-domain Parallel Domain Scan subagent prompts）：[prompts/scanner-prompts.md](prompts/scanner-prompts.md)（实施时由 `harness scan` Phase 2 coordinator 派发）

## Round 间衔接

Stage 8 完成 → 检查 `pendingRounds`：
- 有 → 自动启动 Round N+1（从 Stage -0.5 开始）
- 无 → 输出最终汇总 + 清空

## 失败回退闭环（rollback contract，每 Stage 适用）

任何 Stage 失败且 strict-reviewer FAIL 不可修 → 强制走以下闭环：

1. `git diff --stat` 列出本 Stage 改了哪些文件（Stage 起点对比）
2. 回退本 Stage 但**不动前面 Stage 的成果**：`git checkout -- <files-stage-N>`
3. 写 `docs/memory/cases/<incident-stage-N-<date>>.md`：失败 spec + 修复尝试 + 后续 Round 该改什么
4. 更新 `.harness-status.json` / `STATE.json`：`current_stage = N-1`，`last_failure = "<context>"`
5. 询问用户：调整 spec / 改架构 / 拆 Round / 中止

## 依赖 skill 的 degraded fallback

| skill | 缺失时行为 |
|-------|-----------|
| team-pd | 用通用需求总结 + 标 degraded warning |
| team-architect | 跳过 ADR 生成 + 标 degraded |
| team-{senior,junior}-dev | 主 agent 直接实现（非 subagent 派发） |
| team-qa | 手工跑测试 + 标 degraded |
| team-security | 跳过 Stage 7 + 在 learnings 记 high-priority entry |
| gstack/browse / gstack/canary / gstack/design-review (可选 submodule) | 前端任务手工 E2E 验证 + 标 degraded |

**不静默兜底** —— 每个 degraded 场景在 learnings 记条目 + 显式提示用户。

## 引用

### 本 skill references/（progressive disclosure）

- [references/stages.md](references/stages.md) — 8-Stage 详解
- [references/round-sizing.md](references/round-sizing.md) — S/M/L/XL 分级 + XL 拆轮
- [references/knowledge-integration.md](references/knowledge-integration.md) — knowledge scanner 集成（Stage -0.5 / Stage 4 Late Recovery）

### Cross-skill canonical contracts（rule expansion 不在本 skill 内嵌）

- [`harness-common/contracts/hard-floor-enforcement.md`](../harness-common/contracts/hard-floor-enforcement.md) — Stage 8 hard_floor 6 flags 执法
- [`harness-common/contracts/push-decision.md`](../harness-common/contracts/push-decision.md) — push 决策规则
- [`harness-common/contracts/knowledge.md`](../harness-common/contracts/knowledge.md) — Stage -0.5 / Stage 4 知识合规
- [`harness-common/contracts/reviewer-gates.md`](../harness-common/contracts/reviewer-gates.md) — Stage 4 reviewer 4 硬门
- [`harness-common/contracts/autonomy.md`](../harness-common/contracts/autonomy.md) — autonomy 决策树
- [`harness-common/contracts/memory.md`](../harness-common/contracts/memory.md) — memory 三层权限
- [`harness-common/contracts/drift.md`](../harness-common/contracts/drift.md) — drift detection
- [`harness-common/contracts/phase-init.md`](../harness-common/contracts/phase-init.md) — phase init

### Canonical reference bank（harness 生态共享）

- `harness-workflow/references/monitoring.md` — 心跳监控 + cronJobId 协议（XL Round 实时监控）
- `harness-workflow/references/templates.md` — STATE.json / WALKTHROUGH / DESIGN 模板
- `harness-workflow/references/workflow.md` — Stage 详细 + 自治决策分支
- `harness-workflow/references/maintenance.md` — --maintain 完整流程
- `harness-workflow/references/hooks.md` — 7 hook 模板 + settings.json 配置
- `harness-workflow/references/{autonomy,parallel-agents,protocols,project-detection,reviewer-integration,memory,memory-migrations,migration-checklist}.md`

### Spec

- `docs/superpowers/specs/2026-04-24-harness-cli-integration-design.md` §附录 C（skill 处理矩阵）
- `docs/superpowers/specs/2026-04-23-project-knowledge-scanner-design.md`
- `docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md`

### 共享基础设施

- `harness-common/SKILL.md` + `harness-common/contracts/*`
