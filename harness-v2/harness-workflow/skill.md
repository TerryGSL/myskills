---
name: harness-workflow
description: harness 体系的 **profile 声明入口 + 老命令 passthrough**。v2 架构重构后，本 skill 主要负责：(1) 声明 harness profile（供 profile-entry 识别）(2) 保留老命令 /harness-workflow --init / --adopt / --maintain / --next 的肌肉记忆，这些命令 passthrough 到 harness-common 对应阶段。新的代码任务派发（quick / bugfix / feature / refactor）由 profile-entry 处理，不再由本 skill 做 S/M/L/XL 内部分支。
  触发命令：/harness-workflow, /harness-workflow --init, /harness-workflow --adopt, /harness-workflow --maintain, /harness-workflow --next
---

# harness-workflow — v2 重塑后的 profile 入口 stub

> 本 skill 已在 v2 架构重构中瘦身。核心职责从"单体 8-Stage 流水线"改为"声明 harness profile + 保留老命令"。

## 本 skill 在 v2 架构中的位置

- **task-dispatcher**（外层分解，不变）
- ↓ 代码任务
- **profile-entry**（新入口路由，做 profile / task_type / mode 解析）
- ↓ 加载恰好一个
- **harness-quick / harness-bugfix / harness-feature / harness-refactor**（4 个 task-type sub-skill）
- ↓ 所有重路径引用
- **harness-common**（共享基础设施：memory / knowledge / reviewer 集成 / phase-init / maintenance）

本 skill（harness-workflow）现在只：
1. 声明 `harness` profile 的探测入口（主要给 profile-entry 读）
2. 兼容 `--init` / `--adopt` / `--maintain` / `--next` 老命令

## 老命令 passthrough

| 命令 | 行为 |
|---|---|
| `/harness-workflow` | 显示当前状态 + v2 架构概览 |
| `/harness-workflow --init` | 调 `harness-common` 的 phase-init（Phase 1-4） |
| `/harness-workflow --adopt` | 调 `harness-common` phase-init 的 adopt 模式 |
| `/harness-workflow --maintain` | 调 `harness-common/references/maintenance.md` 完整 12 项 audit |
| `/harness-workflow --next` | 启动下一轮 — 实际派 profile-entry 做路由（task_type 由 profile-entry 的 fast-path + flag 决定）|
| `/harness-workflow --scan-project` | 调 `harness-common/references/project-scanner.md` 5-phase scan |
| `/harness-workflow --rescan` / `--partial-rescan <domain>` | 同上 |
| `/harness-workflow --apply-knowledge-answers` | 处理 TODO.md 用户答案 |

## 直接使用的推荐方式

```
用户描述任务 → task-dispatcher 自动派发（新流程）
```

用户**不需要**显式调 /harness-workflow — 除非做老命令（`--init` 等）。日常代码任务由 task-dispatcher + profile-entry 自动处理。

## 本 skill 不再做什么

- 不再内部做 S/M/L/XL 规模分档（由 profile-entry 的 fast-path 替代）
- 不再单体管 8-Stage 流水线（由 harness-feature 承担主路径）
- 不再注入到 SessionStart（由 profile-entry 按需 Skill load）

## 老 harness-workflow 的 8-Stage 主体去了哪里

- Phase 1-4 初始化 → `harness-common/references/phase-init.md`
- 8-Stage 主体 → `harness-feature/SKILL.md`
- Stage 0/1/6/7 prompts → `harness-feature/prompts/`
- memory 契约 → `harness-common/references/memory-contract.md`
- `--maintain` 6 项 memory audit + 6 项 knowledge audit → `harness-common/references/maintenance.md`

## 向后兼容声明

既有项目已经跑过 `/harness-workflow --init` 的，**不需要**重新初始化。v2 读同样的 `.harness-context.json` / `docs/STATE.json` / `docs/memory/` / `docs/harness/knowledge/`。

用户若想体验 v2 架构，直接用 v2 的 profile-entry 触发即可。

## 引用

- 架构设计: `docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md`
- Knowledge scanner: `../harness-common/references/project-scanner.md`
- Stage -0.5 retrieval: `../harness-common/references/knowledge-retrieval.md`
