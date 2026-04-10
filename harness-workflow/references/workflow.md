# 6-Stage 工作流详解

## Stage 0: 头脑风暴

**何时做**：新功能 / 新模块 / 用户提出新需求时。小修小补可跳过。

```
/superpowers:brainstorming
```

两轮澄清：
1. **需求对齐**：解决什么问题？用户期望？边界？
2. **工程对齐**：怎么实现？影响哪些文件？有没有现有 pattern 可复用？

输出：明确的需求范围 + 初步技术方案（在对话中对齐即可，不需要写文件）。

**反模式**：
- "这个需求很简单，直接开写" → 往往漏掉边界情况
- "用户说了做什么，不需要讨论" → 用户说了 WHAT，你需要确认 HOW

---

## Stage 1: 规划

**必做**：每轮开始前写 plan doc。

```
/superpowers:writing-plans
```

保存到 `docs/superpowers/plans/YYYY-MM-DD-roundN.md`。模板见 [templates.md](templates.md)。

**反模式**：
- "不值得写 plan" → 写。plan doc 是未来会话的恢复依据
- "口头给 agent 说就行" → 口头 = 压缩后丢失。必须写文件

---

## Stage 2: 实现

Implementer subagent 按 plan doc 执行：

1. 读取 plan doc + CLAUDE.md + DESIGN.md
2. 写代码
3. 写对应单元测试
4. 自测：`pnpm tsc --noEmit && pnpm test`
5. 通过后 commit（不 push）

**并行开发**：plan 中互不依赖的任务，可用三种方式并行：
- **同一会话 subagent**：用 Agent 工具在一条消息中启动多个 Implementer
- **多终端 + worktree**：tmux 开多窗口，每个终端在独立 worktree 中工作
- **Claude + Codex 双 Agent**：Claude 写代码，GPT-5.4 审代码

详细操作 → 见 [parallel-agents.md](parallel-agents.md)

### 代码质量底线

- TypeScript strict mode，no `any`
- 颜色用 DESIGN.md token，不硬编码
- 用户可见文案用 `useTranslations()`
- 新组件 mobile-first
- hook 自动拦截 inline style 和硬编码色值

---

## Stage 3: Spec Review

Spec Reviewer subagent 对照 `docs/superpowers/specs/` 检查：

1. 功能匹配 spec 行为？（不多不少）
2. 数据流匹配 spec 接口？
3. 组件结构匹配 spec 组件树？
4. spec 未覆盖的细节标注为 "spec gap"

**输出**：pass / fail / pass-with-notes
- fail → 打回 Stage 2
- pass-with-notes → 可继续，记录到 knownIssues

**可跳过场景**：本轮没有对应 spec（纯 bug fix / 基础设施维护）→ 记录 "Spec Review: N/A"

---

## Stage 4: Quality Review（Codex 跨模型审查）

**不可跳过**。跨模型审查防止同一模型盲区。

```
/codex:rescue
```

GPT-5.4 独立审查，输出分级：

| 级别 | 处理 |
|------|------|
| CRITICAL | **必须修复**，修复后重新审查 |
| WARNING | 评估后修复或 defer 到 knownIssues |
| INFO | 选择性采纳 |

---

## Stage 5: 收尾

Coordinator 在所有审查通过后：

1. **STATE.json** — 追加 round，更新 summary/features
2. **WALKTHROUGH.md** — 追加本轮记录
3. **CLAUDE.md** — 如有新 ADR 或 gotcha，更新
4. **claude-mem** — 写本轮 observation
5. **memory files** — 如有新认知，更新
6. **git commit + push**

### 自检清单

```
- [ ] Plan doc 在 docs/superpowers/plans/
- [ ] TypeScript 编译 + 测试通过
- [ ] Spec Review 通过（或 N/A）
- [ ] Codex Review 无 CRITICAL
- [ ] STATE.json 已更新
- [ ] WALKTHROUGH.md 已追加
- [ ] CLAUDE.md 已更新（如有 ADR）
- [ ] claude-mem observation 已写入
- [ ] git commit + push 完成
```

**任何一项未通过，round 未完成。不要开始下一轮。**
