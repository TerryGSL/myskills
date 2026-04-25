# 并行 Agent 开发与多终端协作

## Agent Team 角色

```
┌─────────────────────────────────────────────────────────┐
│                    Coordinator (你/主 Claude)             │
│  职责: 读 STATE.json → 写 plan doc → 分派任务 → 收尾     │
│  工具: 全部                                              │
│  模型: Claude Opus (需要全局视野)                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Implementer A│  │ Implementer B│  │ Implementer C│  │
│  │  (subagent)  │  │  (subagent)  │  │  (terminal)  │  │
│  │  Task 1,3    │  │  Task 2,4    │  │  Task 5      │  │
│  │  Opus   │  │  Opus   │  │  Opus │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                 │                 │           │
│         └────────┬────────┘                 │           │
│                  ▼                          ▼           │
│  ┌──────────────────────┐  ┌──────────────────────┐    │
│  │    Spec Reviewer     │  │   Quality Reviewer   │    │
│  │    (subagent)        │  │   (/codex:rescue)    │    │
│  │    对照 spec 检查     │  │   GPT-5.4 跨模型审查 │    │
│  └──────────────────────┘  └──────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 方式一：同一会话内 subagent 并行

用 Claude Code 的 `Agent` 工具在**一条消息中**启动多个 subagent：

```
Coordinator 在 Stage 2 分派：

Agent({
  description: "Implement feature A",
  prompt: "读取 docs/superpowers/plans/round5.md 的 Task 1。按 CLAUDE.md 规范实现...",
  subagent_type: "general-purpose"
})

Agent({
  description: "Implement feature B",
  prompt: "读取 docs/superpowers/plans/round5.md 的 Task 2。按 CLAUDE.md 规范实现...",
  subagent_type: "general-purpose"
})
```

### 什么时候用 subagent 并行

| 场景 | 用并行 | 原因 |
|------|--------|------|
| 2+ 独立任务，不共享文件 | ✓ | 无冲突，直接并行 |
| 前端组件 A + 后端 API B | ✓ | 不同目录，无冲突 |
| 同一文件的两处修改 | ✗ | 会冲突，串行 |
| Task B 依赖 Task A 的输出 | ✗ | 有数据依赖，串行 |
| i18n 同步 11 个 locale 文件 | ✓ | 互不影响，可并行 |

### subagent prompt 必须包含

1. **plan doc 路径** — agent 没有对话上下文，必须告诉它读哪个文件
2. **CLAUDE.md 路径** — 编码规范
3. **DESIGN.md 路径** — UI 规范（如果是前端任务）
4. **具体任务编号** — "执行 plan 中的 Task 2"
5. **自测指令** — "完成后运行 `pnpm tsc --noEmit && pnpm test`"
6. **commit 指令** — "自测通过后 commit，消息格式 `feat(round N): ...`"

### 用 worktree 隔离（推荐用于大任务）

```
/superpowers:using-git-worktrees
```

每个 subagent 在独立 worktree 中工作，完全避免文件冲突。完成后合并回主分支。

---

## 方式二：多终端窗口并行开发

适合更大规模的并行，或者需要人工介入的场景。

### 用 tmux 管理多个 Claude Code 会话

```bash
# 创建 3 个窗口的 tmux 会话
tmux new-session -s dev -n coordinator
tmux new-window -t dev -n impl-a
tmux new-window -t dev -n impl-b

# 在 coordinator 窗口: 主 Claude，负责规划和收尾
# 在 impl-a 窗口: claude --model opus，负责 Task 1-3
# 在 impl-b 窗口: claude --model opus，负责 Task 4-6
```

### 多终端协作规则

```
1. 只有 Coordinator 终端可以：
   - 写/改 STATE.json
   - 写/改 WALKTHROUGH.md
   - 写/改 CLAUDE.md
   - git push（⚠️ 仅在用户确认后执行）
   
2. Implementer 终端可以：
   - 读 plan doc / CLAUDE.md / DESIGN.md
   - 写代码 + 测试（只改自己负责的文件）
   - git commit（但不 push）
   
3. 用 git worktree 避免冲突：
   每个终端在不同 worktree 中工作
   完成后由 Coordinator 合并
```

### 多终端 + worktree 完整流程

```bash
# 1. Coordinator 创建 worktree
git worktree add .claude/worktrees/task-a -b round5-task-a
git worktree add .claude/worktrees/task-b -b round5-task-b

# 2. 每个终端进入对应 worktree
# Terminal A:
cd .claude/worktrees/task-a && claude

# Terminal B:
cd .claude/worktrees/task-b && claude

# 3. 各自完成后 commit
# (在各自的 worktree 中)

# 4. Coordinator 合并
git merge round5-task-a
git merge round5-task-b
git worktree remove .claude/worktrees/task-a
git worktree remove .claude/worktrees/task-b
```

### 什么时候用多终端 vs. subagent

| 维度 | Subagent (同一会话) | 多终端 |
|------|-------------------|--------|
| 启动速度 | 快（一条消息） | 慢（需要开 tmux + 启动 claude） |
| 上下文隔离 | 自动隔离 | 完全隔离 |
| 文件冲突 | 可能（除非用 worktree） | 用 worktree 完全避免 |
| 人工介入 | 不方便 | 方便（随时在终端输入） |
| token 消耗 | 共享主会话配额 | 各自独立配额 |
| 适合场景 | 2-4 个小任务 | 大功能拆分、需要交互式调试 |
| 协调难度 | 低（Coordinator 自动收集） | 中（需要手动合并） |

---

## 方式三：Claude Code + Codex 双 Agent 协作

用 `/multi-agent-collab` skill，Claude Code 写代码，Codex CLI 审代码：

```
Claude Code (Opus)          Codex CLI (GPT-5.4)
   │                            │
   ├── 写代码 + 测试 ──────────→ │
   │                            ├── 审查代码
   │  ←──────── 审查意见 ────────┤
   ├── 修复问题                  │
   ├── 写代码 + 测试 ──────────→ │
   │                            ├── LGTM ✓
   ├── commit + push             │
```

适用于：高质量要求的核心模块、安全敏感代码。

---

## 并行任务划分原则

### 好的划分（可并行）

```
Round 5 Plan:
  Task 1: [Impl-A] 新增 /api/hum/series CRUD      → src/app/api/hum/series/
  Task 2: [Impl-B] SeriesMode UI 组件               → src/shared/components/hum/
  Task 3: [Impl-A] series service 单元测试           → tests/ (依赖 Task 1)
  Task 4: [Impl-B] series i18n (11 locales)          → src/config/locale/
```

- Task 1 和 2 独立（不同目录）→ 并行
- Task 3 依赖 Task 1 → 串行在 Impl-A
- Task 4 独立 → 并行

### 差的划分（会冲突）

```
  Task 1: [Impl-A] 修改 hero.tsx 的样式
  Task 2: [Impl-B] 修改 hero.tsx 的逻辑
  → 同一文件！必须串行，或拆分成更细粒度
```

### 划分检查清单

```
- [ ] 每个 agent 的文件集合互不重叠？
- [ ] 没有 agent 同时修改同一个 DB schema？
- [ ] 没有 agent 同时修改同一个 locale JSON？
- [ ] 依赖关系已在 plan doc 中标注？
```
