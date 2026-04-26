# Codex Agent Configuration — Harness Workflow

本配置让 Codex CLI 接入 [Harness 工作流](/Users/twelve/Music/myskills/docs/ARCHITECTURE.md) — 与 Claude Code 共用同一套 skill / contracts / 路由。

## 三层路由（每条用户消息按以下顺序判断，禁止跳层）

```
L0  task-dispatcher   消息含 ≥2 独立子任务 → 派 sub-agent 并行；单任务 → 进 L1
L1  入口分发：
      代码任务（做/加/修/改/实现/重构/优化/debug）→ Skill(harness-workflow)
      生命周期（接入/初始化/维护/扫描/install/doctor）→ harness <cmd> 或 --flag
      纯查询/解释/读代码         → 直接答
L2/L3 自动派发到 leaf skill   → harness route CLI（Tier 1+2）或 profile-entry markdown（Tier 3）
                              → harness-{quick,bugfix,feature,refactor}
```

## 7 Kernel Rules（与 Claude Code byte-equal）

1. **profile-resolve** — 先读 `.harness-profile` marker，没有就跑 matchers，应用 precedence
2. **task-type detect** — 结构性 fast-path（1 文件 < 10 行 → quick；bug 关键词 → bugfix；`/refactor` flag → refactor；其他 → feature）
3. **push-decision** — HIGH (REFUSE) / MEDIUM (ASK) / LOW (auto) 三档；公司 `hard_floor` 含 `auto_push` 永远 HIGH
4. **hard-floor enforcement** — 6 个 flag 不可被任何 override 突破：`auto_push / force_push / destructive_ops / auto_merge / rewrite_history / network_install`
5. **memory write** — `docs/memory/*.md` 为单一权威源（cross-tool）；codex resume / claude-mem 等是 optional acceleration
6. **drift check** — managed file 偏离 → `harness doctor` / `harness maintain`
7. **knowledge retrieval** — Stage -0.5 读 `docs/harness/knowledge/INDEX.md`，注入 binding rules

## 铁律

- 看到自己想 Edit/Write 业务代码之前 — 必须先 Skill(harness-workflow)
- 看到自己想连续跑 3+ Bash 之前 — 必须先 Skill(task-dispatcher) 评估分解
- 用户给的是生命周期类任务 — 优先 `harness <cmd>` 而不是手写一堆 `ln -s` / `cat > settings.json`
- 命中 hard_floor 的操作直接 REFUSE，不询问 / 不可被 flag 绕过

## 完整规则源

- 架构文档：`/Users/twelve/Music/myskills/docs/ARCHITECTURE.md`
- 16 narrative contracts：`/Users/twelve/Music/myskills/harness-common/contracts/`
- CLI 命令文档：`/Users/twelve/Music/myskills/packages/harness-cli/README.md`
- 无 CLI 环境接入：`/Users/twelve/Music/myskills/docs/setup-without-cli.md`

## 快查表

| 用户说 | 应该走 |
|--------|--------|
| "修一下登录 bug" | L0(单) → L1.A → harness-workflow → harness-bugfix |
| "接入 harness" | L0(单) → L1.B → `harness init` |
| "看看这个文件" | L0(单) → L1.C → 直接 Read |
| "修 bug + 调研免费额度 + 写文档" | L0(三任务) → task-dispatcher 派 3 个并行 |
| "改个 typo" | L0(单) → L1.A → harness-workflow → profile-entry fast-path → harness-quick |
| "把 utils.ts 拆成 3 个模块" | L0(单) → L1.A → harness-workflow → `--refactor` → harness-refactor |
