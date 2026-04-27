# myskills — AI 项目级 system prompt（Claude Code 入口）

myskills 仓库自身。完整 agent 规则与跨工具入口见 [`AGENTS.md`](AGENTS.md)。

## 必读（按顺序）

1. **[`AGENTS.md`](AGENTS.md) §0 价值层** — 8 条姿态铁律（不假设先验证 / 手术刀式改动 / 该用工具就用工具 / 暴露不确定性 / 失败不掩盖 / 小步前进 / 看用户的话 / 文档语言跟用户主语）
2. **[`AGENTS.md`](AGENTS.md) §1 Core Kernel Rules** — 7 条跨工具 kernel（profile resolution / task routing / hard-floor / memory write / drift / knowledge / ...）
3. **[`EXAMPLES.md`](EXAMPLES.md)** — 8 类反面教材 ❌/✅ 配对（路由 / 工具使用 / token 优化 / 多任务 / 失败处理 / codex 审稿 / 文档同步 / 文档语言）
4. **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — 完整架构 + 17 contracts + 4 个工作流 walkthrough
5. **[`docs/SETUP.md`](docs/SETUP.md)** — Claude + Codex 双工具接入 + Hook 配置

> 在 myskills 仓库自身工作时，AGENTS.md 是 source of truth；本文件仅作为
> Claude Code 的入口指针 + harness CLI managed blocks（不重复 AGENTS.md 内容）。

<!-- harness-knowledge:start -->
## Harness Knowledge Activation

This project has `docs/harness/knowledge/INDEX.md`. Before any harness-workflow round:

1. Harness coordinator MUST run Stage -0.5 (Project Context Retrieval)
2. Stage 2/3 subagent prompts MUST include knowledge context
3. Stage 4 MUST verify knowledge_requirements compliance

To disable: set `harness-knowledge: disabled` below this block.
<!-- harness-knowledge:end -->

<!-- harness-profile:start -->
## Harness Profile

- profile: harness
- resolved_by: marker

For code tasks in this project, Claude Code routes via `team-init` (bootstrap) → CLI → `profile-entry` → leaf sub-skill.
<!-- harness-profile:end -->

## Team Preferences

<!-- users write freely below this line; harness will never touch it -->
