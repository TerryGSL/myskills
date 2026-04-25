# Harness Instructions for GitHub Copilot

> GitHub Copilot（含 Copilot Chat / Copilot Coding Agent）会自动读取仓库
> 根 `.github/copilot-instructions.md`，把内容作为 repository-level system
> instructions 注入每次补全/对话。本文件是 Harness 工作流在 Copilot 下的入口，
> 包含完整 7 条 kernel + CLI surface + mandatory contracts。
>
> **跨工具入口的关系**：与 `AGENTS.md`（Codex / Cross-tool）、
> `harness-init/SKILL.md`（Claude Code）、`.cursor/rules/harness.md`（Cursor）、
> `CONVENTIONS.md`（Aider）严格一致。
> Source-of-truth：`harness-common/contracts/`。

## 7 Core Kernel Rules

1. **Profile resolution order** — read `<repo>/.harness-profile` marker first; fallback to
   `~/.claude/profiles/*.yml` matchers (path_glob / git_remote_regex / file_exists).
   Marker 命中即跳过 fallback；marker 缺失/malformed 才进 matcher 阶段。
2. **Task routing** — quick (trivial 1 file <10 lines, 不碰 schema/export/deps) /
   bugfix (debug + fix 现有功能) / feature (新模块 / 新 API / 新功能) /
   refactor (behavior 完全不变的结构调整). 路由由 fast-path 检测 + 关键词 + 显式 flag
   联合决策；详见 `harness-common/contracts/task-type.md`.
3. **Hard-floor precedence** — `profile.hard_floor > invocation flag`。例如 profile 含
   `auto_push` 时，用户加 `/yolo` 也不能跳过 push 决策；hard_floor 不可被任何 flag、
   mode、aggression level 静默绕过。
4. **CLI-first + markdown fallback** — Tier 1+2（有 node + harness CLI）：
   `harness route --task "<msg>" --flags "<flags>" --json` 是 canonical 路由执行点。
   Tier 3（无 node）：按 `profile-entry/SKILL.md` 描述手算，产出等价 7-field route
   object（leaf_skill / resolved_profile / resolved_mode / task_description /
   hard_floor / knowledge_manifest / fast_path_hit / context_to_inject）。
5. **Stage -0.5 retrieval** — feature / bugfix / refactor 在 knowledge-enabled 项目
   （`docs/harness/knowledge/INDEX.md` 存在）必须在审查前读取 5-domain manifest
   （architecture / api-contracts / data-schemas / business-rules / deployment）。
   详见 `harness-common/contracts/knowledge.md`.
6. **Refusal rule** — 当 invocation flag 与 profile.hard_floor 冲突时返回 REFUSE，
   不可静默降级。例：profile 含 `force_push` hard-floor，用户输入 `/yolo --force-push`
   → wrapper 必须拒绝，并要求用户先调整 profile 或换路径，不可自行裁决跑过。
7. **Routing handoff** — leaf skill 输入只能来自 `harness route --json` 输出（Tier 1+2）
   或 Tier 3 等价 route object。Wrapper 不可重新 parse 用户原文消息推导 route 字段；
   一旦路由决定，下游只消费 route object。

## CLI Surface

最低支持命令（Tier 1+2）：

- `harness install --doctor` — user-global setup verification（`~/.claude/profiles/` /
  `~/.claude/settings.json` hook / skills symlink 三件套校验）
- `harness profile-bootstrap <slug>` — derive company profile（从仓库探测派生写入
  `~/.claude/profiles/<slug>.yml`）
- `harness profile-resolve --json` — resolve current project profile（仅返回 profile
  解析结果；不含 routing）
- `harness scan --json` — 5-domain knowledge manifest（产出
  `docs/harness/knowledge/*` + TODO.md）
- `harness memory check --json` — memory contract validation（三层 memory 权限矩阵
  + 写入合法性校验）
- `harness route --task "<msg>" --flags "..." --json` — 统一 routing 执行点，产出
  7-field route object
- `harness push-check --hard-floor=... --json` — push 决策三档（safe / risky / blocked）

## Mandatory Contracts

任何工具消费本 wrapper 时，必须读这些 contract（source-of-truth，禁止脑补）：

- `harness-common/contracts/routing.md` — 完整 routing 算法 + 7 kernel detail + Tier
  fallback
- `harness-common/contracts/hard-floor-enforcement.md` — hard_floor 强制执法 + 冲突
  refusal
- `harness-common/contracts/push-decision.md` — push 决策三档 + 自动推送阈值
- `harness-common/contracts/memory.md` — 三层 memory（global / project / session）
  权限矩阵
- `harness-common/contracts/knowledge.md` — Stage -0.5 retrieval + 5-domain manifest
  schema

## Project Memory

- **必需**：`docs/memory/*.md`（项目级 memory，跨工具可读，git 跟踪；
  `cases/` / `learnings/` / `decisions/` 三类）
- **可选**：工具自带的跨会话能力（claude-mem / codex resume / cursor history）——
  只做补充，不强制；不能用作 cross-tool 真相源（不同工具看不到彼此的 session 历史）

跨工具协作时，所有"上次决定 / 上次踩坑"必须落盘到 `docs/memory/*.md` 才算共享知识。

## Copilot 特定提示

- **自动加载机制**：GitHub Copilot 在仓库内自动读取 `.github/copilot-instructions.md`
  作为 repository-level instructions。无需额外配置；新增/修改本文件后，
  打开新 chat 即生效（编辑器侧补全可能需要重启 Copilot）。
- **Copilot Chat / Coding Agent**：本文件对 Chat 与 Coding Agent 都生效；
  Coding Agent 派发 PR 任务时也以本文件为 system context。
- **Copilot 无原生 cross-session memory**：Chat 历史不跨会话保留，更不跨工具。
  跨会话/跨工具状态全部依赖 `docs/memory/*.md`（kernel Project Memory 段）。
- **缺 CLI 时**：在 IDE 终端跑 `harness install --doctor` 探测；如无 node 环境，
  按 kernel #4 的 Tier 3 markdown fallback 手算 7-field route object。
- **PR / commit 边界**：Copilot Coding Agent 自动开 PR 时，须遵守 kernel #3
  hard-floor 与 #6 refusal —— 不能用 Copilot 自动化绕过 push-check。
