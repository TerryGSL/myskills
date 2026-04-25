---
name: harness-refactor
description: harness 体系的 **refactor sub-skill**。用于代码重构（不改外部行为的内部结构调整）。走 baseline capture → 增量 plan → 小 commit 持续验证 → 与 baseline 最终对比流程。强依赖 Stage -0.5 读取 style-and-structure 和 internal-components manifests（refactor 的目标就是向 idiom 靠拢）。调 strict-reviewer 时重点 verify 行为不变（regression test 必须全绿）+ Knowledge Compliance Check（refactor 后必须更符合 manifest active rules）。由 profile-entry 的 /refactor flag 触发。
---

# harness-refactor — 重构专用工作流

> **调用说明**：本 skill 通常由 profile-entry 在解析 `/refactor` flag 或用户显式要求重构时调用。直接调用（非 profile-entry 路径）需要用户手动执行 `--init`，否则 Phase 1-4 基础设施检查将被跳过。

---

## 何时触发

以下三种情况触发 harness-refactor：

1. **`/refactor` flag**：用户调用 `/profile-entry` 附带 `/refactor` flag，profile-entry 路由到本 skill。
2. **用户显式要求**：用户直接描述"重构"、"代码结构调整"、"清理技术债"、"向规范靠拢"等意图，且明确声明不变更外部行为。
3. **代码审查意见**：strict-reviewer 或团队 review 产出的改进意见属于纯结构性调整（无新功能、无 bugfix 语义），由 profile-entry 判断后路由至此。

**不触发 harness-refactor 的情况**：
- 修改包含行为变化（哪怕只是"顺手改了一个 bug"）→ 走 harness-bugfix
- 新增功能 → 走 harness-feature
- 仅修改配置文件、文档、注释 → 走 harness-quick

---

## 硬前置：回归测试检查

**在执行任何重构动作之前，必须确认项目存在可运行的回归测试。**

```bash
# 探测测试命令（来自 .harness-context.json）
cat .harness-context.json | jq '.test_command'

# 试跑
<test_command>
```

**判定规则**：

| 情况 | 处置 |
|------|------|
| 测试命令存在，且全部 PASS | 继续执行 Step 1 |
| 测试命令存在，有少量已知 failing（baseline 已记录）| 继续，baseline 记录已有失败 |
| 项目无任何测试 | **停止**。升级到 harness-feature，先补充 characterization tests，再回来做 refactor |
| 测试存在但无法运行（环境问题）| **停止**。提示用户修复测试环境后再继续 |

> 没有可跑的测试，refactor 无法保证行为不变。这是 harness-refactor 的核心前提，不可绕过。

---

## 执行流程

### Step 1 — Baseline 捕获

目标：在任何改动之前，建立可比较的"行为快照"。

**1a. 跑全量测试，记录结果**

```bash
<test_command> 2>&1 | tee /tmp/harness-refactor-baseline.log
echo "EXIT_CODE=$?" >> /tmp/harness-refactor-baseline.log
```

提取 pass/fail/skip 数量，写入结构化字段。

**1b. git 快照**

```bash
git log --oneline -10
git status
git stash list
```

记录当前 HEAD commit SHA，用于后续 `git diff` 基准点。

**1c. 关键行为一句话描述**

由 coordinator 提炼：本模块/函数/接口的核心外部行为是什么，用用户可读的自然语言写一句。例如：

> "UserService.login() 接受 email+password，验证后返回 JWT token，失败时抛 AuthException。"

**1d. 写入 `.harness-status.json.refactorBaseline`**

```json
{
  "refactorBaseline": {
    "captured_at": "<ISO8601>",
    "base_sha": "<git HEAD SHA>",
    "test_result": {
      "passed": 42,
      "failed": 0,
      "skipped": 3,
      "command": "<test_command>"
    },
    "behavior_summary": "<用户可读的一句话行为描述>",
    "test_log_path": "/tmp/harness-refactor-baseline.log"
  }
}
```

baseline 字段一旦写入，本轮 refactor 全程不再覆盖；Step 4 对比时以此为基准。

---

### Step 2 — 增量 Plan

目标：读取 knowledge manifests，识别偏离，拆分为可验证的小 commit 列表。

**2a. 读取 style-and-structure + internal-components manifests（Stage -0.5 注入）**

Stage -0.5 已无条件加载这两个 always-load 域：

- `docs/harness/knowledge/style-and-structure/manifest.md`
- `docs/harness/knowledge/internal-components/manifest.md`

见 [`../harness-common/references/knowledge-retrieval.md`](../harness-common/references/knowledge-retrieval.md) §2 "Always-load 域"。

refactor 的目标就是**向 manifest active rules 靠拢**，因此这两个 manifest 是 plan 制定的唯一对照基准。

**2b. 识别偏离位置**

对每条 `Status: active` 的 rule，扫描待重构代码，找出违反位置：

```
rule-id: style-and-structure/rule-3
违反文件: src/service/OrderService.java:87-102
偏离描述: 方法直接返回 List<Order>，应使用 Result<List<Order>> wrapper
```

**2c. 拆分 commit 列表**

每个 commit 满足：
- **≤ 50 行 diff**（不含测试文件）
- 单一语义（只做一件事：例如"把 OrderService 返回值换成 Result wrapper"）
- commit message 格式：`refactor(<scope>): <一句话描述>`

输出 commit 列表（编号 + 描述 + 预计 diff 行数），在开始执行前展示给用户确认（aggression mode 影响此步，见下文）。

---

### Step 3 — 持续验证执行

目标：每个小 commit 改完立即验证，保持 test 全绿。

**3a. 执行循环**

```
for each commit in plan:
  1. 实施改动
  2. git add -p  # 精确 stage，不多提交
  3. 跑测试：<test_command>
  4. 若全绿：git commit -m "refactor(<scope>): <描述>"
  5. 若有 test 变红：立即 git checkout -- .（revert），记录 revert 原因
  6. 每完成 N 个 commit（默认 N=3）：触发一次 strict-reviewer（stage=quality）
```

**3b. 测试变红处理**

某 commit 导致测试变红时：

```bash
git checkout -- .   # 丢弃未提交的改动
git stash           # 若已 add 则 stash
```

记录失败上下文到 `.harness-status.json.refactorProgress`：

```json
{
  "reverted_commits": [
    {
      "planned_commit": "refactor(OrderService): wrap return with Result",
      "reason": "test OrderServiceTest#testEmptyOrder 变红",
      "revert_count": 1
    }
  ]
}
```

若**同一个 commit 连续 revert 3 次**，停止并升级用户（见"失败/降级"章节）。

**3c. 中间 strict-reviewer 调用**（每 N=3 个 commit）

```yaml
review_target:
  changed_files: [<本批 commit 涉及的文件>]
  diff_summary: "refactor batch <N>: <描述>"
  stage: "quality"
  claims_to_verify:
    - "测试全绿，无行为变更"
    - "代码更符合 manifest active rules"
  knowledge_requirements: <来自 .harness-status.json.knowledgeCheck>
```

见 [`../harness-common/references/reviewer-integration.md`](../harness-common/references/reviewer-integration.md) — Invocation Protocol。

strict-reviewer FAIL → **暂停前进**，按 verdict 修复后继续，不向前堆 commit。

---

### Step 4 — 与 Baseline 对比

目标：验证重构完成后外部行为不变，且代码对 manifest 的合规性提升。

**4a. 再跑全量测试**

```bash
<test_command> 2>&1 | tee /tmp/harness-refactor-final.log
```

与 `refactorBaseline.test_result` 对比：

| 对比项 | 预期 |
|--------|------|
| passed 数量 | ≥ baseline（不能减少）|
| failed 数量 | ≤ baseline（不能增加）|
| 新增 failed | 必须为 0 |

任何回归（原本 PASS 的测试变 FAIL）→ 阻断，升级用户，不做最终 commit。

**4b. 关键行为再验证**

对照 `refactorBaseline.behavior_summary` 再验证一次：
- 核心接口的输入/输出行为是否与描述一致
- 若有集成测试，确认 happy path 全通

**4c. 调用 strict-reviewer 做最终 review**

```yaml
review_target:
  changed_files: [<全量 refactor 涉及的文件>]
  diff_summary: "refactor complete: <整体描述>"
  stage: "quality"
  claims_to_verify:
    - "行为与 baseline 完全一致（回归测试全绿）"
    - "refactor 后代码更符合 manifest active rules"
    - "无意外的外部接口变更"
  knowledge_requirements: <来自 .harness-status.json.knowledgeCheck>
  prior_verdict: null
```

**最终 review 重点：两个强化验证门**

1. **Knowledge Compliance Check**（第 4 硬门）
   - 对每条 `knowledge_requirements` rule，验证 refactor 后代码是否遵循
   - Grounding：必须提供 `file:line` 证据，证明每条 binding rule 均已满足
   - refactor 后 manifest compliance **反而下降**（违反 rule 数增加）→ FAIL，升级用户

2. **Grounding gate 验证"行为不变"的证据链**
   - 证据来源：测试 pass 数量对比、关键行为 before/after diff、集成测试截图（如有）
   - 纯口头声明"行为不变"不算证据

见 [`../harness-common/references/reviewer-integration.md`](../harness-common/references/reviewer-integration.md) §"Verdict 决定规则"。

**4d. 最终步骤：commit + push-decision**

最终 strict-reviewer PASS 后，进入 commit + push 评估：

1. `git add <refactored_files>`
2. `git commit -m "refactor: ${summary}"`
3. 调用 [push-decision](../harness-common/references/push-decision.md)：
   - 改 > 3 文件 / 改公共导出 / breaking → HIGH 拒绝
   - 单一模块内重构 → MEDIUM 询问
   - 极少数 LOW（如纯重命名 + 自动 import 修复） → 自动
4. 把 push 结果记入 WALKTHROUGH.md

---

## 与 harness-common 的引用关系

| 能力 | 来源 |
|------|------|
| 项目初始化（Phase 1-4） | [`../harness-common/references/phase-init.md`](../harness-common/references/phase-init.md) |
| Memory 契约（`.harness-memory.yml`） | [`../harness-common/references/memory-contract.md`](../harness-common/references/memory-contract.md) |
| Knowledge 检索（Stage -0.5） | [`../harness-common/references/knowledge-retrieval.md`](../harness-common/references/knowledge-retrieval.md) |
| strict-reviewer 调用协议 | [`../harness-common/references/reviewer-integration.md`](../harness-common/references/reviewer-integration.md) |
| 技术栈探测（test_command 来源） | [`../harness-common/references/project-detection.md`](../harness-common/references/project-detection.md) |

harness-refactor **不复制**上述规范内容，只通过交叉引用获取。规范更新在 harness-common 中统一维护。

---

## Aggression Mode 影响

aggression mode 由 profile-entry 解析后注入（`conservative` / `aggressive`）：

| 阶段 | conservative | aggressive |
|------|-------------|-----------|
| Step 2 commit 列表 | 展示给用户逐条确认后才开始执行 | 直接执行，不逐条确认 |
| Step 3 每个 commit 前 | 可选：向用户展示 diff 预览，等确认 | 直接提交，不暂停 |
| Step 3 中间 reviewer 频率 | 每 2 个 commit 触发一次（更频繁）| 每 3 个 commit 触发一次（默认）|
| Step 4 最终 review 前 | 向用户展示对比摘要，等确认后调 reviewer | 直接调 reviewer |

两种 mode 下，**以下行为不受影响**（始终执行）：
- 硬前置检查（测试存在性）
- 每个 commit 后立即跑测试
- 测试变红立即 revert
- Step 4 最终 baseline 对比

---

## 失败 / 降级

### 场景 1：baseline 测试不稳定（随机 fail）

**检测**：Step 1 多次跑测试，结果不一致（随机 PASS/FAIL）。

**处置**：
```
停止。不进入 Step 2。
提示用户：
  "发现 baseline 测试不稳定（flaky）：<测试名> 多次运行结果不一致。
   请先修复 flaky test 后再执行 refactor，否则无法建立可靠基准。"
```

不写 `refactorBaseline`，不做任何改动。

---

### 场景 2：某 commit 连续 revert 3 次

**检测**：`refactorProgress.reverted_commits[i].revert_count >= 3`

**处置**：

```
暂停执行。升级用户：
  "planned commit '<描述>' 已连续 revert 3 次，每次都导致 <test_name> 失败。
   可能原因：
   1. 该 rule 的 idiom 与当前代码有深层依赖冲突
   2. 测试本身对实现细节耦合过深（测试需要同步调整）
   请决定：(a) 跳过此 commit (b) 同步调整测试 (c) 中止本轮 refactor"
```

等待用户指令，不自行决定。

---

### 场景 3：refactor 完成但 manifest compliance 反而下降

**检测**：Step 4 strict-reviewer Knowledge Compliance Check 发现违反的 active rule 数量 > baseline 前的违反数量。

**处置**：

```
阻断最终 commit。升级用户：
  "最终 review 发现 refactor 后违反 manifest active rules 的数量增加：
   新增违反：<rule_id> at <file:line>
   这与 refactor 目标（向 idiom 靠拢）相悖。
   请检查是否引入了错误的抽象，或 manifest 本身需要更新。"
```

提供完整 strict-reviewer 输出供用户决策，不自行 rollback。

---

## 快速参考

```
触发:  /refactor flag | 用户显式 | 代码审查意见
前置:  可跑回归测试（否则 → harness-feature 补测试）
Step1: baseline 捕获（测试 + git SHA + 行为一句话）
Step2: 读 manifests → 识别偏离 → 拆小 commit（≤50行）
Step3: 每 commit 后立即跑测试；变红即 revert；每3个commit触发 reviewer
Step4: 再跑全量测试 + 行为再验证 + 最终 strict-reviewer
降级:  flaky baseline → 停; 连续revert3次 → 升级; compliance下降 → 升级
```
