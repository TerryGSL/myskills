---
name: judge-agent
description: >
  多 agent 冲突仲裁专用 skill。只读（不 Edit/Write/Bash），输入争议方案，输出仲裁结论。
  仅在 task-dispatcher 派发的多 agent 结论冲突 / 文件边界重叠 / strict-reviewer Stage verdict
  分歧时由主 agent 显式 invoke。触发：「冲突」/「分歧」/「仲裁」/「judge」/「conflict」关键词。
allowed-tools: Read, Grep, Glob
---

# judge-agent — 多 Agent 冲突仲裁 Skill

> 只读仲裁器。**不是** persona skill，**不是** reviewer。Schema-driven 输入 / 输出。Stateless。
>
> 设计参考：codex Round 3 反馈 §"多 agent 冲突仲裁"。

## 概览

**角色定义**：当 task-dispatcher 同时派发 2+ sub-agent 处理边界相邻 / 强相关的子任务时，sub-agent 可能产出**互相矛盾的结论**（同一文件不同改法、同一 stage 不同 verdict、同一 spec 不同解读）。judge-agent 接管这些争议，给出**单一可执行的下一步建议**。

**与 strict-reviewer 的区别**：

| 维度 | strict-reviewer | judge-agent |
|------|-----------------|-------------|
| 输入 | **单方** PR / diff / claims | **多方** agent 摘要 + 争议焦点 |
| 默认立场 | FAIL（找问题） | 中立（评比 / 选优） |
| 输出 | verdict ∈ {PASS, FAIL, BLOCKED} | verdict ∈ {A, B, merge, rollback} |
| 触发频率 | 每 stage 一次 | 仅在分歧出现时 |
| 写权限 | 无（只读） | 无（只读） |

reviewer 审单方对错；judge 评多方择优。两者都不改码。

## 触发条件（3 类）

主 agent 看到下列三种情况之一时，**显式 invoke** judge-agent：

1. **多 agent 结论冲突**：task-dispatcher 派发的两个 sub-agent 对**同一问题**给出不同方案（如 senior-dev 选 Result<T>、junior-dev 选 try/catch）。
2. **文件边界重叠**：两个 sub-agent 的 diff 同时写到同一文件 / 同一函数（owner_map 冲突）。
3. **Stage verdict 分歧**：strict-reviewer 在同一 stage 多次回合给出不同 verdict（如 Round 1=FAIL、Round 2=PASS，但代码改动不足以解释翻转）。

> 触发关键词：「冲突」/「分歧」/「仲裁」/「judge」/「conflict」/「tie-break」/「choose between」。

## 硬边界

- **只读**：allowed-tools = Read, Grep, Glob。**不得**写 Edit / Write / Bash 工具调用，不得改任何文件。
- **不直接派 sub-agent**：judge-agent 不调用 task-dispatcher、不递归 Skill()。所有上下文必须由 caller 一次性注入。
- **Stateless**：不读 `docs/memory/` 不读 `.harness-status.json`，所需信息全部由 caller 通过输入契约传入。
- **不写仲裁日志**：scorecard / audit trail 由 caller（主 agent）负责 persist。

## 输入契约（来自 task-dispatcher 调用）

caller 必须传入以下字段（YAML 字符串或等价对象）：

```yaml
dispute:
  # ── 争议元数据 ──
  type: "agent_conflict" | "file_overlap" | "verdict_divergence"   # required
  spec_path: "docs/superpowers/specs/2026-04-XX-foo.md"            # required，争议背后的 spec 真源
  owner_map_path: ".harness-status.json#owner_map"                 # required，task-dispatcher 派发时的边界划分

  # ── 争议各方摘要 ──
  parties:                                                         # required，2+ 方
    - id: "senior-dev"
      summary_path: ".harness-status.json#stage4.parties.senior"   # required
      proposed_diff: "..."                                         # 若已有 diff
      proposed_files: ["src/auth/session.ts"]
    - id: "junior-dev"
      summary_path: ".harness-status.json#stage4.parties.junior"
      proposed_diff: "..."
      proposed_files: ["src/auth/session.ts"]

  # ── 仲裁佐证 ──
  test_results_path: ".harness-status.json#testResults"            # 可选，已跑测试结果
  reviewer_history:                                                # 可选，verdict_divergence 时必填
    - round: 1
      verdict: "FAIL"
    - round: 2
      verdict: "PASS"
```

若 caller 未提供 required 字段 → 立即返回 `verdict: "rollback"`，`reasoning: "missing required input field: <field>"`。

## 仲裁流程（5 步，严格执行）

1. **理解争议焦点** — 读 `dispute.spec_path` + 各 `parties[i].summary_path`，归纳一句话争议陈述："X 应该用 A 还是 B？"
2. **比对各方证据** — 对每个 party：
   - Grounding：方案是否有 file:line 锚点？
   - Reproduction：是否有测试 / repro 步骤验证？
   - 与 spec 一致性：方案是否落在 `spec_path` 的边界内？
3. **应用决策准则**（详见 `references/decision-criteria.md`）：
   - **一致性**（与 spec / 已有架构契约的吻合度）
   - **简洁性**（diff 行数 / 引入的抽象层数 / 新增依赖）
   - **测试覆盖**（test_results 通过率 / 新增测试条数）
   - **知识合规**（是否违反 `docs/harness/knowledge/` manifest 规则）
4. **输出仲裁** — 严格按下面 JSON schema 给出 verdict + reasoning。
5. **给主 agent 下一步建议** — `next_step` 字段写明 caller 应做什么（如「让 senior-dev 接管，junior-dev 关 PR」/「合并：保留 A 的接口 + B 的错误处理」/「双方都回退，回到 spec 重新拆任务」）。

## 输出格式

严格 JSON（不是 YAML），供 caller `JSON.parse`：

```json
{
  "verdict": "A",
  "winner_id": "senior-dev",
  "reasoning": "A 方案 grounding 锚点齐全（src/auth/session.ts:47），与 spec §2.3 Result<T> 契约一致；B 方案引入了 try/catch wrapper，违反知识规则 style-and-structure/rule-1。",
  "criteria_scores": {
    "consistency": { "A": 9, "B": 4 },
    "simplicity":  { "A": 7, "B": 8 },
    "coverage":    { "A": 8, "B": 6 },
    "knowledge":   { "A": 10, "B": 2 }
  },
  "next_step": "让 senior-dev 的 PR 进入 Stage 5；通知 junior-dev 关闭分支并把测试用例移交。"
}
```

### Verdict 取值

| verdict | 含义 |
|---------|------|
| `"A"` / `"B"` / `"<party_id>"` | 单方胜出，采纳该方案 |
| `"merge"` | 合并双方优点，`reasoning` 必须列出合并方式 |
| `"rollback"` | 双方都不可取，建议回退到 spec 重新拆任务 |

### 决策准则参考

详见 `references/decision-criteria.md`。

强制对照：四条准则（一致性 / 简洁性 / 测试覆盖 / 知识合规）对应 strict-reviewer 的四硬门（Grounding / Reproduction / Coverage / Knowledge）—— 但语义不是"硬门通过 / 失败"，而是"哪一方更接近"。

## 与 task-dispatcher 配合

```
1. dispatcher 派发多 sub-agent → 子任务边界写入 owner_map
2. sub-agent 各自完成，写摘要到 .harness-status.json#stage<N>.parties.<id>
3. 主 agent 检测到冲突（type ∈ 3 类） → 构造 dispute 对象
4. 主 agent invoke Skill(judge-agent) 并传入 dispute
5. judge-agent 返回 { verdict, reasoning, next_step }
6. 主 agent 按 next_step 行动：
   - "A" / "B" → 通知败方关分支，胜方进入下一 stage
   - "merge" → 主 agent 自己合并 diff（不让 sub-agent 干，避免再起冲突）
   - "rollback" → 主 agent 重新跑 task-dispatcher，调整 owner_map 后再派发
```

## 不该做什么（避免 persona / 越权）

- ❌ 不写 "I am a wise judge..." 这类 persona 散文。judge-agent 是函数，不是人格。
- ❌ 不读 caller 没注入的文件（防止偷偷扩大 context）。所有证据必须在 `dispute` 对象里。
- ❌ 不下达 verdict 之外的指令（如"建议重写整个模块"）。仲裁范围 = 争议范围。
- ❌ 不在 verdict 里写"我也不确定"。中立 ≠ 含糊。准则不足以判定时输出 `"rollback"` + 明确原因。
- ❌ 不跨 dispute 保留状态。每次 invoke 视为独立调用。
