---
name: harness-feature
description: harness 体系的 **feature sub-skill**，承担完整 8-Stage 自治开发流程（需求分析 → 架构审查 → 规划 → 实现 → Spec审查 → 质量审查 → QA测试 → 安全审查 → 收尾）。每轮前置 Stage -0.5 Project Context Retrieval 读取 knowledge manifests，注入 Binding Rules + Advisory Context 到 subagent task prompt。Stage 4/5/6/7 调 strict-reviewer（4 硬门，含 knowledge-grounding）。由 profile-entry 派发（task_types.feature）或用户 /harness-workflow 触发。继承原 harness-workflow 8-Stage 主体，增量加 knowledge gate + 融入 profile 的 aggression mode。
---

# harness-feature — Feature 开发主路径

> **通常由 `profile-entry` 调用**（task_types.feature）。直接触发支持，但会跳过 profile-entry 的 fast-path 检查和 aggression mode 解析。直接调用时默认以 `standard` mode 执行。

---

## 1. 触发场景

harness-feature 在以下三种情况下被激活：

| 来源 | 条件 |
|------|------|
| **profile-entry 派发** | profile 的 `task_types.feature` 指向本 skill；task-dispatcher 将代码任务交给 profile-entry，profile-entry 排除 fast-path、无 `/fix`/`/refactor` flag，默认路由至此 |
| **用户显式触发** | `/harness-workflow`（无特殊参数）或需求描述涉及新功能、子系统、跨模块改造 |
| **task-dispatcher 判定 feature** | 外层 task-dispatcher 评估子任务规模为 M/L/XL，且不命中 bugfix 或 refactor 特征 |

---

## 2. 前置：Stage -0.5 Project Context Retrieval

**每轮开始时，在 Stage 0/1/2 之前必须执行。所有规模级别（S/M/L/XL）均不跳过。**

完整流程共 6 步，详细规范见 [`../harness-common/references/knowledge-retrieval.md`](../harness-common/references/knowledge-retrieval.md)。下方为执行摘要：

### Step 0：Disable Check（先于一切）

读目标项目 `CLAUDE.md` 的 `<!-- harness-knowledge:start --> ... <!-- harness-knowledge:end -->` 块：
- 含 `harness-knowledge: disabled` → 设 `effective_index_status = disabled`，写入 `.harness-status.json.knowledgeCheck`，**跳过 Stage -0.5 其余所有步骤**
- 块不存在或无 `disabled` 标记 → 继续

### Step 1：INDEX 存在性检查

- `docs/harness/knowledge/INDEX.md` 不存在 → 跳过 Stage -0.5（项目未接入 knowledge，走普通 harness 模式）
- 存在 → 继续（INDEX.status 的 active / stale / drifted 均不跳过）

### Step 2：Routing 匹配

读 INDEX.md `## Retrieval Routing Rules`，选出 `relevant_knowledge_files`：
- 本轮 `changed_files` 已知 → path glob 匹配
- 只有需求文本 → keyword 匹配 + always-load
- **Always-load**：`style-and-structure/manifest.md` + `internal-components/manifest.md`（无条件）

### Step 3：加载 Manifest（只读 manifest，不读 evidence）

解析每条 Rule 的 Status（active / expired / drifted / superseded）。

### Step 4：Advisory Knowledge 加载

从 INDEX.md `## User Overrides` 和 `## Expired Free-Form Rules` 读取命中 domain 的条目，合并为 `advisory_knowledge` 数组（不进 `knowledge_requirements`，不触发 FAIL）。

### Step 5：写入 `.harness-status.json.knowledgeCheck`

字段含：`effective_index_status`、`snapshot_id`、`retrieval_outcome`（success / coordinator_miss / all_candidates_filtered）、`filtered_candidates`、`known_issues`、`relevant_knowledge_files`、`advisory_knowledge`、`knowledge_requirements`。

路径约束：`relevant_knowledge_files` 只允许 `docs/harness/knowledge/**/manifest.md`，`docs/memory/` 禁止混入。

### Step 6：渲染并注入 Stage 2/3 subagent task prompt 前缀

按 Rule Status 过滤，渲染两个分离视图：

```
# Project Knowledge Context（由 Stage -0.5 预查 + 按 Status 过滤后 render）

## Binding Rules（违反 → reviewer FAIL）
以下为 Status: active 的 rule（已过滤 expired / drifted / superseded）：
### <domain> (from <domain>/manifest.md)
- **[<rule_id>]** <规则描述>
  适用: <path glob>  violation_test: <enum>

## Advisory Context（非强制，reviewer 不以此为 FAIL 依据）
- **[user_override: <gap_id>]** <override_text>
- **[expired_rule: <rule_id>]** <requirement_text> (last_verified 已过期 N 天)

---
硬契约：
1. Binding Rules 必须严格遵循，违反 → reviewer FAIL
2. Advisory Context 作为风格参考，尽量遵循但非强制
3. 若 Binding Rule 与需求冲突 → 停下上报
4. 输出中 echo 一行 "Knowledge check:" 证明消化
5. 对每条 Binding Rule，给出遵循证据（file:line 或 test:case）
```

**Render Pipeline**（Stage -0.5 执行）：active → Binding Rules；expired → Advisory Context；drifted/superseded → 跳过（追加 knownIssue）。

---

## 3. 8-Stage 主体

> 各 Stage 详细指南 → 见 [`../harness-workflow/references/workflow.md`](../harness-workflow/references/workflow.md)
> 规模自动分级（S/M/L/XL）：AI 自判，不询问用户

### 任务规模分级

| 级别 | 判断依据 | 激活 Stage |
|------|---------|-----------|
| **S** | 1-3 文件、无架构变更 | 2 → 3 → 4 → 5 → 8 |
| **M** | 新功能模块、中等复杂度 | 0 → 2 → 3 → 4 → 5 → 6 → 8 |
| **L** | 跨模块改造、新子系统 | 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 |
| **XL** | 多个独立子系统 | 自动拆为多个 Round，每轮 M/L 级 |

---

### Stage 0：需求分析（team-pd）

**规模**：M/L/XL 激活；S 跳过

**执行**：调用 `team-pd` skill 或以 PD 角色直接分析（不走问答循环）

**输入**：用户需求文本 + `CLAUDE.md` + `docs/STATE.json` + Stage -0.5 已注入 knowledge context

**输出**：更新 `STATE.json` 需求条目 + 简要 PRD 摘要（内联，不生成独立文件）

**Prompt 模板** → 见 [`../harness-workflow/prompts/pd-prompt.md`](../harness-workflow/prompts/pd-prompt.md)

---

### Stage 1：架构审查（team-architect）

**规模**：L/XL 激活；S/M 跳过

**执行**：调用 `team-architect` skill

**输入**：Stage 0 需求摘要 + `CLAUDE.md` 现有 ADR 段

**输出**：新 ADR 追加到 `CLAUDE.md`（有架构变更时）或确认"无需变更"

**Prompt 模板** → 见 [`../harness-workflow/prompts/architect-prompt.md`](../harness-workflow/prompts/architect-prompt.md)

---

### Stage 2：规划（superpowers:writing-plans）

**规模**：永不跳过（所有级别）

**执行**：调用 `superpowers:writing-plans`

**输入**：需求 + 架构决策（如有）+ `.harness-context.json` 技术栈信息 + knowledge context（来自 Stage -0.5）

**输出**：`docs/superpowers/plans/round-N-<topic>.md`

**心跳强制**：Stage 2 开始时 MUST 创建 `.harness-status.json` + `CronCreate`（5 分钟频率）

**baseSha 捕获**（Stage 3 派发前，Coordinator MUST 执行）：

```bash
BASE_SHA=$(git rev-parse HEAD)
# 写入 .harness-status.json.baseSha 和 .baseCapturedAt
```

Stage 4 依赖此 SHA 做计划-实际文件漂移检测；`baseSha` 缺失时 Stage 4 入口 BLOCKED。

Stage 2 若含 `## Architecture Decisions`，写 `docs/memory/decisions/harness_<date>_<slug>.md`（Stage 8 索引）。

---

### Stage 3：实现（superpowers:subagent-driven-development）

**规模**：永不跳过

**执行**：调用 `superpowers:subagent-driven-development`，按 plan 派发 subagent

**Memory Context 注入**（BEFORE 派发每个 subagent）：

Coordinator 预查 `docs/memory/ERRORS.md` + `docs/memory/cases/*.md`，命中结果写入 `.harness-status.json.memoryCheck`，并在每个 subagent task prompt 前置 Memory Context 块。

**Memory check 输出强制**：subagent 输出 MUST 含 `Memory check:` 行（强相关 action 需要实现证据）；缺失 → BLOCKED，retry 一次；二次缺失 → escalate。

**Knowledge Context**：Stage -0.5 渲染的 Binding Rules + Advisory Context 作为 task prompt 前缀（已在 Step 6 准备好）。

**并行规则**：互不依赖的 Task 可并行；修改同一文件必须串行

---

### Stage 4：Spec 审查（strict-reviewer + Knowledge Entrance Gate + Late Recovery）

**规模**：永不跳过

**Knowledge Entrance Gate**（strict-reviewer 调用前）：

```
0. Disabled bypass：若 effective_index_status = "disabled" → 跳过 knowledge gate
1. 读 .harness-status.json.knowledgeCheck
2. snapshot_id 为空 AND INDEX 存在 AND effective_index_status != "disabled" → BLOCKED（系统错误）
3. 实际变更文件命中 manifest applies_to，但 relevant_knowledge_files 未包含对应 manifest
   → 进入 Stage 4 Late Recovery（见下）
4. 通过 → 进 strict-reviewer
```

**Stage 4 Late Recovery**（retrieval 漏召回的自动补救，最多执行 1 次）：

1. 用实际 `git diff --name-only <baseSha>..HEAD` 重跑 Stage -0.5 路径匹配部分
2. 生成更新的 `relevant_knowledge_files` + `knowledge_requirements`
3. 对每个新加入 domain，重跑 Step 4a（advisory_knowledge 补充）
4. 更新 `.harness-status.json.knowledgeCheck`（所有 5 个字段全部刷新）
5. 若 recovery 新增 manifest 含 active rule → 先派 remediation subagent（用 rendered Binding Rules，禁止 raw manifest text）
6. recovery 失败或仍 BLOCK → 升级用户
7. 第二次 late BLOCK 直接升级，不再 recovery

**strict-reviewer 调用**：

```yaml
stage: "spec"
claims_to_verify: # plan 的 acceptance criteria
memory_cases: # .harness-status.json.memoryCheck.matches
changed_files: # git diff --name-only <baseSha>..HEAD
relevant_knowledge_files: [...]
knowledge_snapshot_id: "scan-..."
knowledge_requirements: [...]
retrieval_outcome: "success|coordinator_miss|all_candidates_filtered"
known_issues: [...]
```

调用协议 → 见 [`../harness-common/references/reviewer-integration.md`](../harness-common/references/reviewer-integration.md)

不通过 → 自动修复（最多 3 轮），仍失败 → 记入 knownIssues 并继续。

---

### Stage 5：质量审查（codex + strict-reviewer）

**规模**：永不跳过

**执行**：
1. 调用 `codex:rescue` 做跨模型审查
2. 调用 `superpowers:requesting-code-review`
3. L/XL 级额外调用 `multi-agent-collab` 讨论争议点

**strict-reviewer 调用**：同 Stage 4 pattern，但 `stage: "quality"`

**问题分类**：机械问题自动修复；Critical 自动修复（最多 3 轮）；Important → aggressive 模式自动采纳 / standard 模式批量呈现；Minor 跳过

---

### Stage 6：QA 测试（team-qa + strict-reviewer stage=qa）

**规模**：M/L/XL 激活；S 级且无逻辑变更时跳过

**执行**：调用 `team-qa` skill

**strict-reviewer 调用**：`stage: "qa"`；`claims_to_verify` 含 PRD acceptance criteria + plan test checklist

P0 Bug → 自动修复并重新测试（最多 3 轮）

**Prompt 模板** → 见 [`../harness-workflow/prompts/qa-prompt.md`](../harness-workflow/prompts/qa-prompt.md)

---

### Stage 7：安全审查（team-security + strict-reviewer stage=security）

**规模**：L 级涉及安全敏感操作时；所有 XL 级；S/M 跳过

**执行**：调用 `team-security` skill

**strict-reviewer 调用**：`stage: "security"`；claims 为 OWASP 式具体威胁陈述

漏洞 → 自动修复并重新扫描

**Prompt 模板** → 见 [`../harness-workflow/prompts/security-prompt.md`](../harness-workflow/prompts/security-prompt.md)

---

### Stage 8：收尾（Coordinator）

**规模**：永不跳过

**操作清单**：

1. **STATE.json** — 追加 completedRound，更新 features/knownIssues
2. **WALKTHROUGH.md** — 追加本轮记录
3. **CLAUDE.md** — 如有新 ADR 或 gotcha，更新
4. **claude-mem** — 写本轮 observation（含 knowledge_check 状态）
5. **knowledge 刷新检查** — 若本轮改动范围较大，检查 INDEX 是否需要 `--partial-rescan`（提示用户，不自动执行）
6. **CronDelete** — 无条件删除心跳 cron job
7. **删除 `.harness-status.json`** — 清理临时状态文件
8. **git commit**（仅 commit，**不自动 push**）；最终报告后可询问是否推送
9. **检查 pendingRounds** — 有则自动启动下一轮

---

## 4. Aggression Mode 影响

aggression mode 由 `profile-entry` 解析后传入，遵循 precedence 铁律：

```
profile hard_floor > invocation flag > profile default > conservative（内置默认）
```

| Mode | 对本 skill 的影响 |
|------|-----------------|
| **conservative** | S/M 级也等用户确认架构变更；Stage 5 Important 问题批量呈现等确认；每轮结束询问是否继续下一轮 |
| **standard** | 默认行为：S 级全自治，M/L 级仅在 XL 拆轮时询问方向一次 |
| **aggressive** | Stage 5 Important 问题自动采纳；XL 拆轮不询问；加速通过确认步骤；但 hard_floor 列出的操作（auto_push、force_push、destructive_ops）**任何 mode 均不执行** |

**hard_floor 不可绕过**：即使 `/yolo` flag，profile hard_floor 列出的项永远受限。`profile-entry` 遭遇冲突时**必须显式输出**：

```
Requested: /yolo
Effective: company-safe (profile policy: auto_push=false)
Reason: company profile hard-floor
```

---

## 5. Stage 8 自检清单

完成收尾前，coordinator MUST 逐项确认：

```
- [ ] Plan doc 在 docs/superpowers/plans/
- [ ] 编译通过 + 测试通过（命令从 .harness-context.json 读取）
- [ ] Spec Review 通过（含 knowledge 合规门，或 disabled bypass 已记录）
- [ ] Codex Review 无 CRITICAL
- [ ] QA 测试通过（或跳过，原因记录）
- [ ] Security 审查通过（或跳过，原因记录）
- [ ] STATE.json 已更新
- [ ] WALKTHROUGH.md 已追加
- [ ] CLAUDE.md 已更新（如有 ADR）
- [ ] claude-mem observation 已写入（含 knowledge_check: 状态）
- [ ] .harness-memory.yml 契约通过验证（forbidden_paths 非空 + 无 broad 模式）
- [ ] harness_project_stack.md 反映当前技术栈（Stage 8 刷新）
- [ ] Scorecard 追加了本轮所有 review 条目（无遗漏）
- [ ] 本轮新 case（若 errors_collection 阈值达成）已写入 docs/memory/cases/
- [ ] MEMORY.md 索引 marker 块内已追加新决策 / 案例链接
- [ ] CronDelete 已执行（如有心跳）
- [ ] .harness-status.json 已删除
- [ ] git commit 完成（push 需用户确认）
- [ ] knowledge INDEX 是否需要 --partial-rescan（本轮改动触及 manifest applies_to 边界时提示）
- [ ] 若有 drifted / expired rule 在 knownIssues，已在 WALKTHROUGH.md 中记录
```

---

## 6. 最终报告格式

```
╔══════════════════════════════════════════════════╗
║  ✅ Round N 完成 — <topic>                       ║
╠══════════════════════════════════════════════════╣
║  📋 需求: <摘要>                                  ║
║  📐 规模: S/M/L/XL                              ║
║  ⏱  耗时: Xm Ys                                 ║
║                                                  ║
║  Stage -0.5  Knowledge Retrieval  ✅/⏭  <状态>   ║
║  Stage 0     需求分析             ✅/⏭  Xm Ys    ║
║  Stage 1     架构审查             ✅/⏭  Xm Ys    ║
║  Stage 2     规划                 ✅   Xm Ys    ║
║  Stage 3     实现                 ✅   Xm Ys    ║
║  Stage 4     Spec 审查            ✅/❌  Xm Ys    ║
║  Stage 5     质量审查             ✅/❌  Xm Ys    ║
║  Stage 6     QA 测试              ✅/⏭  Xm Ys    ║
║  Stage 7     安全审查             ✅/⏭  Xm Ys    ║
║  Stage 8     收尾                 ✅   Xm Ys    ║
║                                                  ║
║  knowledge_check: active / disabled / skipped    ║
║  knowledge_requirements: N 条 binding rules 验证  ║
║  known_issues: <drifted/expired rule 列表或 none> ║
║                                                  ║
║  📦 产出: N 文件 · N commits · N 测试             ║
║  📝 文档: STATE.json + WALKTHROUGH.md 已更新       ║
╚══════════════════════════════════════════════════╝
```

最终报告后，给用户**具体验证步骤**（不是列文件，是操作指引）。

---

## 7. 与 harness-common 的引用关系

本 skill 仅定义流程编排，不复制基础设施规范。所有共享能力通过引用获取：

| 主题 | 引用路径 |
|------|---------|
| Stage -0.5 完整规范 | [`../harness-common/references/knowledge-retrieval.md`](../harness-common/references/knowledge-retrieval.md) |
| strict-reviewer 调用协议 | [`../harness-common/references/reviewer-integration.md`](../harness-common/references/reviewer-integration.md) |
| Memory 契约 | [`../harness-common/references/memory-contract.md`](../harness-common/references/memory-contract.md) |
| 项目初始化（Phase 1-4） | [`../harness-common/references/phase-init.md`](../harness-common/references/phase-init.md) |
| 技术栈探测规则 | [`../harness-common/references/project-detection.md`](../harness-common/references/project-detection.md) |
| `--maintain` audit 流程 | [`../harness-common/references/maintenance.md`](../harness-common/references/maintenance.md) |
| Scanner 5 阶段 pipeline | [`../harness-common/references/project-scanner.md`](../harness-common/references/project-scanner.md) |
| 8-Stage 详细定义 | [`../harness-workflow/references/workflow.md`](../harness-workflow/references/workflow.md) |
| 自治决策树 | [`../harness-workflow/references/autonomy.md`](../harness-workflow/references/autonomy.md) |
| 心跳监控机制 | [`../harness-workflow/references/monitoring.md`](../harness-workflow/references/monitoring.md) |
| 并行 Agent 指南 | [`../harness-workflow/references/parallel-agents.md`](../harness-workflow/references/parallel-agents.md) |

---

## 8. XL 级自动拆轮

大需求自动拆为多个 Round，写入 `STATE.json.pendingRounds`，依次串行执行：
- 每轮产出可独立运行和测试
- 后轮依赖前轮产出但不修改前轮代码
- 每轮 ≤ 10 个 Task

Round N Stage 8 完成 → 检查 pendingRounds → 有则自动启动 Round N+1（conservative mode 下询问确认）→ 无则输出最终报告。
