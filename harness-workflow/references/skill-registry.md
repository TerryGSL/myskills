# Skill Registry — 运行态完整 skill 清单 + 关系矩阵

> harness 生态的所有 skill 在这里登记，**这是 canonical 运行态索引**。
> 同样的信息在 `docs/superpowers/specs/2026-04-24-harness-cli-integration-design.md` 附录 C
> 有详细论证，本文是它的运行态摘要（skill 加载时按需读）。

## 公开触发词

| Skill | 触发词 / 入口 | 何时用 |
|-------|-------------|-------|
| `harness-workflow` | `/harness-workflow` 及其 lifecycle 命令 | **代码任务统一公开入口**（任何 "做 XXX / 加 XXX / 修 XXX / 重构" 等） |
| `harness-init` | "接入 harness / 初始化 harness / 装 harness / 起 harness" 等触发词 | 项目首次接入 / adopt |
| `team-init` | 同 harness-init 老用法 | 历史兼容 alias，透传到 harness-init |
| `task-dispatcher` | 自动激活（用户消息含 2+ 独立子任务时） | 顶层 splitter（外层）|
| `office-hours` | "我有个想法 / 需求诊断 / 验证产品" | Stage -1 前置（用户主动） |
| `investigate` | "调试 / debug / 排查 / 根因分析" | 系统调试方法论（被 harness-bugfix invoke） |
| `strict-reviewer` | `/strict-reviewer <YAML>` / 自动调用 | 审稿（含 Step 5 知识合规）|
| `gstack/browse` / `gstack/canary` / `gstack/design-review` / `gstack/setup-browser-cookies` (optional / submodule) | 浏览器自动化、canary 监控、设计审查 | 前端 QA（按需被 team-qa invoke；submodule 缺失时 degraded） |
| `careful` / `guard` / `freeze` / `unfreeze` (vendored from gstack) | 危险命令护栏 / 编辑边界 | 全局安全 guardrail，可手工启用 |

## 内部 only（不公开触发词）

| Skill | 调用方式 | 职责 |
|-------|---------|------|
| `profile-entry` | `Skill(profile-entry, {...})` 由 harness-workflow 内部 invoke | 路由器：marker / matcher / fast-path / 优先级 / 加载叶子 |
| `harness-common` | `Skill(harness-common)` 叶子 skill 共享 | CLI passthrough / `.harness/current.json` r/w / drift detection |
| `harness-quick` | profile-entry 路由（fast-path 命中）| 1 文件 < 10 行 trivial 改 |
| `harness-bugfix` | profile-entry 路由（`/fix` 或语义识别）| 五步 TDD bug 修复 |
| `harness-feature` | profile-entry 路由（默认）| 完整 8-Stage 新功能 |
| `harness-refactor` | profile-entry 路由（`/refactor`）| baseline + 增量 plan + 对比重构 |
| `company-quick/bugfix/feature/refactor` | profile-entry 路由（profile=`company-mt` 时取代 harness-* 同名）| Java 企业 overlay |

## Stage 角色 skill（被 harness-feature / company-feature 内部 invoke）

| Skill | Stage | 职责 |
|-------|-------|------|
| `team-pd` | 0 | 需求分析 → PRD.md / DESIGN.md |
| `team-architect` | 1 | 架构审查 → ADR `docs/memory/decisions/` |
| `team-senior-dev` | 3 | 核心模块实现（subagent） |
| `team-junior-dev` | 3 | CRUD 实现（与 senior 并行 subagent）|
| `team-qa` | 6 | 测试设计 + 执行 |
| `team-security` | 7 | 安全审查 + 漏洞修复 |
| `team-commander` | 跨 Stage | 团队工作流指挥（task 流转 / 状态收口）|

## 外部依赖 skill（用户本地选装）

| Skill | 用途 | company-mt 是否必需 |
|-------|------|------|
| `meituan-java-standards` | 美团 Java 28 条规范 | 推荐（缺则降级走 bundled rules）|
| `java-backend-i18n-refactor` | 后端 i18n 通用改造 | Stage 3 涉及新 i18n 时 invoke |
| `costasset-i18n-phase2` | costasset repo 专属 i18n 阶段 2 | repo matcher 命中 costasset-* 时启用 |

## 调用关系图（简化）

```
用户消息
  ↓
task-dispatcher（外层）
  ↓ 每代码子任务
harness-workflow（公开入口）
  ↓ 转发
profile-entry（内部路由）
  ↓ 加载 exactly ONE
harness-{quick,bugfix,feature,refactor}  ← 或 company-* overlay
  │
  ├─ harness-common (共享基础设施)
  ├─ team-pd (Stage 0)
  ├─ team-architect (Stage 1)
  ├─ team-senior/junior-dev (Stage 3)
  ├─ strict-reviewer (Stage 4/5/Step 5 知识合规)
  ├─ team-qa (Stage 6) + 可选 gstack/browse · gstack/canary · gstack/design-review
  ├─ team-security (Stage 7)
  └─ investigate (harness-bugfix Step 1)
```

## 退化降级（依赖缺失时）

| 缺失 skill | 行为 |
|----------|------|
| `team-pd` / `team-architect` | 主 agent 通用需求总结 / 跳过 ADR + 标 degraded |
| `team-{senior,junior}-dev` | 主 agent 直接实现（不派 subagent） |
| `team-qa` | 手工跑测试 + 标 degraded |
| `team-security` | 跳过 Stage 7 + 在 learnings 记 high-priority entry |
| `gstack/browse` / `gstack/canary` / `gstack/design-review` (submodule) | 各自独立缺失 → 该项前端 E2E / canary / design 审查改手工 + 各自 degraded learnings |
| `investigate` | 通用 grep + read 调试 |
| `meituan-java-standards` / `java-backend-i18n-refactor` | company-mt 走 bundled `references/java-rules.md` 保底 |

**所有降级都明示** —— 不静默兜底；每个 degraded 在 `.harness/learnings/ERRORS.md` 记一条。

## 引用

- 完整保留矩阵论证：`docs/superpowers/specs/2026-04-24-harness-cli-integration-design.md` 附录 C
- 各 skill 详细 description 见每个 skill 自己的 `SKILL.md` frontmatter
