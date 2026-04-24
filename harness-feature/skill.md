---
name: harness-feature
description: >
  L/XL 级新功能的完整 8-Stage 自治流程。承接原 harness-workflow v0 的 8-Stage 全文，
  显式调用 team-pd / team-architect / team-{senior,junior}-dev / team-qa / team-security
  + strict-reviewer 完成需求→架构→规划→实现→审查→QA→安全→收尾闭环。
  Stage -0.5 集成 Spec 1 knowledge scanner；Stage 8 按 profile.hard_floor 强制执法。
  **不对外公开触发词** —— 由 profile-entry 路由（默认所有非 quick/bugfix/refactor 都走这里）。
  使用场景：新功能开发、跨模块改造、新子系统引入。
  触发命令：（无公开触发词；profile-entry 路由）
---

# harness-feature — 8-Stage 自治新功能流程

> 由 profile-entry 路由到本 skill。8-Stage 循环的 canonical 继承者。
> 原 v0 全文备份：`harness-workflow/archive/pre-reshape-backup.md:236-320`。

## 输入契约（来自 profile-entry）

| 字段 | 语义 |
|------|------|
| `resolved_profile` | 完整 profile 对象（含 hard_floor 清单） |
| `resolved_mode` | `conservative` / `standard` / `aggressive` |
| `task_description` | 原用户请求 |
| `hard_floor` | 禁止动作清单（Stage 8 强制执法） |

## 8-Stage 总览

```
Stage -0.5  Project Context Retrieval     (Spec 1 knowledge 注入)
Stage 0     需求分析                      team-pd
Stage 1     架构审查                      team-architect
Stage 2     规划                          superpowers:writing-plans
Stage 3     实现                          subagent-driven (senior/junior 并行)
Stage 4     Spec 审查                     strict-reviewer (含 Step 5 知识合规)
Stage 5     质量审查                      codex + code-reviewer
Stage 6     QA 测试                       team-qa (+ gstack 前端)
Stage 7     安全审查                      team-security
Stage 8     收尾                          Coordinator (hard_floor 执法)
```

**每 Stage 详细契约 + invoke 模板** → [references/stages.md](references/stages.md)

## Round 规模（S/M/L/XL 自动分级）

由 team-pd 在 Stage 0 评估，不问用户。XL 级自动拆多 Round 写入 `.harness/current.json.pendingRounds`。

**分级表 + 拆轮原则** → [references/round-sizing.md](references/round-sizing.md)

## Knowledge Scanner 集成（Spec 1）

Stage -0.5 注入 `.harness-status.json.knowledgeCheck`（8 字段）给下游 Stage。Render 为：

- **Binding Rules**（Status=active）→ 违反即 reviewer FAIL
- **Advisory Context**（Status=expired / user_override）→ 仅风格参考

**完整集成契约 + Late Recovery 兜底 + disabled 模式** → [references/knowledge-integration.md](references/knowledge-integration.md)

## Stage 8 Hard-Floor 执法

`profile.hard_floor` 六种动作（`auto_push` / `force_push` / `destructive_ops` / `auto_merge` / `rewrite_history` / `network_install`）在 Stage 8 **强制禁止**，纵深防御（profile-entry 已剔除，Stage 8 再验证一次）。

**违反处理 + 用户 explicit 授权机制** → [references/hard-floor-enforcement.md](references/hard-floor-enforcement.md)

## Stage Prompt 模板

各 Stage 的 subagent invoke prompt 模板：

- Stage 0 team-pd：[prompts/pd-prompt.md](prompts/pd-prompt.md)
- Stage 1 team-architect：[prompts/architect-prompt.md](prompts/architect-prompt.md)
- Stage 6 team-qa：[prompts/qa-prompt.md](prompts/qa-prompt.md)
- Stage 7 team-security：[prompts/security-prompt.md](prompts/security-prompt.md)

## Round 间衔接

Stage 8 完成 → 检查 `pendingRounds`：
- 有 → 自动启动 Round N+1（从 Stage -0.5 开始）
- 无 → 输出最终汇总 + 清空

## 硬边界

- Stage -0.5 若 `knowledge_requirements` 非空但 Stage 4 未核查 → FAIL
- Stage 8 hard_floor 动作 → 硬 abort（即使 `/yolo`）
- 连续 10 Round 未 PASS Stage 4 → 停下反思（参照 2026-04-22 iteration-log）

## 依赖 skill 的 degraded fallback

| skill | 缺失时行为 |
|-------|-----------|
| team-pd | 用通用需求总结 + 标 degraded warning |
| team-architect | 跳过 ADR 生成 + 标 degraded |
| team-{senior,junior}-dev | 主 agent 直接实现（非 subagent 派发） |
| team-qa | 手工跑测试 + 标 degraded |
| team-security | 跳过 Stage 7 + 在 learnings 记 high-priority entry |
| gstack | 前端任务手工 E2E 验证 + 标 degraded |
| investigate | 通用调试（harness-bugfix 专用，非 harness-feature 主线） |

**不静默兜底** —— 每个 degraded 场景在 learnings 记条目 + 显式提示用户。

## 引用

- Spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md` §附录 C（15 skill 保留矩阵）
- Spec 1：`harness-workflow/specs/2026-04-23-project-knowledge-scanner-design.md`
- Spec 2：`docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md`
- 共享基础设施：`harness-common/skill.md` + `harness-common/references/*`
