# Knowledge Retrieval — Stage -0.5 Project Context Retrieval 规范

> 本文档是 harness 体系内项目级 knowledge 检索与注入机制的权威 runtime 规范。
> 完整设计推导见 `harness-workflow/specs/2026-04-23-project-knowledge-scanner-design.md`。
> 扫描侧规范（knowledge 如何产生）见 [`project-scanner.md`](project-scanner.md)。

---

## 1. 概述

### 为什么要 Stage -0.5

harness 进入存量项目（尤其公司级老 Java repo）后，如果不提前载入项目级约定，写出的代码会：

- 绕过内部 wrapper / SDK，写"初学者味道"的裸实现
- 抛出错误的异常类型（项目有自己的异常体系）
- 不使用已有的 i18n helper、日志框架、上下游适配层

Stage -0.5 的职责是：在每个 Round 的 Stage 0 之前，从目标项目的 `docs/harness/knowledge/` 读取扫描产物，选出与本轮任务相关的 manifest，按 Rule Status 过滤后渲染成结构化上下文，注入到 Stage 2 / Stage 3 subagent 的 task prompt 前缀。

Stage -0.5 对 **所有级别的 Round 都不跳过**，包括 S 级紧急修复。

### knowledge vs memory 分工

两个机制互补，**不混用**：

| 维度 | knowledge（本规范） | memory（`memory-contract.md`） |
|------|--------------------|-----------------------------|
| 时机 | 接入时一次性扫描生成 | 开发过程逐轮积累 |
| 内容 | 代码 idiom / 内部组件 / 约定 / SDK 用法 | bug cases / 架构决策 / 遗留约束 |
| 来源 | AI 读现有代码 + 用户批量回答 | 每轮 Stage 2/6/7/8 实时沉淀 |
| 位置 | `docs/harness/knowledge/<domain>/` | `docs/memory/{cases,decisions,constraints}/` |
| 更新频率 | 低（`--rescan`） | 高（每轮可能加） |
| 老化机制 | `snapshot_id` + `last_full_scan` | `freshness.last_used` + suspect 状态机 |

两者在 pipeline 里的顺序固定：**Stage -0.5 先读 knowledge（静态 inventory），Stage 3 再读 memory 的 ERRORS（动态教训）**。不可颠倒，也不可合并注入通道——两者面向不同受众（knowledge 面向实现规则，memory 面向历史教训）。

---

## 2. Stage -0.5 完整流程

### Step 0：Disable Check（先于一切）

读目标项目 `CLAUDE.md` 的 `<!-- harness-knowledge:start --> ... <!-- harness-knowledge:end -->` 块：

- 若块内含 `harness-knowledge: disabled`（任意位置）→ 在内存中设 `effective_index_status = disabled`，写入 `.harness-status.json.knowledgeCheck`，**跳过 Stage -0.5 其余所有步骤**。
- 若块不存在 或 无 `disabled` 标记 → 继续执行 Step 1。

**为什么 disable 开关在 CLAUDE.md 而非 INDEX.md**：`INDEX.md` 是 scanner 产物，用户不应被迫编辑机器产物；`CLAUDE.md` 是用户主笔区，把控制权放在用户手边最自然。`INDEX.status` 不含 `disabled` 值，`disabled` 状态只由 CLAUDE.md 决定。

---

### Step 1：INDEX 存在性检查

检查目标项目 `docs/harness/knowledge/INDEX.md` 是否存在：

- **不存在** → 跳过 Stage -0.5 所有后续步骤（项目未接入 knowledge，走普通 harness 模式）。不写 `knowledgeCheck` 字段。
- **存在** → 继续执行 Step 2。

INDEX 存在后无论 `INDEX.status` 是 `active`、`stale` 还是 `drifted`，**都不跳过** Stage -0.5。三种状态的区别只影响注入时的 warning level 和哪些 manifest/rule 进入 `knowledge_requirements`（详见生命周期状态机一节）。

---

### Step 2：Routing 匹配

读 INDEX.md 的 `## Retrieval Routing Rules` 段，匹配本轮任务，选出 `relevant_knowledge_files`：

- **若本轮 `changed_files` 已知**（Stage 2 已产出 plan，plan 声明了 `changed_files`）→ 对每个文件跑 path glob 匹配，选出命中的 domain manifest。
- **若只有需求文本**（Round 刚开始，还没有 plan）→ 对任务描述做 keyword 匹配，再叠加 always-load domain。
- **Always-load 域**：`style-and-structure/manifest.md` + `internal-components/manifest.md`，无条件选入，无论 changed_files 或 keyword。

`relevant_knowledge_files` 只允许 `docs/harness/knowledge/**/manifest.md`。`docs/memory/` 路径**禁止**出现在此字段，防止调用者错用 corpus。

---

### Step 3：加载 Manifest

对每个命中的 `manifest.md`，**只读 manifest，不读 evidence.md**（evidence 是 audit 用的 file:line 证据，不是运行时上下文）。

解析 manifest 中所有 rule block，提取每条 Rule 的：

- `Rule ID`
- `Status`（active / expired / drifted / superseded）
- `violation_test` 及配套字段
- `规则描述`
- `applies_to`（path glob）

---

### Step 4：Render Pipeline

Stage -0.5 **禁止直接注入 raw manifest 全文**。原因：manifest 含四种 Status 的 rule 混在一起，全文注入会把非 binding 的 rule 当 binding 推给 subagent，造成错误 FAIL 或错误豁免。

必须按以下 Render Pipeline 执行：

```
for each manifest in relevant_knowledge_files:
  parse manifest.md 的所有 rule blocks
  for each rule:
    if Status == "active":
      render 到 Binding Rules view
    elif Status == "expired":
      render 到 Advisory Context view (source: expired_rule)
    elif Status in ("drifted", "superseded"):
      skip（不进任何 view）
      append 到 coordinator 的 knownIssue log

for each entry in INDEX "## User Overrides" (过滤到命中 domain):
  render 到 Advisory Context view (source: user_override)

合并两个 view → 生成最终注入文本
```

**Binding Rules view** 只含 `Status: active` 的 rule。格式：

```
## Binding Rules（违反 → reviewer FAIL）

以下为命中 manifest 中 Status: active 的 rule：

### <domain> (from <domain>/manifest.md)
- **[<rule_id>]** <规则描述一句话>
  适用: <path glob>
  violation_test: <enum>
```

**Advisory Context view** 含两种来源：

```
## Advisory Context（非强制，reviewer 不以此为 FAIL 依据）

- **[user_override: <gap_id>]** <override_text 摘要>
- **[expired_rule: <rule_id>]** <requirement_text> (last_verified 已过期 N 天)
```

drifted 和 superseded 的 rule **不注入任何 context**；仅在 coordinator log 里记 `knownIssue`，并通过 `.harness-status.json.knowledgeCheck.known_issues` 透传给 reviewer。

---

### Step 4a：Advisory Knowledge 加载

在 Render Pipeline 之外，独立加载两类 advisory knowledge 并写入 `knowledgeCheck.advisory_knowledge`：

**来源 A — User Overrides**（`INDEX.md ## User Overrides` 表）：

对命中 domain 的每一行，读取 `<domain>/gaps.md` 里对应 `resolved_by_user` 块的完整文本，转为：

```json
{
  "source": "user_override",
  "id": "<gap_id>",
  "domain": "<domain>",
  "text": "<gaps.md 中 resolved_by_user 块的完整文本>",
  "weight": "advisory"
}
```

**来源 B — Expired Free-Form Rules**（`INDEX.md ## Expired Free-Form Rules` 表）：

对命中 domain 的每一行转为：

```json
{
  "source": "expired_rule",
  "id": "<rule_id>",
  "domain": "<domain>",
  "text": "<requirement_text>",
  "weight": "advisory"
}
```

这两类条目**绝不进 `knowledge_requirements`**。它们是参考上下文，reviewer 不以此作 FAIL 依据。

---

### Step 5：写入 `.harness-status.json.knowledgeCheck`

写入结构化字段（**不用 free-form string**）。完整 schema：

```json
{
  "knowledgeCheck": {
    "effective_index_status": "active",
    "snapshot_id": "scan-2026-04-21T10:00Z",
    "retrieval_outcome": "success",
    "filtered_candidates": [
      {
        "manifest": "docs/harness/knowledge/i18n-and-text-boundaries/manifest.md",
        "reason": "all rules non-renderable (expired/drifted/superseded)"
      }
    ],
    "known_issues": [
      {
        "source": "drifted_rule",
        "id": "internal-components/rule-5",
        "domain": "internal-components",
        "reason": "violation rate 40%"
      },
      {
        "source": "superseded_rule",
        "id": "exception-and-error-contracts/rule-2",
        "domain": "exception-and-error-contracts",
        "reason": "superseded_by rule-7"
      },
      {
        "source": "filtered_manifest",
        "id": "docs/harness/knowledge/i18n/manifest.md",
        "domain": "i18n",
        "reason": "no renderable active rules"
      }
    ],
    "advisory_knowledge": [
      {
        "source": "user_override",
        "id": "internal-components/gap-2",
        "domain": "internal-components",
        "text": "新 service 使用 constructor injection（用户声明，未在代码里找到 high-confidence 证据）",
        "weight": "advisory"
      },
      {
        "source": "expired_rule",
        "id": "exception-and-error-contracts/rule-5",
        "domain": "exception-and-error-contracts",
        "text": "（原 free_form_review rule：避免在 Controller 层直接 catch RuntimeException）— last_verified 已过期",
        "weight": "advisory"
      }
    ],
    "knowledge_requirements": [
      {
        "rule_id": "internal-components/rule-1",
        "manifest_file": "docs/harness/knowledge/internal-components/manifest.md",
        "applies_to": ["src/main/java/com/acme/core/service/**"],
        "requirement_text": "业务层 service 必须返回 Result<T>，禁止抛 BusinessException",
        "violation_test": "must_use_wrapper",
        "wrapper_type": "Result"
      },
      {
        "rule_id": "exception-and-error-contracts/rule-3",
        "manifest_file": "docs/harness/knowledge/exception-and-error-contracts/manifest.md",
        "applies_to": ["src/main/java/**"],
        "requirement_text": "不得直接 throw RuntimeException 裸类型",
        "violation_test": "must_not_throw_raw_exception",
        "exception_types": ["RuntimeException", "Exception"]
      }
    ],
    "relevant_knowledge_files": [
      "docs/harness/knowledge/internal-components/manifest.md",
      "docs/harness/knowledge/exception-and-error-contracts/manifest.md"
    ]
  }
}
```

**8 个字段说明**：

| 字段 | 类型 | 含义 |
|------|------|------|
| `effective_index_status` | string | 运行时计算的状态：`active` / `stale` / `drifted` / `disabled` |
| `snapshot_id` | string \| null | INDEX 的 snapshot_id；Step 0 跳过时为 null |
| `retrieval_outcome` | enum | `success` / `coordinator_miss` / `all_candidates_filtered` |
| `filtered_candidates` | array | 仅在 `all_candidates_filtered` 时填写，解释为何无可渲染 rule |
| `known_issues` | array | drifted/superseded/filtered manifest 的 diagnostic，贯穿 Stage 3/4/review |
| `advisory_knowledge` | array | 来自 user_override 和 expired_rule 的非强制上下文 |
| `knowledge_requirements` | array | 仅含 `Status: active` rule 的结构化约束，reviewer 据此 FAIL |
| `relevant_knowledge_files` | array | 命中的 manifest 路径列表，仅允许 `docs/harness/knowledge/**/manifest.md` |

---

### Step 6：注入 Task Prompt

将 Step 4 Render Pipeline 产生的两个 view 拼接为 task prompt 前缀，prepend 到 Stage 2 / Stage 3 每个 subagent 的 task prompt 开头：

```
# Project Knowledge Context（由 Stage -0.5 预查 + 按 Status 过滤后 render）

## Binding Rules（违反 → reviewer FAIL）

以下为命中 manifest 中 Status: active 的 rule（已过滤掉 expired / drifted / superseded）：

### internal-components (from internal-components/manifest.md)
- **[internal-components/rule-1]** 业务层 service 必须返回 Result<T>，禁止抛 BusinessException
  适用: src/main/java/com/acme/core/service/**
  violation_test: must_use_wrapper

## Advisory Context（非强制，仅作风格参考，reviewer 不以此为 FAIL 依据）

- **[user_override: internal-components/gap-2]** 新 service 使用 constructor injection（用户声明，未核实）
- **[expired_rule: exception-and-error-contracts/rule-5]** 避免在 Controller 层直接 catch RuntimeException（last_verified 已过期 N 天）

---

硬契约：
1. Binding Rules 必须严格遵循，违反 → reviewer FAIL
2. Advisory Context 作为风格参考，尽量遵循但非强制
3. 若 Binding Rule 与需求冲突 → 停下上报，不要自行决定违反
4. 输出中 echo 一行 "Knowledge check:" 证明你已消化
5. 对每条 Binding Rule，给出遵循证据（file:line 或 test:case）
```

---

## 3. Rule Status 四态运行时影响

| Status | 意义 | Stage -0.5 处理 | strict-reviewer 行为 |
|--------|------|----------------|---------------------|
| `active` | 正常有效的 rule | 加入 `knowledge_requirements`（binding）；注入 Binding Rules view | 违反 → FAIL |
| `expired` | `free_form_review` rule 时间过期，降为主观 advisory | **不**加入 `knowledge_requirements`；镜像进 `advisory_knowledge`（source: expired_rule）；注入 Advisory Context view | 不 FAIL，仅作提示 |
| `drifted` | drift detection 发现该 rule 被 >30% 代码违反，老 rule 过时 | **不**加入 `knowledge_requirements`；**也不**进 `advisory_knowledge`（避免误导）；记 knownIssue；注入 prompt 时不出现此 rule | 不触发 |
| `superseded` | 该 rule 已被另一条 rule 取代 | **不**加入任何 view（既不 binding 也不 advisory）；保留在 manifest 作历史记录 | 不触发 |

**drifted 与 expired 的本质区别**：

- `expired`：rule 本身没过时，只是 `free_form_review` 的时间窗口到期，无法机器验证，降为 advisory。
- `drifted`：rule 本身已**过时**（代码演化走了另一条路），不应保留为 advisory 否则会误导 subagent；应通过 `--partial-rescan` 更新或删除。

**per-rule Status 与 manifest frontmatter status 的层级分工**：

| 层级 | 字段位置 | 取值 | 管辖范围 |
|------|---------|------|---------|
| 单条 Rule 级 | manifest rule block `**Status**:` | active / expired / drifted / superseded | 单条规则 |
| 整 manifest 级 | manifest frontmatter `status:` | active / partial / drifted / superseded_by | 整个 manifest 文件 |

两者各管各的层级，不冲突。manifest 整体 `status: drifted`（多数 rule drift）不代表所有 rule 都 drifted；Render Pipeline 仍按每条 rule 的 per-rule Status 独立过滤，继续渲染剩余 `active` rule。

---

## 4. Stage 4 入口门 + Late Recovery

### Stage 4 入口门

```
Step 0: Disabled bypass
  读 .harness-status.json.knowledgeCheck.effective_index_status
  若 = "disabled" → 跳过 knowledge gate，直接进 strict-reviewer（不做 knowledge-grounding 检查）

Step 1: 读 .harness-status.json.knowledgeCheck

Step 2: 若 snapshot_id 为空 且 INDEX 存在 且 effective_index_status != "disabled"
  → BLOCKED（coordinator 漏跑 Stage -0.5 是系统错误，无 recovery，必须升级用户）

Step 3: 若实际变更文件涉及某 manifest 的 applies_to
  但 relevant_knowledge_files 没包含对应 manifest
  → 进入 Late Recovery（见下）

Step 4: 通过 → 进 strict-reviewer
```

**同步约定**：Stage -0.5 Step 0 必须把 `effective_index_status` 写入 `.harness-status.json.knowledgeCheck`，即便 disabled 也要写，确保 Stage 4 有字段可读：

```json
"knowledgeCheck": {
  "effective_index_status": "disabled",
  "snapshot_id": null,
  ...
}
```

### Stage 4 Late Recovery

当 Stage 4 发现 retrieval 漏召回 manifest（Stage -0.5 做的是 keyword-based 匹配，后来实际 diff 涉及了更多 domain），**不立即升级用户**，执行自动补救（最多 1 次）：

```
Step 1: coordinator 用实际 git diff 重跑 Stage -0.5 的路径匹配部分
  git diff --name-only <baseSha>..HEAD
  不重跑 scout，只跑路径匹配

Step 2: 生成更新的 relevant_knowledge_files + knowledge_requirements（可能新增 N 个 manifest）

Step 3: 对每个新加入的 domain，跑 Stage -0.5 Step 4a
  读 INDEX ## User Overrides + ## Expired Free-Form Rules
  读对应 gaps.md resolved_by_user 块
  append 条目到 advisory_knowledge

Step 4: 更新 .harness-status.json.knowledgeCheck
  保留原 snapshot_id；追加 requirements + advisory_knowledge
  重算所有状态字段（effective_index_status / retrieval_outcome / filtered_candidates / known_issues）

Step 5: 若 recovery 新增的 manifest 含 knowledge_requirements（即有 Status: active 的 rule）：
  不直接进 reviewer
  dispatch remediation task 到 Stage 3：
    使用同一 Render Pipeline，只注入 rendered Binding Rules + Advisory Context
    禁止把 raw manifest text 传给 subagent
    让 subagent 检查当前实现是否违反 binding rules，若违反则修
  remediation 完成 → 重进 Stage 4 入口门（走完整检查）

Step 6: 若 recovery 后仍 BLOCK → 升级用户

Step 7: recovery 只跑 1 次，避免循环；第二次 late BLOCK 直接升级用户
```

Recovery 的本质：承认 keyword-based pre-retrieval 有局限，实际 ground truth 是 diff，所以最后用 diff 兜底。

---

## 5. empty retrieval 路由表

当 `relevant_knowledge_files` 为空时，按 `effective_index_status` + `retrieval_outcome` 分派：

| effective_index_status | retrieval_outcome | 动作 |
|------------------------|-------------------|------|
| `disabled` | （不适用） | 跳过 knowledge gate，直接进 reviewer |
| `active` / `stale` / `drifted` | `coordinator_miss` | **BLOCKED**（INDEX 存在但 coordinator 没写 knowledgeCheck，系统错误）|
| `active` / `stale` / `drifted` | `all_candidates_filtered` | 不 BLOCK；记 known_issue；reviewer 输出 warn："所有相关 manifest 都不含可渲染 active rule（整文件 superseded_by，或所有 rule 都 expired/drifted/superseded），建议 `--partial-rescan`"；允许本轮继续 |
| `active` / `stale` / `drifted` | `success`（但路径不命中任何 domain） | 不 BLOCK（本任务无相关 knowledge，正常情况）|

**`retrieval_outcome` 三种取值含义**：

| 值 | 含义 |
|----|------|
| `success` | 路由匹配执行完毕（即使 relevant_knowledge_files 为空也可能是 success，表示任务路径确实不命中任何 domain） |
| `coordinator_miss` | Stage -0.5 根本没运行或 knowledgeCheck 字段缺失 |
| `all_candidates_filtered` | 路由命中了 manifest，但 Render Pipeline 后所有 manifest 都无可渲染的 active rule |

---

## 6. INDEX.status / effective_index_status / manifest.status 分工

三个状态字段各管不同层级，不可混用：

### `INDEX.status`（scanner 写入，整体索引级别）

取值：`active` / `stale` / `drifted`（**不含 `disabled`**，disable 是用户决策，只在 CLAUDE.md 表达）

| 值 | 含义 | Stage -0.5 行为 |
|----|------|----------------|
| `active` | 正常有效 | 照常注入所有 eligible manifest |
| `stale` | `last_full_scan > 180 天` | retrieval 照常跑，注入时加 "knowledge is stale" warning |
| `drifted` | 至少一个 manifest 或大量 rule 已漂移 | retrieval 照常跑，注入时加 "some manifests drifted, run --partial-rescan" warning |

### `effective_index_status`（Stage -0.5 运行时计算，写入 `.harness-status.json`）

取值：`active` / `stale` / `drifted` / `disabled`

`disabled` 值只有在 CLAUDE.md 含 `harness-knowledge: disabled` 时才出现。其余三值与 `INDEX.status` 同义。

`effective_index_status` 是 Stage 4 和 strict-reviewer 读取的字段，**不直接读 INDEX.status**。

### `manifest.status`（单 domain，整 manifest 文件级别，scanner 写入 frontmatter）

取值：`active` / `partial` / `drifted` / `superseded_by:<newer-file>`

| 值 | 含义 |
|----|------|
| `active` | 正常 |
| `partial` | scanner 超时或 scout 不全，信心降级 |
| `drifted` | drift detection 发现多数 rule（>50%）违反，整体 drifted |
| `superseded_by:<file>` | rescan 后旧版归档，被新版取代 |

manifest 整体 `status: drifted` 时，Stage -0.5 仍读该 manifest；Render Pipeline 按 per-rule Status 过滤，只渲染剩余 `Status: active` 的 rule，同时在注入 prompt 里加 warning：

```
manifest <name> 处于 drifted 状态，仅 active rule 参与 Binding Rules；建议 --partial-rescan
```

---

## 7. `violation_test` 枚举

`knowledge_requirements` 每条 rule 必须有 `violation_test`，取值如下：

| 值 | 含义 | 配套字段 |
|---|------|---------|
| `must_use_wrapper` | 必须返回某 wrapper 类型 | `wrapper_type: <class>` |
| `must_call_component` | 必须通过某组件调用 | `component: <package.Class>` |
| `must_not_throw_raw_exception` | 禁止抛某些裸异常 | `exception_types: [<class>]` |
| `must_use_package` | 必须导入/调用某 package | `package: <prefix>` |
| `must_not_use_pattern` | 禁止某代码模式（regex 或 AST 签名） | `pattern: <regex>` |
| `must_annotate_with` | 必须带某注解 | `annotation: <class>` |
| `free_form_review` | 无法机器检查，交 LLM 判断 | `requirement_text` + `manual_review_reason` + `expiry_after_days` |

`free_form_review` 是保底，scanner 生成 rule 时应尽量匹配到前 6 种结构化类型。

**`free_form_review` 额外约束**：

- 必须带 `manual_review_reason`（为何无法结构化，一句话）
- 必须带 `expiry_after_days`（默认 90 天）
- `--maintain` 检查 `last_verified` + `expiry_after_days`：
  - 超期 → 在 manifest 中标注 `status: expired`；在 INDEX.md `## Expired Free-Form Rules` 表追加一行
  - 未超期或被 `--partial-rescan` 重新采证 → 保持 `status: active`
- 这样任何"能 FAIL 但无法机器校验"的 rule 都有明确退出机制，不会永久绑定

---

## 8. CLAUDE.md 触发契约

scanner 完成后自动在目标项目 CLAUDE.md 末尾追加（幂等，已有则跳过）：

```markdown
<!-- harness-knowledge:start -->
## Harness Knowledge Activation

This project has `docs/harness/knowledge/INDEX.md`. Before any harness-workflow round:

1. Harness coordinator MUST run Stage -0.5 (Project Context Retrieval)
2. Stage 2/3 subagent prompts MUST include knowledge context
3. Stage 4 MUST verify knowledge_requirements compliance

To disable: set `harness-knowledge: disabled` below this block.
<!-- harness-knowledge:end -->
```

幂等条件：检测 `<!-- harness-knowledge:start -->` 标记存在即跳过，不重复追加。

---

## 9. 与 strict-reviewer 的接口

Stage -0.5 通过 `review_target` 的以下字段向 strict-reviewer 透传：

```yaml
relevant_knowledge_files:
  - docs/harness/knowledge/internal-components/manifest.md
knowledge_snapshot_id: "scan-2026-04-21T10:00Z"
retrieval_outcome: "success"
knowledge_requirements:
  - rule_id: "internal-components/rule-1"
    manifest_file: "docs/harness/knowledge/internal-components/manifest.md"
    applies_to: ["src/main/java/com/acme/core/service/**"]
    requirement_text: "业务层 service 必须返回 Result<T>，禁止抛 BusinessException"
    violation_test: "must_use_wrapper"
    wrapper_type: "Result"
known_issues:
  - source: "drifted_rule"
    id: "internal-components/rule-5"
    domain: "internal-components"
    reason: "violation rate 40%"
```

strict-reviewer 在 Step 5 Knowledge Compliance Check 中对 `knowledge_requirements` 每条：

1. 读对应 manifest.md 确认 Rule 存在
2. 读 diff 变更代码，验证是否遵循
3. 违反 → finding severity=high，message=`"violated knowledge rule: <rule_id>"`

Verdict 路由：

| 条件 | verdict |
|------|---------|
| 任一 `knowledge_requirement` 被违反 | FAIL |
| INDEX 存在但 `relevant_knowledge_files = []` 且 `retrieval_outcome = "coordinator_miss"` | BLOCKED |
| INDEX 存在但 `relevant_knowledge_files = []` 且 `retrieval_outcome = "all_candidates_filtered"` | 不 BLOCK；记 known_issue；warn 建议 `--partial-rescan`；允许本轮继续 |
| `retrieval_outcome = "success"` 且 `relevant_knowledge_files = []`（任务路径不命中任何 domain） | 不 BLOCK（本任务无相关 knowledge，正常） |
| 其他 | 按原规则 |

`known_issues` 写入 scorecard 供 audit，不影响 verdict 本身。
