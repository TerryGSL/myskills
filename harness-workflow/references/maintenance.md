# 维护与恢复

## 日常维护检查（`--maintain` 模式）

```
1. STATE.json.currentRound  vs  git log 实际轮次        → 落后？
2. WALKTHROUGH.md 最后条目  vs  STATE.json.completedRounds → 一致？
3. CLAUDE.md ADR 数量       vs  代码中实际架构决策         → 遗漏？
4. memory 文件描述           vs  实际代码状态              → 过时？
5. git status               vs  是否有遗漏的 round？      → 未提交？
```

不一致 → **先同步文件，再写代码**。

---

## Drift 恢复流程

当持久化文件严重落后时（STATE.json 比 git log 差 3+ 轮）：

### 检测信号

- STATE.json.completedRounds 远小于 git log 实际 commit 数
- WALKTHROUGH.md 最后 commit hash 不是 git log 最新
- CLAUDE.md 缺少最近新增模块的 ADR
- memory 文件描述的 "current state" 与代码不符

### 恢复步骤

1. **暂停编码**。不要在过时的基础上继续建
2. `git log --oneline` 确认实际状态
3. 更新 STATE.json：补齐缺失 rounds，纠正 summary
4. 更新 WALKTHROUGH.md：合并缺失 rounds 为概要条目
5. 更新 CLAUDE.md：补齐 ADR 和 gotchas
6. 更新 memory 文件：刷新 "current state"
7. 提交：`git commit -m "chore: sync persistent files to Round N"`
8. 然后才开始新 round

### Red-flag 自检

| 想法 | 意味着你在 drift |
|------|----------------|
| "跳过 plan doc，就几个小任务" | plan doc 是未来会话的恢复依据 |
| "让测试当 reviewer" | codex 抓测试覆盖不到的盲区 |
| "STATE.json 等做完再更新" | context compress 后就忘了 |
| "CLAUDE.md 过时了回头补" | 过时的 CLAUDE.md 误导下一个会话 |
| "用户很忙，他就想要进度" | 进度 + 过程 = 可持续；进度 - 过程 = 债 |

---

## Auto Memory vs. Claude-mem

| 维度 | Auto Memory (Claude Code 内置) | Claude-mem (插件) |
|------|------|------|
| 位置 | `~/.claude/projects/{hash}/memory/` | `~/.claude/plugins/claude-mem/data/` |
| 格式 | Markdown 文件 + MEMORY.md 索引 | SQLite + semantic embedding |
| 搜索 | 每次会话自动加载 MEMORY.md | `/mem-search` 语义搜索 |
| 适合 | 用户偏好、工作流规则、项目上下文 | 每轮变更记录、技术发现、bug 修复 |

### 存在哪里？

- 未来每个会话都需要 → Auto Memory（自动加载）
- 按需搜索即可 → Claude-mem observation
- 用户偏好 → Auto Memory (feedback type)
- 技术事实 / 变更记录 → Claude-mem observation
- 会过时需手动维护 → 审慎存入 Auto Memory
- 历史快照不会过时 → Claude-mem observation

### Memory 文件格式

```markdown
---
name: {name}
description: {一行描述}
type: {user | feedback | project | reference}
---
{内容}
```

MEMORY.md 索引每行 <150 字符：
```markdown
- [Title](file.md) — one-line hook
```

---

## `--maintain` memory audit (new in v1.0.0)

Every `--maintain` invocation runs contract-level drift checks on the target project's `docs/memory/`:

### 1. Contract validation
- Load `.harness-memory.yml`
- Fail closed if malformed → `BLOCKED`, report to user
- Validate hard constraints (forbidden_paths non-empty, no broad unscoped owned_paths, schema_version compatible)

### 2. HTML marker conflicts review
- For each `MEMORY.md` / `ERRORS.md` file, find `<!-- harness-memory:start -->` / `<!-- harness-errors:start -->` blocks
- If any block contents differ from harness's last known state (stored in `audits.conflicts`), surface to user
- User chooses: keep edit (remove from conflicts) or revert to harness version

### 3. Suspect detection
- For every `suspect_rules[]` in contract:
  - Compute `git diff --name-only HEAD~30..HEAD` (last 30 commits as "recent change window")
  - If any `applies_to` fires, mark referenced cases `freshness.state: suspect`

### 4. Archive sweep
- Scan `docs/memory/cases/harness_*.md`
- If `freshness.last_used` older than `archive_policy.archive_after_days_unused` (default 180) → move to `archive/`

### 5. Scorecard rotation
- If `docs/memory/harness_reviewer_scorecard.yml` has > 500 reviews → rotate older entries to `archive/harness_reviewer_scorecard_<year>.yml`

### 6. Audit timestamp update
- Update `audits.last_full_audit` / `audits.last_error_audit` / `audits.last_reviewer_score_audit` in `.harness-memory.yml` per the subtask that ran

Full runtime details → `references/memory.md` §5.3.
