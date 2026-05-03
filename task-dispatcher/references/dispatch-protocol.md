# 派发协议

派发 sub-agent 时，主 agent **必须**做到：

## 1. 完整 briefing
Sub-agent **没有**本次对话的任何上下文。必须包含：
- **做什么**：明确目标，不含歧义
- **看哪些文件**：给出绝对路径或 glob pattern
- **返回格式**：「300 字以内报告」或「改完代码后跑 `npx tsc --noEmit` 验证」
- **不碰什么**：明确边界

## 2. 不重叠边界
> "Agent A 处理 `src/extensions/` 下的文件，Agent B 处理 `tests/`" — **绝不让两个 agent 编辑同一个文件**。

如果两个子任务需要改同一个文件 → 必须串行（一个 agent 做完再派另一个，或主 agent 自己做）。

## 3. 输出预期
每个 agent 必须知道返回什么：
- 调研型：「列出 3 个方案 + 推荐 + 理由」
- 代码型：「改完文件 + 验证命令输出」
- 探索型：「文件清单 + 关键代码片段」

## 4. Background 执行
所有派发的 agent 使用 `run_in_background: true`，主 agent 继续工作或响应用户。

---

## Agent Prompt 模板

每次 Agent 派发必须遵循以下模板结构：

```
## 上下文
{1-2 句话：什么项目、第几轮、整体目标是什么}

## 你的任务
{要修改/创建的具体文件，附完整路径}
{每个文件：要改什么，如有行号请标注}

## 约束
- 你只负责这些文件：{列表}
- 不要碰：{排除的文件/目录}
- 保持与现有代码风格一致（不确定时读 CLAUDE.md）

## 验收标准
{每个修复：如何验证已生效}
- 所有变更完成后：运行 `npx tsc --noEmit` — 必须零错误通过
- 如果 tsc 失败：自行修复错误，重新验证，最多 3 次
- 如果 3 次后仍失败：用 `git checkout -- {files}` 回退变更并报告错误

## 返回格式
200 字以内报告：
1. 修改的文件（路径 + 改了什么）
2. tsc 结果（通过/失败）
3. 遇到的任何问题
```

---

## 5. 模型选择 — 必须 Opus，不锁版本号

调用 `Agent` 工具派 sub-agent 时，**必须**显式传 `model: "opus"` 参数，覆盖 sub-agent frontmatter 默认。

写 `"opus"` 而不是 `"opus-4-7"` —— 不锁版本号，未来 Opus 5 出来不需要改 skill。

### 为什么默认要覆盖

主线 session 通常是 Opus（用户全局 settings.json 配 `"model": "opus[1m]"`），但 sub-agent 默认行为不一致：

- `codex:codex-rescue` frontmatter 硬编码 `model: sonnet`（OpenAI plugin 默认走便宜模型）
- `Explore` / `Plan` / `general-purpose` / `doc-writer` 等内置 agent 没声明 model，**默认 Sonnet**
- 只有 `code-reviewer` 是 `model: inherit` 跟随父级

不传 model 参数 = sub-agent 默认行为会落到 Sonnet，规划/审核质量受影响。

### 好的写法

```
Agent({
  description: "Codex review",
  subagent_type: "codex:codex-rescue",
  model: "opus",
  prompt: "..."
})
```

### 唯一上位覆盖

用户明确指定其他模型（如"用 sonnet 跑快点""用 haiku 省 token"）。除此之外不留例外。

### 运行时兜底

如果运行时（如 Codex CLI、第三方 agent runtime）不支持 `model` 参数 → 改用平台默认模型，并在派发 prompt 里显式记录原因。

### 辐射规则

- task-dispatcher 派 sub-agent 时也要把 model 透传给每个子任务
- harness-workflow 内部 invoke profile-entry → 叶子 skill 时如果起 sub-agent，同样
