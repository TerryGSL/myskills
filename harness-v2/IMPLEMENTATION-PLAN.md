# harness-v2 综合实施计划

**日期**: 2026-04-24
**目标**: 在 `harness-v2/` 沙盒里按 profile-based dispatch 架构重构 skill 体系，融合 project-knowledge-scanner 能力；保留 `/Users/twelve/Music/myskills/` 原有 skill 不破坏。

**融合的三份设计**:
1. `docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md` — 架构拆分（profile-entry + 4 task-type sub-skills + harness-common）
2. `docs/superpowers/plans/2026-04-24-profile-based-dispatch-redesign.md` — profile 拆分 plan（16 tasks）
3. `harness-workflow/specs/2026-04-23-project-knowledge-scanner-design.md` — knowledge scanner 能力

**追加用户需求**:
- Stop Hook 监控 context 占用，高占用时再注入 skill
- Setup 命令记录用户场景偏好
- 新架构必须高可用、无 bug、完整版（非 MVP）
- README + DESIGN.md 完整文档

---

## 架构一图

```
用户消息
  ↓
task-dispatcher              （不变，外层并行/串行分解）
  ↓ 每个代码子任务
profile-entry                （新入口，~80 行路由，单次 Skill load 内完成）
  │
  │ Step 0: 读 .harness-profile marker
  │ Step 1: 无 marker → fallback matchers（公开匹配结果）
  │ Step 2: 结构性 fast-path 检查（确定性，基于 git diff）
  │ Step 3: 解析 precedence (hard-floor > flag > profile default > conservative)
  │ Step 4: Skill(<leaf sub-skill>) 加载恰好一个
  ↓
leaf sub-skill
  │   harness-quick     → 1 文件 < 10 行改动，无 ceremony
  │   harness-bugfix    → investigate → reproduce → fix → regression test
  │   harness-feature   → 当前 8-Stage 主体 + Stage -0.5 + knowledge gate
  │   harness-refactor  → baseline → incremental → verify
  ↓ 所有重路径 sub-skill 都引用
harness-common           （共享基础设施：memory / project-detection / phase-init / knowledge scanner / Stage -0.5）
  ↓ 审稿统一调
strict-reviewer          （4 硬门：grounding / reproduction / coverage / knowledge-compliance）
```

---

## 三维正交

| 维度 | 决定什么 | 如何解析 |
|----|----|----|
| **Profile** | 哪套 skill pack 负责（`harness` / `company` / `default`） | `.harness-profile` marker → fallback matchers → `default` |
| **Task type** | profile 内走哪个 workflow 变体（`quick` / `bugfix` / `feature` / `refactor`） | 结构性 fast-path → 显式 flag（`/quick` `/fix` `/refactor`） → profile 默认 |
| **Aggression mode** | 执行时多自治（`conservative` / `standard` / `aggressive`） | hard_floor > flag（`/yolo` `/safe`） > profile 默认 > conservative |

**Precedence 铁律**：`profile hard_floor > invocation flag > profile default > conservative`。公司 profile 的 `auto_push=false` 无 flag 可绕。

---

## 新文件结构（harness-v2/ 内）

```
harness-v2/
├── profile-entry/                           (新，入口路由)
│   ├── SKILL.md                             ~100 行
│   └── references/
│       ├── profiles.md                      registry schema + matcher
│       ├── precedence.md                    precedence 契约
│       ├── fast-path.md                     结构性 fast-path allowlist
│       └── task-type-contract.md            跨 pack 契约
├── harness-common/                          (新，共享基础设施)
│   ├── SKILL.md                             ~100 行
│   └── references/
│       ├── memory-contract.md               （从 harness-workflow 迁入）
│       ├── project-detection.md             （迁入）
│       ├── phase-init.md                    （Phase 1-4 抽出）
│       ├── knowledge-retrieval.md           Stage -0.5 + render pipeline
│       ├── project-scanner.md               5-phase scan pipeline
│       ├── reviewer-integration.md          strict-reviewer 调用契约
│       └── maintenance.md                   --maintain 12 项 audit
├── harness-quick/                           (新)
│   └── SKILL.md                             ~60 行
├── harness-bugfix/                          (新)
│   └── SKILL.md                             ~100 行
├── harness-feature/                         (新，8-Stage 主体)
│   ├── SKILL.md                             ~180 行
│   └── prompts/                             （从原 harness-workflow 迁入）
│       ├── pd-prompt.md
│       ├── architect-prompt.md
│       ├── qa-prompt.md
│       ├── security-prompt.md
│       └── scanner-prompts.md               新：5 domain scanner prompts
├── harness-refactor/                        (新)
│   └── SKILL.md                             ~120 行
├── harness-workflow/                        (重塑为 profile stub)
│   └── skill.md                             ~80 行 — 兼容老命令 passthrough
├── harness-common/templates/project-knowledge/   (scanner 脚手架模板)
│   ├── INDEX.md.template
│   ├── TODO.md.template
│   ├── style-and-structure/
│   │   ├── manifest.md.template
│   │   ├── evidence.md.template
│   │   └── gaps.md.template
│   ├── internal-components/ (同上三文件)
│   ├── exception-and-error-contracts/
│   ├── integrations-and-sdk-usage/
│   └── i18n-and-text-boundaries/
├── strict-reviewer/                         (升级：4 硬门 + 5 knowledge 字段)
│   └── SKILL.md                             扩展 Step 5 + Input schema
├── hooks/                                   (新，Stop Hook)
│   └── context-monitor.sh
├── setup/                                   (新，用户偏好设置)
│   └── setup-harness.sh
├── tools/                                   (新，契约测试)
│   └── harness-pack-test
├── task-dispatcher/                         (保留，小调整兼容 profile-entry)
├── team-*/                                  (全部保留)
├── investigate/ office-hours/               (保留)
├── docs/                                    (已复制，作为参考)
├── README.md                                (新，使用指南)
└── DESIGN.md                                (新，设计思路)
```

用户级 profile registry（不在 harness-v2/，但脚手架要生成）：
```
~/.claude/profiles/
├── default.yml                              always-match fallback
├── harness.yml                              个人项目 profile
└── company.yml.template                     公司项目 stub
```

---

## 任务拆分（24 tasks / 8 phases）

### Phase A: Profile Registry（用户级 YAML）

**A1** — 创建 `~/.claude/profiles/` 目录 + 3 个 YAML（default / harness / company.yml.template）
- 这些文件在用户 home，不在 harness-v2 内
- 但步骤一样：幂等检查，不覆盖已有自定义内容

### Phase B: profile-entry 入口

**B1** — `harness-v2/profile-entry/SKILL.md`（~100 行路由逻辑）
- 按序：marker 查找 → fallback matchers → 结构性 fast-path → precedence → 加载 leaf sub-skill
- 禁：自己改代码 / LLM 分类 / 跨 turn 持久化

**B2** — `harness-v2/profile-entry/references/profiles.md`（registry schema + matcher 规则）

**B3** — `harness-v2/profile-entry/references/precedence.md`（precedence 契约示例）

**B4** — `harness-v2/profile-entry/references/fast-path.md`（结构性 fast-path allowlist + detection）

**B5** — `harness-v2/profile-entry/references/task-type-contract.md`（跨 pack sub-skill 契约）

### Phase C: harness-common 共享层

**C1** — `harness-v2/harness-common/SKILL.md`（共享基础设施入口，~100 行）

**C2** — 迁移：`harness-v2/harness-common/references/memory-contract.md`（从 `harness-v2/harness-workflow/references/memory.md` 改名/移动 + 调整引用）

**C3** — 迁移：`harness-v2/harness-common/references/project-detection.md`（从原位置移入）

**C4** — 新写：`harness-v2/harness-common/references/phase-init.md`（从 harness-workflow Phase 1-4 抽出）

**C5** — 新写：`harness-v2/harness-common/references/knowledge-retrieval.md`（Stage -0.5 完整流程 + render pipeline）

**C6** — 新写：`harness-v2/harness-common/references/project-scanner.md`（5-phase scan pipeline）

**C7** — 新写：`harness-v2/harness-common/references/reviewer-integration.md`（strict-reviewer 调用契约 + 5 knowledge 字段 + retrieval_outcome + known_issues）

**C8** — 新写：`harness-v2/harness-common/references/maintenance.md`（--maintain 12 项 audit：原 memory 6 + 新 knowledge 6）

### Phase D: Knowledge Scanner Templates

**D1** — 5 domain 目录 + `INDEX.md.template` + `TODO.md.template`（path: `harness-v2/harness-common/templates/project-knowledge/`）

**D2** — 5 × `manifest.md.template`（含 Rule ID + Status 四态 + Supersedes fields + violation_test enum）

**D3** — 5 × `evidence.md.template` + 5 × `gaps.md.template`

**D4** — `harness-v2/harness-feature/prompts/scanner-prompts.md`（5 domain scanner subagent prompts）

### Phase E: 4 task-type sub-skills

**E1** — `harness-v2/harness-quick/SKILL.md`（~60 行）
- 1 文件 / 1 行 / 无 ceremony
- 直接改 + commit
- memory observation 照常（轻量）
- 不走 Stage -0.5（fast path 跳过 knowledge gate）
- 不走 strict-reviewer（fast path 跳过）

**E2** — `harness-v2/harness-bugfix/SKILL.md`（~100 行）
- Step 1: 调 `investigate` skill
- Step 2: 复现
- Step 3: 修
- Step 4: 加回归测试
- Step 5: commit + memory observation
- 调 Stage -0.5（读相关 knowledge）
- 调 strict-reviewer（含 knowledge gate）

**E3** — `harness-v2/harness-feature/SKILL.md`（~180 行）
- 当前 8-Stage 主体
- 前置：Stage -0.5 Project Context Retrieval
- Stage 4/5/6/7 调 strict-reviewer（4 硬门全开）
- Stage 8 收尾：memory refresh + knowledge check

**E4** — `harness-v2/harness-refactor/SKILL.md`（~120 行）
- baseline 捕获（测试通过，行为快照）
- 增量计划（小 commit）
- 持续验证
- 与 baseline 对比
- 调 Stage -0.5（读相关 knowledge，refactor 强依赖）
- 调 strict-reviewer（含 knowledge gate）

### Phase F: strict-reviewer 升级

**F1** — `harness-v2/strict-reviewer/SKILL.md`
- Input schema 加 5 knowledge 字段（`knowledge_snapshot_id` / `relevant_knowledge_files` / `knowledge_requirements` / `retrieval_outcome` / `known_issues`）
- Required Steps 加 Step 5 Knowledge Compliance Check
- Verdict 决定规则加 knowledge 违反 → FAIL、coordinator_miss → BLOCKED、all_candidates_filtered → knownIssue
- Output 加 `known_issues_echoed` 字段

### Phase G: 重塑 harness-workflow + hooks + setup + 工具

**G1** — `harness-v2/harness-workflow/skill.md` 重塑为 profile 声明 stub（~80 行）
- 声明 harness profile
- 老命令（`--init` / `--adopt` / `--maintain` / `--next`）passthrough 到 harness-common
- 兼容用户既有肌肉记忆

**G2** — `harness-v2/hooks/context-monitor.sh`
- PostToolUse hook 监控 context 占用
- 高占用 + workflow 进行中 → 输出"建议重新注入 profile-entry"

**G3** — `harness-v2/setup/setup-harness.sh`
- 交互式 / 一次性命令
- 记录用户偏好：主力场景（个人 / 公司 / 混合）、push 策略默认、启用的 profiles
- 输出到 `~/.claude/profiles/` 对应 YAML

**G4** — `harness-v2/tools/harness-pack-test`（契约校验脚本）
- 跑 fixture 输入
- 校验任意 skill pack 是否符合 task-type-contract
- 违规非零退出

**G5** — `harness-v2/task-dispatcher/SKILL.md` 小改
- 更新 "与 harness-workflow 的关系" → "与 profile-entry 的关系"
- 代码任务交给 profile-entry 而非直接 harness-workflow

### Phase H: 文档 + 验证 + push

**H1** — `harness-v2/README.md`（使用指南，中文）
- 项目意图
- 使用方法（如何激活 harness-v2 / 如何回退原 skill）
- 各 skill 职责速查
- 常见场景示例

**H2** — `harness-v2/DESIGN.md`（设计思路）
- 演化历史（单体 → 分层）
- 三维正交设计
- Knowledge scanner 架构
- Stop Hook 与 Setup 的角色

**H3** — 端到端验证
- 所有新 skill 的 SKILL.md frontmatter 可 parse
- 交叉引用无断链
- YAML 模板可渲染
- 契约测试跑通

**H4** — commit + push

---

## 执行策略

**并行化**：Phase B/C/D/E/F/G 内部 task 之间大多独立，派 subagent 并行做：
- Phase A: 1 task 主 agent 做
- Phase B: 5 tasks 并行派 subagent（5 个文件独立写）
- Phase C: 8 tasks 可分 2-3 批并行
- Phase D: 4 tasks 并行
- Phase E: 4 tasks 并行
- Phase F: 1 task 主 agent 做（strict-reviewer 改动需要仔细）
- Phase G: 5 tasks 并行
- Phase H: 主 agent 做（verification 需要看整体）

**subagent 模型选择**：
- 小 task（单文件写作 < 200 行）→ haiku 或 sonnet
- 中 task（单文件写作 200-500 行）→ sonnet
- 大 task（整个 skill 重构 / 大文件内容整合）→ sonnet / opus

**质量保证**：
- 每个 subagent 的 prompt 里给：源 spec / 参考文件 / 明确输出期望 / 硬格式要求
- 主 agent 快速 review 每个 subagent 的产出（grep 关键 section / 行数 / cross-ref）
- 出问题 → 修 or 重派 subagent

**不做深度 codex review**（前面的 spec review 已证明边际递减）

---

## 执行产出 contract

每个 skill 文件：
- 顶部 YAML frontmatter: `name` + `description`（description ≥ 100 字符）
- 主体 markdown（中文为主，技术术语英文）
- 无 TBD / TODO / placeholder

每个 references/*.md 文件：
- ≥ 5 H2 sections
- 含 spec 交叉引用
- 无断链

## 执行顺序（自主跑，不再问用户）

1. 立即开工，先跑 Phase A（profile registry）
2. Phase B/C/D/E/F/G 按上述并行策略派 subagent
3. Phase H 主 agent 做验证 + README + DESIGN + push
4. 完成后汇报最终状态

---

## 用户指示确认

- ✅ 新文件夹 `harness-v2/` 已建，原 skill 不动
- ✅ 现有 skill 已复制进 harness-v2/
- ✅ 会过程中用 subagent 提速保质
- ✅ 完成后 push
- ✅ README + DESIGN 完整文档
- ✅ Plan 中文主导

下一步：开始 Phase A。
