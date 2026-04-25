# 8-Stage 详解

Detailed stage-by-stage execution contract for harness-feature. SKILL.md
references this file; read sections by demand.

## 目录

- [Stage -0.5：Project Context Retrieval](#stage--05)
- [Stage 0：需求分析（team-pd）](#stage-0)
- [Stage 1：架构审查（team-architect）](#stage-1)
- [Stage 2：规划（superpowers:writing-plans）](#stage-2)
- [Stage 3：实现（subagent-driven）](#stage-3)
- [Stage 4：Spec 审查（strict-reviewer）](#stage-4)
- [Stage 5：质量审查（codex + code-reviewer）](#stage-5)
- [Stage 6：QA 测试（team-qa）](#stage-6)
- [Stage 7：安全审查（team-security）](#stage-7)
- [Stage 8：收尾（Coordinator）](#stage-8)

---

## Stage -0.5

**目的**：Spec 1 knowledge scanner 集成 —— Round 开工前把项目相关的 knowledge rules 注入到下游 Stage。

**前置读**：
- `.harness/current.json` 检查 `workflow_schema_version` 哨兵（缺失 / 过高 → abort）
- `CLAUDE.md` 若含 `harness-knowledge: disabled` → 跳过本 Stage

**流程**：
1. 读 `docs/harness/knowledge/INDEX.md` 的 Domain Map + Retrieval Routing Rules
2. 按 path glob + keyword + always-load 选 `relevant_knowledge_files`
3. 按 Rule Status 过滤 render 两个视图：
   - **Binding Rules**（Status=active）→ 违反即 reviewer FAIL
   - **Advisory Context**（Status=expired / user_override）→ 仅风格参考
4. 写 `.harness/status.json.knowledgeCheck`（8 字段全集，见 `harness-common/contracts/memory-layers.md`）

**disabled bypass**：CLAUDE.md 内含 `harness-knowledge: disabled` → 整个 Stage -0.5 跳过，但 `.harness-status.json.knowledgeCheck.effective_index_status = "disabled"` 仍写入（供下游 Stage 4 识别）。

**Late Recovery（Stage 4 兜底）**：若 Stage 4 发现 coordinator 漏跑本 Stage → 用实际 git diff 重跑，**必须重算全 8 字段**（见 Spec 1 Round 11 Gap 3）。

完整算法：Spec 1 `2026-04-23-project-knowledge-scanner-design.md` §411-528。

---

## Stage 0

**角色**：team-pd（Opus 推荐）

**Invoke**：
```
Skill(team-pd) with:
  task_description
  resolved_profile
  resolved_mode
```

**Prompt 模板**：[prompts/pd-prompt.md](../prompts/pd-prompt.md)

**产出**：
- `PRD.md`（用户故事 + 验收标准 + 边界情况）
- `DESIGN.md`（交互流程 + 数据流向 / 按项目类型调整）

**degraded fallback**：team-pd skill 缺失 → 提示"team-pd 不可用，走通用需求总结"，继续但标 degraded。

**写 `.harness/current.json`**：`currentStage: "requirement-analysis"`

---

## Stage 1

**角色**：team-architect（Opus 推荐）

**Invoke**：
```
Skill(team-architect) with:
  PRD.md path
  DESIGN.md path
```

**Prompt 模板**：[prompts/architect-prompt.md](../prompts/architect-prompt.md)

**产出**：
- ADR（如涉及架构决策）→ 写 `docs/memory/decisions/harness_<date>_<slug>.md`
  - Frontmatter schema 见 `harness-common/contracts/memory-layers.md`
- 若无架构变更 → 输出"无需变更"

---

## Stage 2

**角色**：superpowers:writing-plans

**Invoke**：
```
Skill(superpowers:writing-plans) with:
  spec_file_path
```

**产出**：`docs/superpowers/plans/round-N.md`（bite-sized step TDD）

**硬约束**：
- 每 step 必须有 Files / Run / Expected / Commit 四段
- 全部 step 加起来 ≤ 10 Task
- 进 Stage 3 前必须 strict-reviewer 审稿（`stage: "spec"`）

---

## Stage 3

**角色**：superpowers:subagent-driven-development

**Invoke**：
```
Skill(superpowers:subagent-driven-development) with:
  plan_file_path
```

**Subagent 分派**：
- 核心模块 / 复杂逻辑 → `team-senior-dev` subagent
- CRUD 模块 / 业务 boilerplate → `team-junior-dev` subagent（可与 senior 并行）

**每 Task 走 TDD**：写测试 → FAIL → 实现 → PASS → commit。

**硬约束**：
- 每 commit 一 Task，不攒批
- 连续 3 Task 测试 FAIL → 停下反思，升级到用户

---

## Stage 4

**角色**：strict-reviewer（扩展 Step 5 知识合规）

**Invoke**：
```
Skill(strict-reviewer) with review_target:
  changed_files
  diff_summary
  stage: "spec"
  relevant_knowledge_files       ← Stage -0.5 注入
  knowledge_snapshot_id
  knowledge_requirements         ← Step 5 逐条验证
  retrieval_outcome
  known_issues
```

**Verdict 规则**：
- FAIL → 自动修复最多 2 轮；连续 FAIL → 升级用户
- `retrieval_outcome: coordinator_miss` → BLOCKED（不是代码错，是系统错）

完整契约：`strict-reviewer/SKILL.md`（Required Steps Step 5）

---

## Stage 5

**角色**：codex + superpowers:code-reviewer

**Invoke**：
- 跨模型审查：`codex:codex-rescue` 调 GPT 视角审 diff
- Claude 侧：`superpowers:receiving-code-review` 消化 codex 反馈

**硬约束**：CRITICAL finding 自动修复最多 3 轮；连续 FAIL → 升级用户。

---

## Stage 6

**角色**：team-qa（Opus 推荐）

**Invoke**：
```
Skill(team-qa) with:
  changed_files
  resolved_profile
```

**Prompt 模板**：[prompts/qa-prompt.md](../prompts/qa-prompt.md)

**前端任务**：自动 invoke `gstack` 浏览器自动化做 E2E。

**硬约束**：P0 bug 自动修复；P1 以下记到 learnings ERRORS。

---

## Stage 7

**角色**：team-security

**Invoke**：
```
Skill(team-security) with:
  diff
  resolved_profile
```

**Prompt 模板**：[prompts/security-prompt.md](../prompts/security-prompt.md)

**company-mt profile 下强制启用**（在 `profile.compliance_hooks.required_checks`）。
发现漏洞 → 自动修复 + 写 `docs/memory/cases/` 记录。

---

## Stage 8

**角色**：Coordinator（harness-feature 本身，不 invoke 其他 skill）

**收尾清单**：

1. 更新 `.harness/current.json`：
   - `currentFeature: null`
   - `currentStage: null`
   - `updatedAt: <ISO-8601>`
2. 追加 `docs/memory/cases/` 若本轮 errors_collection 阈值达成
3. 追加 learnings 三文件 observation（LEARNINGS / ERRORS / FEATURE_REQUESTS 按场景）
4. 检查 profile.hard_floor，禁止以下动作：
   - `auto_push` / `force_push` / `auto_merge`（严格 company-mt）
   - `rewrite_history`（没 explicit 用户授权禁止）
   - `network_install`（不跑 mvn install 等触发外部 repo download）
5. `git commit`（message Conventional Commits 格式）
6. **不 auto push**（用户必须显式授权）
7. 写 `claude-mem` observation 记录本 Round 要点

**硬约束**：hard_floor 违反 → `harness doctor` 立即 BLOCKED，要求人工接管。

---

## Round 间衔接

Stage 8 完成后：
- 读 `.harness/current.json.pendingRounds`（XL 级场景）
  - 有 → 自动启动 Round N+1
  - 无 → 输出最终汇总报告

详见 [references/round-sizing.md](round-sizing.md)。

---

## Canonical Reference Bank — harness 生态共享权威

`harness-workflow/references/` 和 `harness-workflow/templates/` 是整个 harness 生态的
**canonical reference bank**（跨 skill 共享的权威规范）。

下列文件在各 Stage 实操中按需读取（跨 skill 引用，不重复写）：

| 文件 | 何时读 | 内容 |
|------|-------|------|
| `harness-workflow/references/monitoring.md` | Stage 3 启动并行 agent 前、XL 级 Round | 心跳机制完整契约：`.harness-status.json` schema、`cronJobId` CronCreate 协议、Stage 3 每 2 分钟 / 单 agent 每 5 分钟心跳频率 |
| `harness-workflow/references/workflow.md` | Stage 3-8 细节疑问时 | 各 Stage 更完整的描述、自治决策分支、subagent 派发规则 |
| `harness-workflow/references/templates.md` | Stage 8 收尾前 | `docs/STATE.json` 初始模板（`rounds[]`/`features[]`/`knownIssues[]` 结构）、`docs/WALKTHROUGH.md` 操作日志格式、`docs/DESIGN.md` 按项目类型模板 |
| `harness-workflow/references/maintenance.md` | `--maintain` 模式 | 同步检查详细规则、漂移恢复 playbook |
| `harness-workflow/references/autonomy.md` | 决策分支不确定时 | 自治决策树、人工介入触发条件（何时升级用户） |
| `harness-workflow/references/hooks.md` | 需要安装/修改 hooks 时 | 7 个 hook 完整模板（check-dangerous / check-secrets / heartbeat-check 等）+ settings.json 配置 |
| `harness-workflow/references/parallel-agents.md` | Stage 3 subagent 派发 | senior/junior 并行策略、冲突解决 |
| `harness-workflow/references/protocols.md` | 跨 skill invoke 时 | skill 间参数传递约定 |
| `harness-workflow/references/project-detection.md` | Phase 2 探测细节 | 各语言 / 框架的详细 detection rule |
| `harness-workflow/references/reviewer-integration.md` | Stage 4/5 strict-reviewer invoke | review_target 完整字段 + Stage-specific 审稿点 |
| `harness-workflow/references/memory.md` | docs/memory/ 深度使用 | memory doctrine 完整论证（本 skill 的 memory-layers.md 是摘要索引） |
| `harness-workflow/references/memory-migrations.md` | schema 版本升级 | memory 契约迁移步骤 |
| `harness-workflow/references/migration-checklist.md` | R6/T3 验证 | Phase → CLI crosscheck 表（R5/T10 产出） |
| `harness-workflow/templates/project-memory/*` | init/adopt 时（CLI 已打进 bundled） | 原 v1.0 memory 模板集 |

**读取原则**：
- harness-feature 的 references/ 写本 skill 特定的 8-Stage 契约（4 份）
- 生态共享规范（监控 / STATE.json / hooks 模板 / 审稿细节 / memory doctrine）→ 跨引用到 `harness-workflow/references/`
