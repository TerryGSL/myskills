---
name: harness-bugfix
description: harness 体系的 **bugfix sub-skill**。用于定位并修复 bug，强制走 investigate → reproduce → fix → regression test 流程。调用 Stage -0.5 读取相关 knowledge（异常约定 / 内部组件），调用 strict-reviewer 带 knowledge gate。不自动 push，修完等用户确认。由 profile-entry 的 /fix flag 触发，或 task-dispatcher 判定任务是 bug 类型时派发。
---

# harness-bugfix — bugfix 专用路径

> **通常由 profile-entry 调用**（`/fix` flag 触发或 task-dispatcher 判定 bug 类型后派发到此处）。
> 直调支持，但需自行执行 `harness-common` Phase Init 检查（profile-entry 调用时由 profile-entry 完成）。

---

## 1. 触发场景

有三种进入路径：

**路径 A（`/fix` flag）**：用户消息含 `/fix` flag，profile-entry 解析后直接派发到本 skill。适用于用户明确知道是 bug 修复的场景。

**路径 B（task-dispatcher 判定）**：`task-dispatcher` 在外层任务分解时，判断子任务属于 bug 类型（关键词：crash / 报错 / 不符合预期 / regression / exception / failure 等），由 task-dispatcher 把该子任务派发到 profile-entry，再路由到本 skill。

**路径 C（用户显式调用）**：用户直接调用 `/harness-bugfix` 或在对话中明确说"修 bug"。直调时本 skill 自行执行初始化检查（见第 5 节）。

---

## 2. 执行流程（5 步）

本 skill 强制走以下 5 步，**不可跳步**，不可因"bug 看起来简单"而省略 investigate 或 regression test。

---

### Step 1：调用 `investigate` skill — 根因调查

```
Skill(investigate)
  输入：bug 描述（现象 / 报错信息 / 复现步骤）
```

`investigate` skill 内部走四阶段结构化调试：

| 阶段 | 内容 |
|------|------|
| 根因调查 | 阅读相关代码路径，梳理调用栈，定位问题所在层 |
| 模式分析 | 判断是否是已知模式（查 `docs/memory/ERRORS.md` 历史案例） |
| 假设验证 | 构建 2-3 个根因假设，逐一用代码证据验证或排除 |
| 实现修复 | 确认根因后，给出修复方向（具体代码变更路径） |

`investigate` 输出：
- 根因定位（file:line 或调用链）
- 修复方向（哪里改、改什么）
- 相关历史案例（若 ERRORS.md 有命中）

若 `investigate` 返回"无法确定根因"，**停止本 skill，升级用户**，不自行猜测继续。

---

### Step 2：复现 — 写 failing test 或 repro script

在修改任何代码之前，必须先有可复现的证据：

**优先**：写一个 failing unit test 或 integration test，证明 bug 存在：

```bash
# 示例（按项目测试框架适配）
# 测试应该在 fix 之前 FAIL，fix 之后 PASS
<test-runner> --run <new-test-case>   # 预期: FAIL (red)
```

**若无法写自动测试**（如 UI 渲染问题、外部服务依赖）：写 repro script 并在注释中说明手动复现步骤。

复现步骤是后续 regression test 的基础，**不可省略**。

---

### Step 3：Stage -0.5 Project Context Retrieval

在写修复代码之前，执行 Stage -0.5，读取与本次变更路径相关的项目 knowledge：

```
Stage -0.5 流程：
  Step 0: 读 CLAUDE.md 检查 harness-knowledge 状态（disabled 则跳过后续）
  Step 1: 检查 docs/harness/knowledge/INDEX.md 是否存在
  Step 2: 按 investigate 确认的变更路径做 routing 匹配，选 relevant_knowledge_files
  Step 3: 加载命中 manifest（重点：exception-and-error-contracts / internal-components）
  Step 4: 按 Status 过滤，渲染 Binding Rules + Advisory Context
  Step 5: 写入 .harness-status.json.knowledgeCheck
```

重点关注以下 knowledge 域（bugfix 场景高频命中）：
- `exception-and-error-contracts`：项目异常体系、允许/禁止的异常类型
- `internal-components`：内部 wrapper / SDK，避免绕过内部组件裸实现

knowledge gate 完整规范见 [harness-common/references/knowledge-retrieval.md](../harness-common/references/knowledge-retrieval.md)。

若 INDEX.md 不存在（项目未接入 knowledge），跳过本步骤，继续 Step 4。

---

### Step 4：修 — 按 knowledge rules 写代码，调用 strict-reviewer

#### 4a：写修复代码

根据 Step 1 (investigate) 的根因定位和 Step 3 的 knowledge context，实施修复：

- 严格遵循 Step 3 Binding Rules（violation → reviewer FAIL）
- 不绕过内部 wrapper / SDK
- 不引入新的 exported 符号（若需要则升级为 `harness-feature`）
- 修复范围尽量最小化，避免顺手重构（重构用 `harness-refactor`）

#### 4b：构造 review_target 并调用 strict-reviewer

```yaml
# coordinator 构造 review_target（YAML）
review_target:
  changed_files: <git diff --name-only 结果>
  diff_summary: <git diff 截取，≤300 词>
  stage: "qa"
  claims_to_verify:
    - "根因修复覆盖 investigate 定位的 file:line"
    - "failing test 在 fix 后转为 PASS"
    - "未引入新的 exported 符号或类型变更"
  memory_cases: <从 docs/memory/ERRORS.md 按 changed_files 检索>
  prior_verdict: null
  # knowledge 字段从 .harness-status.json.knowledgeCheck 复制
  knowledge_snapshot_id: <knowledgeCheck.snapshot_id>
  relevant_knowledge_files: <knowledgeCheck.relevant_knowledge_files>
  knowledge_requirements: <knowledgeCheck.knowledge_requirements>
  retrieval_outcome: <knowledgeCheck.retrieval_outcome>
  known_issues: <knowledgeCheck.known_issues>
```

```
Skill(strict-reviewer)
  输入：上方 YAML review_target
```

strict-reviewer 4 硬门（任一 FAIL → 返回修复）：

| 硬门 | 触发条件 |
|------|----------|
| Grounding | 根因定位无 file:line 证据 |
| Reproduction | failing test 未覆盖 bug（或无 repro script） |
| Coverage | 实际变更范围超出声明 |
| Knowledge Compliance | 违反 Step 3 的 Binding Rules |

Verdict 路由：

| Verdict | 动作 |
|---------|------|
| PASS | 继续 Step 5 |
| FAIL | 返回 Step 4a 修复，同一 round 最多 2 次 retry；第 3 次 FAIL → BLOCKED，升级用户 |
| BLOCKED | 立即停止，等用户指示，禁止自动降级 |

reviewer 集成完整协议见 [harness-common/references/reviewer-integration.md](../harness-common/references/reviewer-integration.md)。

---

### Step 5：加回归测试 + commit + memory case

#### 5a：确认回归测试就位

Step 2 写的 failing test 在 fix 后应已转为 PASS。确认测试覆盖情况：

```bash
<test-runner> --run <regression-test-case>   # 预期: PASS (green)
<test-runner>                                # 全量跑，确认无新 regression
```

#### 5b：commit

```bash
git add <changed-files>
git commit -m "fix: <一句话描述 bug 和修复方向>

Root cause: <根因一句话>
Test: <回归测试文件:行 或 测试名>"
```

**不自动 push**。commit 完成后等用户确认是否 push。

#### 5c：写 memory case（若满足 min_criteria）

读取 `.harness-memory.yml` 的 `errors_collection.min_criteria`（至少满足 2 项）：

```
criteria:
  - diagnosis_over_30m    # investigate 超 30 分钟
  - cross_module          # 跨越多个模块
  - repeated              # 历史上出现过类似问题
  - platform_specific     # 特定平台/环境才触发
  - user_visible          # 用户可感知的 bug
  - invalidated_assumption # 颠覆了既有认知
```

满足 ≥2 项时，在 `docs/memory/cases/` 创建 Error Case 文件：

```bash
# 文件命名：harness_<YYYY-MM-DD>_<slug>.md
docs/memory/cases/harness_2026-04-21_<bug-slug>.md
```

Error Case 格式（含必填 `## Negative Patterns` 段）参见 [harness-common/references/memory-contract.md](../harness-common/references/memory-contract.md) §Error Case 文件格式。

不满足 min_criteria 时，仅写一条轻量 claude-mem observation，**不**创建 case 文件。

---

## 3. 与 harness-common 的引用关系

本 skill 调用以下 harness-common references，**不复制内容**，只交叉引用：

| 引用内容 | 路径 |
|----------|------|
| memory 契约（Error Case 格式 / ERRORS.md 查询 / scorecard） | [harness-common/references/memory-contract.md](../harness-common/references/memory-contract.md) |
| Stage -0.5 knowledge retrieval 完整规范 | [harness-common/references/knowledge-retrieval.md](../harness-common/references/knowledge-retrieval.md) |
| strict-reviewer 调用协议（review_target schema / 4 硬门 / verdict 路由） | [harness-common/references/reviewer-integration.md](../harness-common/references/reviewer-integration.md) |
| Phase Init（直调时自行执行） | [harness-common/references/phase-init.md](../harness-common/references/phase-init.md) |
| 项目探测（`.harness-context.json` / 测试命令） | [harness-common/references/project-detection.md](../harness-common/references/project-detection.md) |

---

## 4. 硬约束：3 次失败后的升级协议

若 strict-reviewer 在同一 round 内连续 FAIL 3 次（2 次 retry 用完），或 `investigate` 无法定位根因，执行以下升级协议：

```
harness-bugfix: 修复失败，升级协议启动
  失败轮次: 3 次（已用完 retry 额度）
  最后 verdict: FAIL
  findings: <reviewer 最后一次输出的 findings 列表>
  操作: 记录 knownIssue，停止自动修复，等待用户指示
```

同时在 `docs/memory/cases/` 创建一条 knownIssue 类型的 case，标注 `status: active`、`freshness.state: suspect`，并在 `## Negative Patterns` 段记录所有尝试过但失败的方向，防止下次重蹈覆辙。

**不**继续重试，**不**自行降级为其他流程，**不**绕过 strict-reviewer。

---

## 5. 直调初始化检查

当本 skill 被直接调用（非经由 profile-entry）时，自行执行以下初始化检查：

```bash
# 1. 检查 .harness-context.json 是否存在（项目已接入 harness）
ls .harness-context.json 2>/dev/null || echo "WARNING: 项目未初始化，建议先跑 harness-workflow --init"

# 2. 检查 .harness-status.json（运行时状态文件）
# 若不存在，创建最小结构
if [ ! -f ".harness-status.json" ]; then
  echo '{"roundId": null, "baseSha": null, "knowledgeCheck": null, "memoryCheck": null}' \
    > .harness-status.json
fi

# 3. 读取 .harness-memory.yml 确认 memory 契约存在
ls docs/memory/.harness-memory.yml 2>/dev/null || \
  echo "WARNING: memory 契约缺失，Step 5c memory case 将跳过"
```

Phase Init 完整规范见 [harness-common/references/phase-init.md](../harness-common/references/phase-init.md)。

---

## 6. 与其他 sub-skill 的边界

| 场景 | 正确 skill |
|------|------------|
| 简单 typo / 配置值调整（≤1 文件 / <10 行） | `harness-quick` |
| 新功能开发 | `harness-feature` |
| 代码重构（无功能变更） | `harness-refactor` |
| 修 bug 过程中发现需要大改（>10 行 / 新增 exported API） | 升级为 `harness-feature`，当前 bugfix 成果带入 |
| 修 bug 过程中发现根因在架构层面 | 停止 bugfix，升级用户讨论架构决策 |
