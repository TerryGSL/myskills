---
name: multi-agent-collab
description: Claude Code + Codex CLI 双Agent协同编程。Claude Code 作为指挥官负责分析需求和编写代码，Codex CLI 负责验证方案和审核代码，双方通过文件交换信息、讨论直到达成一致后再实施。适用于复杂需求、高质量编码任务。使用 tmux + done-flag 机制实现异步协作。
version: 1.0.0
---

# Multi-Agent Collaboration Skill

Claude Code (你) 作为指挥官，通过 tmux 调度 Codex CLI，用文件交换信息，用 done-flag 实现秒级通知。

## 核心理念

- **慢就是快**：复杂需求不急着写代码，先讨论、先达成一致
- **说人话**：像安排人类同事一样安排 AI，不需要复杂的编排
- **双重保险**：两个不同的 AI 模型交叉验证，减少盲区

## 总体流程

```
用户下指令 → [分析] → [验证] → [讨论] → [实施] → [审查] → 完成
               Claude    Codex    互相辩论   Claude    交叉审查
               Phase 1   Phase 2  Phase 3    Phase 4   Phase 5
                                  (最多5轮)
```

---

## Phase 0: 初始化协作环境

每次协作启动时，**必须**执行以下初始化步骤：

### 1. 生成唯一 Session ID
```bash
SESSION_ID=$(date +%s | tail -c 7)
COLLAB_DIR="/tmp/agent-collab-${SESSION_ID}"
mkdir -p "${COLLAB_DIR}"
```

### 2. 创建协作目录结构
```
/tmp/agent-collab-{SESSION_ID}/
├── task.md                  # 用户原始需求
├── claude-analysis.md       # Claude 的需求分析
├── codex-verification.md    # Codex 的验证结果
├── discussion/
│   ├── round-1-claude.md    # 讨论第1轮 - Claude 观点
│   ├── round-1-codex.md     # 讨论第1轮 - Codex 回复
│   ├── round-2-claude.md    # 讨论第2轮 ...
│   └── ...
├── consensus.md             # 最终共识文档
├── implementation-plan.md   # 实施计划
├── codex-review.md          # Codex 代码审查结果
├── final-summary.md         # 最终总结
└── .done-*                  # done-flag 标志文件
```

### 3. 创建 wait-for-codex 脚本 (如不存在)
检查 `~/.claude/skills/multi-agent-collab/scripts/wait-for-codex.sh` 是否存在，不存在则创建（内容见 scripts 目录）。

### 4. 向用户汇报初始化完成
```
--- [Phase 0/5] 协作环境初始化完成 ---
Session ID: {SESSION_ID}
协作目录: /tmp/agent-collab-{SESSION_ID}/
参与者: Claude Code (Opus) + Codex CLI
准备进入 Phase 1: 需求分析
---
```

---

## Phase 1: 需求分析 (Claude Code 主导)

### 目标
Claude Code 深入分析用户需求，产出结构化的需求分析文档。

### 步骤

1. **阅读项目代码**：通读相关代码文件，理解现有架构
2. **分析需求**：理解用户意图，识别技术难点
3. **产出分析文档**：写入 `${COLLAB_DIR}/claude-analysis.md`，包含：
   - 需求摘要
   - 技术方案（建议使用表格、流程图、ASCII 原型图辅助表达）
   - 涉及的文件和模块
   - 潜在风险点
   - 需要用户决策的问题（如有）

4. **如有需要用户决策的问题**，暂停并询问用户，等用户回复后再继续

5. **向用户汇报**：
```
--- [Phase 1/5] Claude 需求分析完成 ---
需求摘要: {一句话概述}
技术方案要点:
  - {要点1}
  - {要点2}
  - {要点3}
预计影响文件: {N} 个
Next: 发送给 Codex 进行方案验证
---
```

---

## Phase 2: 方案验证 (Codex CLI 主导)

### 目标
将 Claude 的分析发送给 Codex，让 Codex 独立验证方案的可行性。

### 调度方式选择

**短任务 (预计 < 2分钟)**：使用 `codex exec` 阻塞模式
```bash
codex exec --full-auto -q "$(cat ${COLLAB_DIR}/codex-verify-prompt.md)" 2>&1 | tee ${COLLAB_DIR}/codex-verification.md
```

**长任务 (预计 >= 2分钟)**：使用 tmux + done-flag
```bash
# 创建 tmux 会话
tmux new-session -d -s "collab-${SESSION_ID}-codex-verify" \
  "codex exec --full-auto -q \"$(cat ${COLLAB_DIR}/codex-verify-prompt.md)\" > ${COLLAB_DIR}/codex-verification.md 2>&1; touch ${COLLAB_DIR}/.done-verify"

# 使用 watcher 等待完成
bash ~/.claude/skills/multi-agent-collab/scripts/wait-for-codex.sh ${COLLAB_DIR} verify
```

### Codex 验证 Prompt 模板

写入 `${COLLAB_DIR}/codex-verify-prompt.md`：
```markdown
你是一位资深代码审查专家。请验证以下技术方案的可行性。

## 项目上下文
{项目根目录路径}

## 需求分析 (来自 Claude Code)
{claude-analysis.md 的内容}

## 你的任务
1. 阅读项目代码，验证方案是否可行
2. 对每个技术要点给出 [AGREE] 或 [DISAGREE] + 理由
3. 如有更好的方案，请提出替代建议
4. 识别 Claude 可能遗漏的风险点

## 输出格式
对每个要点：
- [AGREE/DISAGREE] {要点描述}
  理由: {详细理由}
  替代方案: {如有}

总体评估: {PASS/NEEDS_DISCUSSION}
```

### 向用户汇报
```
--- [Phase 2/5] Codex 方案验证完成 ---
Codex 评估:
  - [AGREE] {要点1}
  - [DISAGREE] {要点2} → 建议: {替代方案}
总体评估: {PASS/NEEDS_DISCUSSION}
Next: {如果全部 AGREE → 跳到 Phase 4 实施 | 否则 → 进入 Phase 3 讨论}
---
```

---

## Phase 3: 讨论环节 (双方辩论，最多5轮)

### 触发条件
Codex 在 Phase 2 中有 `[DISAGREE]` 项，或总体评估为 `NEEDS_DISCUSSION`。

### 讨论机制

每轮讨论包含两步：

**Step A: Claude 回应 Codex 的异议**
- 阅读 Codex 的反馈
- 对每个 DISAGREE 项：接受 / 反驳 / 提出折中方案
- 写入 `${COLLAB_DIR}/discussion/round-{N}-claude.md`

**Step B: 发送给 Codex 继续讨论**
- 将 Claude 的回应发送给 Codex
- Codex 回复写入 `${COLLAB_DIR}/discussion/round-{N}-codex.md`

### Codex 讨论 Prompt 模板
```markdown
我们正在讨论一个技术方案。这是第 {N} 轮讨论。

## 之前的共识和分歧
{之前所有轮次的摘要}

## Claude Code 的最新回应
{round-N-claude.md 的内容}

## 你的任务
对 Claude 的每个观点：
- [ACCEPT] 如果你被说服了
- [INSIST] 如果你仍然坚持，给出更详细的理由
- [COMPROMISE] 如果你有折中方案

最终立场: {CONSENSUS_REACHED / CONTINUE_DISCUSSION}
```

### 每轮向用户汇报
```
--- [Phase 3/5] 讨论第 {N} 轮 ---
Claude 立场:
  - {观点1}: {接受/反驳/折中}
Codex 立场:
  - {观点1}: {ACCEPT/INSIST/COMPROMISE}
共识状态: {已达成 / 继续讨论 / 第N轮，还剩M轮}
---
```

### 退出条件
- **达成共识**：所有分歧项都解决
- **达到5轮上限**：由 Claude Code 综合双方观点做最终决策，并告知用户
- **需要用户介入**：如果分歧涉及产品决策，暂停并询问用户

### 生成共识文档
讨论结束后，Claude Code 生成 `${COLLAB_DIR}/consensus.md`，包含：
- 最终方案（综合双方观点）
- 每个争议点的结论
- 实施优先级

---

## Phase 4: 代码实施 (Claude Code 主导)

### 目标
根据共识文档，Claude Code 编写代码。

### 步骤

1. **生成实施计划**：写入 `${COLLAB_DIR}/implementation-plan.md`
   - 按文件列出修改内容
   - 标注修改顺序和依赖关系

2. **逐步实施**：
   - 按计划逐个文件修改
   - 每完成一个关键模块，输出进度

3. **自检**：
   - 运行相关测试（如有）
   - 检查是否有明显遗漏

4. **向用户汇报**：
```
--- [Phase 4/5] 代码实施完成 ---
修改文件:
  - {file1}: {修改描述}
  - {file2}: {修改描述}
测试结果: {通过/失败}
Next: 发送给 Codex 进行代码审查
---
```

---

## Phase 5: 代码审查 (Codex CLI 主导)

### 目标
Codex 审查 Claude Code 编写的代码，确保质量。

### 方式一：使用 codex review 命令（推荐）
```bash
codex review 2>&1 | tee ${COLLAB_DIR}/codex-review.md
```

### 方式二：使用 codex exec 自定义审查
```bash
codex exec --full-auto -q "$(cat ${COLLAB_DIR}/codex-review-prompt.md)" > ${COLLAB_DIR}/codex-review.md 2>&1; touch ${COLLAB_DIR}/.done-review
```

### Codex 审查 Prompt 模板（方式二使用）
```markdown
请审查最近的代码修改。

## 需求背景
{consensus.md 的内容}

## 你的任务
1. 检查代码是否完整实现了需求
2. 检查代码质量：命名、结构、可读性
3. 检查潜在 bug 和边界情况
4. 检查安全性问题
5. 检查性能问题

## 输出格式
对每个发现：
- [CRITICAL/WARNING/SUGGESTION] {文件:行号} {描述}

总体评估: {APPROVED / CHANGES_REQUESTED}
```

### 处理审查结果

**如果 APPROVED**：
```
--- [Phase 5/5] Codex 代码审查通过 ---
审查结果: APPROVED
{如有 SUGGESTION，列出建议}
任务完成！
---
```

**如果 CHANGES_REQUESTED**：
- Claude Code 根据反馈修改代码
- 对于不认同的审查意见，进入迷你讨论（最多2轮）
- 修改完成后重新提交审查
- 最终向用户汇报

```
--- [Phase 5/5] 代码审查 → 修改 → 重新审查 ---
Codex 提出 {N} 个问题:
  - [CRITICAL] {问题1} → 已修复
  - [WARNING] {问题2} → 已修复
  - [SUGGESTION] {问题3} → Claude 不采纳，理由: {xxx}，Codex 接受
最终结果: APPROVED
---
```

---

## Phase Final: 总结

Claude Code 生成最终总结 `${COLLAB_DIR}/final-summary.md`，并输出给用户：

```
--- 协作完成 ---
Session ID: {SESSION_ID}
任务: {需求一句话描述}
方案: {最终方案一句话}
讨论轮次: {N} 轮
修改文件: {N} 个
审查结果: {APPROVED}
协作记录: {COLLAB_DIR}/
---
```

---

## 长时间任务的特殊处理

当任务预计执行时间较长（如大规模重构、多文件修改）时：

### 使用 tmux 运行 Codex
```bash
# 启动 Codex 在 tmux 中执行长任务
tmux new-session -d -s "collab-${SESSION_ID}-codex-impl" \
  "codex exec --full-auto -q '{任务描述}' > ${COLLAB_DIR}/codex-output.md 2>&1; touch ${COLLAB_DIR}/.done-impl"
```

### 进度监控
- 每隔适当时间（如10分钟），通过 `tmux capture-pane` 读取 Codex 的实时输出
- 向用户汇报进度摘要
- 如果 Codex 进程意外退出，自动重启

```bash
# 读取 tmux 中 Codex 的当前输出
tmux capture-pane -t "collab-${SESSION_ID}-codex-impl" -p -S -100
```

### Codex 进程保活
```bash
# 检查 tmux 会话是否还在
tmux has-session -t "collab-${SESSION_ID}-codex-impl" 2>/dev/null
if [ $? -ne 0 ]; then
  echo "Codex session died, restarting..."
  # 重新启动
fi
```

---

## 使用方式

### 标准模式
用户直接描述需求，skill 自动走完 5 阶段流水线：
```
/multi-agent-collab 实现一个用户认证系统，支持 JWT + Redis session
```

### 指定跳过阶段
如果用户已有明确方案，可以跳过分析和讨论：
```
/multi-agent-collab --skip-discussion 按照这个方案实施：{方案描述}
```

### 仅审查模式
让 Codex 审查已有代码：
```
/multi-agent-collab --review-only
```

---

## 重要原则

1. **不要在达成共识前写代码** —— 先讨论，后实施
2. **Claude Code 必须有自己的独立思考** —— Codex 的意见是参考，不是命令
3. **每个阶段都要向用户汇报** —— 透明的进度让用户安心
4. **需要用户决策时主动暂停** —— 涉及产品方向的问题不要自作主张
5. **讨论中鼓励使用表格、流程图、ASCII图** —— 可视化减少误解
6. **文件交换是核心通信方式** —— 所有信息都写入协作目录，可追溯
7. **tmux 保障长任务不中断** —— 即使 Claude Code 重启，Codex 仍在工作
