# 8-Stage 自治工作流详解

> 每个 Stage 定义：谁执行、输入什么、输出什么、何时跳过、自治行为。

---

## Stage 0: 需求分析（team-pd）

**何时做**：M/L/XL 级任务。S 级跳过。

**执行方式**：调用 team-pd skill 或以 PD 角色直接分析（不走问答循环）。

**输入**：用户原始需求文本 + 现有 CLAUDE.md + docs/STATE.json

**输出**：
- 更新 STATE.json 的需求条目
- 简要 PRD 摘要（内联在对话中，不生成独立文件）

**自治行为**：
- 直接分析输出，不向用户提问
- S 级任务完全跳过此 Stage

**Prompt 模板** → 见 [../prompts/pd-prompt.md](../prompts/pd-prompt.md)

---

## Stage 1: 架构审查（team-architect）

**何时做**：仅 L/XL 级任务。S/M 级跳过。

**执行方式**：调用 team-architect skill 或以 Architect 角色分析。

**输入**：Stage 0 需求摘要 + CLAUDE.md 现有 ADR 段

**输出**：
- 新 ADR 追加到 CLAUDE.md（如有架构变更）
- 或确认 "无需架构变更"

**自治行为**：
- 参考已有 ADR 历史 + 现有代码模式，自主决策
- 不向用户请求架构审批

**Prompt 模板** → 见 [../prompts/architect-prompt.md](../prompts/architect-prompt.md)

---

## Stage 2: 规划

**何时做**：永不跳过，所有规模级别都需要。

**执行方式**：调用 `superpowers:writing-plans`（Opus 模型）。

**输入**：需求 + 架构决策（如有）+ .harness-context.json 技术栈信息

**输出**：`docs/superpowers/plans/round-N-<topic>.md`

**自治行为**：
- 直接写 plan 并进入下一 Stage，不等用户审批
- Plan 中的测试命令从 .harness-context.json 读取，不硬编码

**⚠️ 强制：Stage 2 开始时 MUST 创建心跳**

1. 创建 `.harness-status.json`（根目录，已在 .gitignore 中）：
   ```json
   {
     "roundId": <N>,
     "topic": "<round 主题>",
     "scale": "<S|M|L|XL>",
     "startedAt": "<ISO 8601>",
     "cronJobId": "",
     "currentStage": 2,
     "stages": []
   }
   ```
2. 调用 `CronCreate`（频率 5 分钟），将返回的 job ID 写入 `.harness-status.json` 的 `cronJobId` 字段
3. Cron prompt 内容见 [monitoring.md](monitoring.md) 的 "心跳 Cron Prompt" 段

**如果 PostToolUse hook（`heartbeat-check.sh`）输出了 "⚠️ HEARTBEAT MISSING" 警告，Claude MUST 在下一次回复中立即创建 `.harness-status.json` + `CronCreate`，然后才能继续其他工作。** 这条规则没有例外 — S 级也不跳过心跳。

这是防 drift 的最后一道保险：即使 Claude 在 Stage 2 忘了创建心跳，hook 会在下一次 tool call 后自动提醒，规则又要求"看到提醒必须立刻处理"。

---

## Stage 3: 实现（senior-dev + junior-dev）

**何时做**：永不跳过。

**执行方式**：调用 `superpowers:subagent-driven-development`，按 plan 派发子 agent。

**模型分配**：
- 1-2 文件的机械任务（CRUD、配置、简单函数）→ Sonnet（junior-dev 角色）
- 多文件集成、架构相关、核心模块 → Opus（senior-dev 角色）

**输入**：Plan 文档中的 Task 列表

**输出**：代码 + 测试 + commit（不 push）

**并行规则**：
- Plan 中互不依赖的 Task 可并行
- 修改同一文件的 Task 必须串行

**自治行为**：
- 按 plan 顺序执行，不请求用户确认
- 遇到问题先尝试自己解决，解决不了用 NEEDS_CONTEXT 上报

---

## Stage 4: Spec 审查

**何时做**：永不跳过。

**执行方式**：派发 spec-reviewer subagent（Sonnet）。

**输入**：Plan 需求 + 实际代码 diff

**输出**：✅ 通过 或 ❌ 问题列表

**自治行为**：
- 不通过 → 自动修复（同一实现 subagent 或新 subagent）
- 修复后重新审查
- 最多 3 轮修复（遵循升级协议），仍不通过 → 记录到 knownIssues 并继续

**对抗性独立验证**（融合自 gstack spec review loop）：
Spec Review 通过后，追加派遣一个**对抗性审查 subagent**（独立上下文，看不到之前的审查过程）：
- 审查指令：「找出这个实现中的设计缺陷、遗漏的边界情况、和与需求不一致的地方。你的目标是找问题，不是确认通过。」
- 5 个维度：完整性 / 一致性 / 清晰度 / 范围 / 可行性
- 输出质量评分（1-10）。得分 < 7 → 发现列入上方同一个修复循环（共享 3 轮预算，不额外增加轮次）
- subagent 失败或超时 → 跳过，不阻塞流程
- 注意：对抗性审查是**只读信号**，其发现合并到主修复流程中，不开启独立的修复循环

---

## Stage 5: 质量审查（codex 跨模型）

**何时做**：永不跳过。

**执行方式**：
1. 调用 `codex:rescue` 进行跨模型审查
2. 同时调用 superpowers code-reviewer
3. L/XL 级任务额外调用 `multi-agent-collab` 做争议点讨论

**输入**：base SHA → HEAD SHA 的 diff

**输出**：Critical / Important / Minor 问题列表

**自治行为（融合 gstack auto-fix + ASK 批处理）**：

问题分两类处理：
- **机械问题**（格式、命名、死代码、import 顺序、类型标注）→ 自动修复，不询问
- **非机械问题**（架构、逻辑、设计缺陷）→ 分级处理：
  - Critical → 自动修复，修复后重新审查（最多 3 轮，遵循升级协议）
  - Important → autonomous_mode 下自动采纳；否则批量呈现给用户一次决策
  - Minor → 跳过，不修

3 轮 Critical 修不好 → 升级给用户

---

## Stage 6: QA 测试（team-qa）

**何时做**：M/L/XL 级。S 级且无逻辑变更时跳过。

**执行方式**：调用 team-qa skill（Sonnet）。

**输入**：变更文件列表 + 现有测试 + .harness-context.json 中的 testCommand

**输出**：测试报告（覆盖率、新增测试、P0 bug 列表）

**自治行为**：
- P0 Bug → 自动修复并重新测试
- 测试命令从 .harness-context.json 读取，不硬编码
- 只有检测到前端 UI 时才写 E2E 测试

**Prompt 模板** → 见 [../prompts/qa-prompt.md](../prompts/qa-prompt.md)

---

## Stage 7: 安全审查（team-security）

**何时做**：L 级涉及安全敏感操作时，以及所有 XL 级。

**跳过条件**：S/M 级；L 级但不涉及认证/权限/用户输入/数据删除。

**执行方式**：调用 team-security skill（Sonnet）。

**输入**：代码 diff + .harness-context.json 中的 auditCommand

**输出**：安全审查报告，CRITICAL 阻塞提交

**自治行为**：
- 漏洞 → 自动修复并重新扫描
- 依赖审计命令从 .harness-context.json 读取

**Prompt 模板** → 见 [../prompts/security-prompt.md](../prompts/security-prompt.md)

---

## Stage 8: 收尾（Coordinator）

**何时做**：永不跳过。

**执行者**：主 agent 自身。

**操作清单**：
1. **STATE.json** — 追加 completedRound，更新 features/knownIssues
2. **WALKTHROUGH.md** — 追加本轮记录
3. **CLAUDE.md** — 如有新 ADR 或 gotcha，更新
4. **claude-mem** — 写本轮 observation
5. **CronDelete** — 无条件删除心跳 cron job
6. **删除 .harness-status.json** — 清理临时状态文件
7. **git commit**（仅 commit，**不自动 push**）
   - 在最终报告输出**之后**，可以问一句「要推送到远程吗？」
   - 用户同意才 push，不同意就保留本地
   - 绝不静默自动 push
8. **检查 pendingRounds** — 有则自动启动下一轮，无则输出最终报告

### 最终报告格式

```
╔══════════════════════════════════════════════════╗
║  ✅ Round N 完成 — <topic>                       ║
╠══════════════════════════════════════════════════╣
║  📋 需求: <摘要>                                  ║
║  📐 规模: S/M/L                                  ║
║  ⏱  耗时: Xm Ys                                 ║
║                                                  ║
║  Stage 0  需求分析    ✅/⏭  Xm Ys  <摘要>        ║
║  Stage 1  架构审查    ✅/⏭  Xm Ys  <摘要>        ║
║  ...                                             ║
║                                                  ║
║  📦 产出: N 文件 · N commits · N 测试             ║
║  📝 文档: STATE.json + WALKTHROUGH.md 已更新       ║
╚══════════════════════════════════════════════════╝
```

### 感知验证引导

最终报告之后，必须告诉用户**怎么亲自验证这轮改动生效了**。不是列文件，是给具体操作步骤。

根据改动类型生成对应的验证指引：

| 改动类型 | 验证引导示例 |
|---------|------------|
| 新 API | 「跑 `curl http://localhost:3000/api/xxx`，应该看到 {...}」 |
| UI 变更 | 「打开 http://localhost:3000/xxx，点击 [按钮]，应该看到 [效果]」 |
| Bug 修复 | 「重复之前的操作步骤：[具体步骤]，现在应该不再出现 [问题]」 |
| 配置/重构 | 「跑 `{testCommand}`，全部通过即可。功能表现和之前一致」 |
| 新 Skill/文档 | 「在 Claude Code 中输入 `/skill-name`，应该能触发并看到 [预期行为]」 |

格式：

```
🧪 验证方式
1. [具体操作步骤]
2. [预期看到什么]
3. [如果不对，检查什么]
```

这一段跟在最终报告的产出统计之后、自检清单之前。

### 自检清单

```
- [ ] Plan doc 在 docs/superpowers/plans/
- [ ] 编译通过 + 测试通过
- [ ] Spec Review 通过（或跳过）
- [ ] Codex Review 无 CRITICAL
- [ ] QA 测试通过（或跳过）
- [ ] Security 审查通过（或跳过）
- [ ] STATE.json 已更新
- [ ] WALKTHROUGH.md 已追加
- [ ] CLAUDE.md 已更新（如有 ADR）
- [ ] claude-mem observation 已写入
- [ ] CronDelete 已执行
- [ ] .harness-status.json 已删除
- [ ] git commit 完成（push 需用户确认）
```

**任何一项未通过，Round 未完成。不要开始下一轮。**

---

## 代码质量底线（技术栈无关）

这些底线从 .harness-context.json 自动适配：

- **类型安全**：TypeScript strict / Python type hints / Go vet
- **测试**：新功能必须有测试，命令从 context.testCommand 读取
- **构建**：每轮结束前必须构建通过，命令从 context.buildCommand 读取
- **代码规范**：如项目有 linter，必须通过，命令从 context.lintCommand 读取
- **设计规范**：如项目有 DESIGN.md，UI 组件必须使用 token
