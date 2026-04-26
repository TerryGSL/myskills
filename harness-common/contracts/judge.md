# Judge — 多 Agent 冲突仲裁契约

> **Source of truth**: `judge-agent/SKILL.md` + `judge-agent/references/decision-criteria.md`。本 contract 是跨 leaf skill 的 narrative 副本，规定何时 invoke / 输入输出 schema / 决策准则边界。

定义 task-dispatcher 派发的多 sub-agent 出现冲突时，由哪个角色 invoke judge-agent 仲裁、输入输出契约是什么、与 strict-reviewer / fallback 协议的边界。

## 何时触发 judge-agent

主 agent（task-dispatcher 调用方）在以下三类场景**必须** `Skill(judge-agent)`，不要自己拍板：

| 类别 | 场景 | 例子 |
|------|------|------|
| **结论冲突** | 多 sub-agent 给出矛盾方案 | senior-dev 主张方案 A、junior-dev 主张方案 B |
| **文件边界重叠** | 两个 sub-agent 改同一文件相邻行（不重叠边界铁律已违反）| Agent X 改 src/auth.ts:42-50、Agent Y 改 src/auth.ts:48-55 |
| **Stage verdict 分歧** | strict-reviewer 多次审稿结论矛盾 | Round 1 PASS、Round 2 FAIL，但 diff 没大变 |

## 输入契约

调用方传给 judge-agent 的输入（必须包含全部）：

| 字段 | 说明 | 来源 |
|------|------|------|
| `spec` | 当前 task 的 spec / 需求文档路径 | task-dispatcher 派发时的 spec.md |
| `owner_map` | 每个 sub-agent 负责的文件清单 | task-dispatcher dispatch 协议输出 |
| `agent_summaries` | 各 sub-agent 的结论摘要（≤200 字 / 个）| sub-agent 返回报告 |
| `diff` | 各 agent 的 git diff（如适用）| `git diff` 或派发时的 diff bundle |
| `test_results` | 测试结果（如适用）| 各 agent 跑 jest / pytest 输出 |

## 输出契约

judge-agent 返回 JSON（schema 在 `judge-agent/SKILL.md`）：

```json
{
  "verdict": "A | B | merge | rollback",
  "reasoning": "为什么这样裁决（基于决策准则）",
  "next_step": "主 agent 接下来该做什么"
}
```

**verdict 语义**：
- `A` / `B` — 选某个 agent 的方案，丢弃另一个
- `merge` — 两方案都有价值，主 agent 按 next_step 合并
- `rollback` — 都不接受，回退到上一 Stage / 重新 spec

## 决策准则（与 strict-reviewer 4 硬门对齐）

judge-agent 仲裁时的优先级：

1. **Grounding**：哪个方案更贴近 spec 文字？
2. **Reproduction**：哪个方案的测试覆盖更可复现？
3. **Coverage**：哪个方案覆盖更多边界 case？
4. **Knowledge**：哪个方案符合 Stage -0.5 注入的 Binding Rules？

详 [`reviewer-gates.md`](reviewer-gates.md) 的 4 硬门定义。

## 与其他角色的边界

| 角色 | 职责 | 何时调 judge |
|------|------|------------|
| `task-dispatcher` | 外层并行编排 | 派发后检测到冲突 → 主 agent invoke judge |
| `strict-reviewer` | 单方结论审稿（默认 FAIL 立场）| reviewer 自身不调 judge；reviewer 多轮分歧时主 agent 调 |
| `judge-agent` | **多方冲突仲裁**（只读）| 由主 agent / task-dispatcher 调用方 explicit invoke |
| `fallback`（rollback 闭环）| 失败回退 | 与 judge 不冗余：fallback 管"修不好"，judge 管"两个都对但矛盾" |

## 硬约束

- judge-agent 是**只读** skill（`allowed-tools: Read, Grep, Glob`），**不允许** Edit / Write / Bash
- 调用方拿到 verdict 后**必须**按 next_step 执行，不允许"我觉得 judge 错了，自己改"
- 如果 judge 输出 `rollback` → 主 agent 走 [`leaf SKILL.md` 的失败回退闭环](../../harness-feature/SKILL.md#失败回退闭环rollback-contract每-stage-适用)
- judge 不调下游 sub-agent / 不派 Agent —— judge 是终止节点

## Cost Budget 约束

每个 round judge 调用次数受 `.harness-status.json` 的 budget 限制：

```yaml
budget:
  max_judge: 1     # M 级默认（一个 round 最多一次仲裁）
                   # XL: 1（即使 round 大也只允许 1 次，避免循环仲裁）
```

超过 budget → 直接 escalate 给用户，不再 invoke judge。详 [`maintenance.md`](maintenance.md) 的 budget 章节（如有）。

## 使用流程

```
task-dispatcher 派多 sub-agent
        ↓
sub-agent 返回结果
        ↓
主 agent 检测冲突（结论 / 文件边界 / Stage verdict）
        ↓ 命中
检查 budget（max_judge 是否还有额度）
        ↓ 有
Skill(judge-agent) 加载仲裁协议
        ↓
构造输入（spec + owner_map + agent_summaries + diff + test_results）
        ↓
invoke judge → 拿 verdict JSON
        ↓
按 verdict.next_step 执行
        ↓
更新 .harness-status.json 减一次 max_judge 计数
```

## 调用样例

详见 [`judge-agent/references/decision-criteria.md`](../../judge-agent/references/decision-criteria.md) — 含 3 个真实场景的 verdict 演练。
