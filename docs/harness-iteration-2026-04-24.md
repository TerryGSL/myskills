# Harness 工作流迭代文档（2026-04-24）

本次迭代把 harness 工作流从"单体 skill + 个人仓库"升级为"skill 生态 + npm CLI 包 +
项目级落地"的完整体系。

---

## 一、目标

**起点问题**：

1. 单一的 harness-workflow skill（363 行）承担了需求分析、架构、规划、实现、审查、QA、
   安全、收尾全部 8 Stage + 初始化 + 维护 + 全部 prompt 模板，阅读和修改都困难。
2. 项目初始化 / adopt / maintain 这些确定性文件操作全靠 AI 用 Edit/Write 做，不幂等，
   新电脑接入需要手工 clone + symlink + 逐一 verify 文件。
3. 没有 knowledge scanner — 进入存量 Java 项目时不懂已有代码约定，写出的代码融入不了
   团队风格。
4. 无 profile 概念 — 个人项目和公司 Java 项目用同一套策略，safety policy 不能按项目
   差异化（比如公司项目必须禁止 auto_push，个人项目可以 /yolo 放飞）。
5. 缺对外分发机制 — 同事想用同一套工作流只能 clone 整个 myskills，不符合 skill 包
   "pip install" 级的使用习惯。

**迭代目标**：

- 解耦单体 skill 为"路由入口 + 叶子 skill"生态
- 做出 `harness-workflow-cli` npm 包承担确定性文件生成
- 加入 knowledge scanner 机制（接入项目前自动摸清代码约定）
- 加入 profile 多轴调度（project × task_type × aggression_mode）
- 落地 Java 企业 `company-mt` preset，含硬底线 policy
- 用单一 `team-init` skill 作为对外唯一入口

---

## 二、核心成果

### 新增能力（9 项）

| 能力 | 说明 |
|------|------|
| Canonical types 单一真源 | `packages/harness-cli/src/types/*.ts` + `resources/schemas/*.json` 四份；skill 正文用 `<!-- @generated:key -->` 锚点自动派生，杜绝字段漂移 |
| ManagedFileRecord 四态 | `unchanged` / `update-available` / `user-modified` / `conflict` / `missing`；CLI 升级时不误伤用户改动 |
| Knowledge scanner（5 domain）| `style-and-structure` / `internal-components` / `exception-and-error-contracts` / `integrations-and-sdk-usage` / `i18n-and-text-boundaries`；扫描产出 `docs/harness/knowledge/<domain>/{manifest,evidence,gaps}.md` |
| strict-reviewer Step 5 | 知识合规检查 —— reviewer 读 `knowledge_requirements`，违反即 FAIL；覆盖 `retrieval_outcome` / `known_issues` / `filtered_candidates` 等 8 字段 |
| Profile 多轴调度 | Profile（`harness` / `company-mt` / `default`）× Task Type（quick/bugfix/feature/refactor）× Aggression Mode（conservative/standard/aggressive）三正交决策 |
| 结构化 fast-path | 1 文件 < 10 行 + 不碰 schema/export/deps → 静默路由 harness-quick；**确定性 regex 判定**，不是 LLM 猜 |
| 用户级 profile registry | `~/.claude/profiles/*.yml`；matcher 按 priority × specificity 打分；支持 `.harness-profile` marker 覆盖 |
| company-mt Java 企业 profile | 完整实体含 hard_floor 6 种 + 4 overlay skill + 4 reference seed（java-rules / enterprise-sdk / approval-flow / i18n）|
| 双 registry 发布 | 同 tarball 同名发 npm public + 内部 registry；preflight `npm view @version` + 半成功补救决策树 |

### 保留能力（11 项，原 harness-workflow 全能力）

| 能力 | 现位置 |
|------|--------|
| 8-Stage 自治工作流 | `harness-feature/references/stages.md` |
| S/M/L/XL 任务规模自动分级 | `harness-feature/references/round-sizing.md` |
| XL 级自动拆轮 + pendingRounds | 同上 |
| Round 间衔接 | 同上 |
| Stage 8 自检清单 | `harness-feature/references/stages.md` Stage 8 |
| Drift Red Flags 警示 | `harness-common/contracts/drift.md`（扩展到 6 类）|
| SessionStart hook 三层触发保障 | `harness-workflow/skill.md` 保留 `/harness-workflow` 触发词 |
| `--maintain` 同步检查 | `harness maintain` CLI + `harness-common/contracts/drift.md` |
| Stage 角色 Prompt 模板 | `harness-feature/prompts/{pd,architect,qa,security}-prompt.md` + `harness-workflow/prompts/` 原位置也保留 |
| `.harness-memory.yml` 契约 + scorecard | `resources/templates/memory/*.template` + CLI init 自动投放 |
| Skill 间关系表 | spec 附录 C（14 本地 skill + 3 外部 Java skill 完整矩阵）|

### 补齐缺口（7 项，本次迭代补上）

| 缺口 | 修复 |
|------|------|
| `docs/STATE.json` 没迁 | `resources/templates/root/STATE.json.template` + init 投放 |
| `docs/DESIGN.md` 没迁 | 同上，按项目类型（UI / 后端 / CLI / SDK）骨架模板 |
| `docs/WALKTHROUGH.md` 没迁 | 同上，Round 0 初始化条目 + Stage 8 追加契约 |
| `.harness-context.json` 未生成 | init.ts `writeContext()` 自动按 `detectProject()` 结果写 buildCommand/testCommand/lintCommand |
| team-init 没提全局依赖 | 新 Step 1：3 插件（claude-mem/codex/superpowers）+ 2 MCP（context7/playwright）+ 7 hooks 预检 |
| `/codex:setup` 未触发 | team-init Step 1 全局依赖预检含此项 |
| 心跳监控 hook | `harness-workflow/references/hooks.md` 保留 `heartbeat-check.sh` 完整模板；team-init Step 1 检查 `~/.claude/hooks/` 就位 |

---

## 三、架构变化（Before / After）

### Before（单体 skill）

```
harness-workflow/
├── skill.md (363 行 一站式 + Phase 1-4 + 8-Stage + 监控 + 维护 + 分级)
├── references/ (13 份：workflow / memory / hooks / monitoring / maintenance / ...)
├── prompts/ (4 份 Stage 角色 prompt)
├── templates/project-memory/ (memory 模板集)
├── specs/ (历史 spec)
└── plans/ (历史 plan)

+ team-init (AI 手工 Edit/Write 初始化)
+ 其他 14 个独立 skill（team-*, investigate, office-hours, gstack, strict-reviewer, task-dispatcher）
```

### After（skill 生态 + CLI）

```
# 代码入口 + 路由
harness-workflow/skill.md           — 公开入口，lifecycle passthrough + 代码任务转发到 profile-entry
profile-entry/                      — 内部路由器（profile 解析 / fast-path / 优先级）+ 3 references
team-init/                          — 对外唯一分发入口（含全局依赖预检 + CLI 三级降级）

# 叶子 skill（profile-entry 从这四个里选一个）
harness-quick/                      — 无仪式（1 文件 < 10 行）+ 1 reference
harness-bugfix/                     — 五步 TDD（investigate → reproduce → fix → regression → case）+ 1 reference
harness-feature/                    — 8-Stage 完整流程 + 4 references + 4 prompts
harness-refactor/                   — 4 阶段重构（baseline → plan → 执行 → 对比）+ 2 references

# 共享基础设施
harness-common/                     — CLI 命令 passthrough 封装 + current.json r/w + drift detection + 3 references
strict-reviewer/                    — Step 5 知识合规检查（Spec 1 第 4 硬门）
harness-workflow/references/        — 生态共享 canonical reference bank（13 份权威规范）
harness-workflow/templates/         — memory 模板集
harness-workflow/prompts/           — Stage 角色 prompt（与 harness-feature/prompts/ 双份）

# npm 包（确定性层）
packages/harness-cli/
├── bin/cli.js                      — npm bin entry（commander）
├── src/
│   ├── commands/                   — init / adopt / maintain / doctor / scan
│   ├── utils/                      — detect / template / materialize / managed-files / profile / learnings / memory / conflict / hash / agent-paths
│   └── types/                      — canonical types（knowledge / review-target / profile / managed-file）
├── resources/
│   ├── schemas/                    — JSON Schema draft 2020-12（× 4）
│   ├── templates/                  — root / memory / knowledge / learnings 模板（27 files）
│   └── presets/
│       ├── personal/               — 默认 profile 资产
│       └── company-mt/             — Java 企业 profile 完整实体（含 4 overlay skill + 4 reference seed + 2 共享 reference）
├── scripts/
│   ├── generate-doc-fragments.ts   — 从 types 派生 skill 正文 @generated 锚点块
│   └── verify-resources.ts         — build-time 门禁（版本锁 + manifest 完整性 + migration-checklist 无 TBD）
├── tests/                          — 87 tests PASS（TDD）
├── bundled-manifest.json           — 分发资源清单
└── package.json                    — name: harness-workflow-cli; bin: harness; files whitelist

# 项目级落地产物（harness init 产出的 18 files）
<target-repo>/
├── .harness-profile                — profile marker
├── .harness-context.json           — 项目探测缓存（buildCommand/testCommand/lintCommand）
├── harness.config.json             — extends preset
├── .harness/
│   ├── current.json                — Round focus 指针
│   ├── managed-files.json          — 四态 hash 追踪（gitignored）
│   └── learnings/{LEARNINGS,ERRORS,FEATURE_REQUESTS}.md
├── docs/
│   ├── STATE.json                  — Round 总册
│   ├── WALKTHROUGH.md              — 操作日志
│   ├── DESIGN.md                   — 按项目类型 VI/API/CLI/SDK 规范
│   ├── memory/
│   │   ├── .harness-memory.yml / MEMORY.md / ERRORS.md / harness_reviewer_scorecard.yml
│   │   └── {cases,decisions,constraints,archive}/
│   └── harness/knowledge/
│       ├── INDEX.md / TODO.md
│       └── {style-and-structure,internal-components,exception-and-error-contracts,integrations-and-sdk-usage,i18n-and-text-boundaries}/{manifest,evidence,gaps}.md
├── CLAUDE.md                       — 含 harness-knowledge + harness-profile 两个 managed block
└── .claude/skills/                 — 项目级 skill 投放（让 Claude Code 在该项目自动识别）
```

---

## 四、使用方式

### 新电脑 / 同事接入的三条路径

#### Tier 1：npm 全局安装（推荐）

```bash
npm install -g harness-workflow-cli
# 之后任意项目
cd my-project
harness init --preset personal  # 或 company-mt
```

#### Tier 2：clone 本地 build（不需要 npm publish）

```bash
git clone <myskills-git-url> ~/myskills
cd ~/myskills
npm install
cd packages/harness-cli
npm run build
# 加 PATH 三选一
ln -sf $PWD/bin/cli.js /usr/local/bin/harness   # 全局 symlink
# 或
npm link                                         # npm 内建
# 或
alias harness="node $PWD/bin/cli.js"             # 本 shell alias
```

#### Tier 3：完全无 CLI（应急降级）

AI 直接读 `packages/harness-cli/resources/templates/**` 模板 + Edit/Write 到目标项目。
代价：没有 ManagedFile 双 hash 追踪，后续 `harness maintain --upgrade` 无法跑；
只建议应急 / 断网演示场景。

### 全局 skill 安装（所有 Tier 都需要）

```bash
cd ~/myskills
# symlink 全部 skill 到 ~/.claude/skills/
for d in harness-workflow team-init profile-entry harness-common \
         harness-quick harness-bugfix harness-feature harness-refactor \
         strict-reviewer team-pd team-architect team-senior-dev \
         team-junior-dev team-qa team-security team-commander \
         task-dispatcher investigate office-hours gstack; do
  ln -sf "$PWD/$d" ~/.claude/skills/
done
```

### 日常使用

新项目：
```
用户 → "接入 harness" → team-init skill → harness doctor --json 握手 → harness init --preset <detected>
```

日常开发：
```
用户 → "修个 bug" / "加功能" / "重构这块" → /harness-workflow → profile-entry 内部路由 →
  quick (fast-path 命中) / bugfix (/fix 或识别) / refactor (/refactor) / feature (默认)
→ 8-Stage（feature）或各叶子 skill 对应流程
```

扫描项目约定：
```
harness scan                       # 全量
harness scan --domain <name>       # 单 domain
harness scan --apply-answers       # 处理用户在 TODO.md 的批答复
```

---

## 五、兼容性

### 用户无感迁移

- `/harness-workflow` 触发词**完全保留**
- SessionStart hook `session-init-prompt.txt` **不需要改**
- 老 CLAUDE.md 规则"任何开发任务走 harness-workflow"**继续有效**
- 用户肌肉记忆 0 成本

### Skill 清单（21 个 skill）

**本仓库 14 个本地 skill**：
- `harness-workflow` — 公开工作流入口
- `team-init` — 对外唯一分发入口（项目初始化）
- `profile-entry` — 内部路由器（不对外）
- `harness-common` — 共享基础设施
- `harness-{quick,bugfix,feature,refactor}` — 4 个代码任务叶子
- `strict-reviewer` — 审稿（Step 5 知识合规）
- `team-{pd,architect,senior-dev,junior-dev,qa,security,commander}` — 7 角色（由 harness-feature Stage 0-7 按需 invoke）
- `task-dispatcher` — 顶层任务派发（不变，外层 splitter）
- `investigate` — 调试方法论（harness-bugfix Step 1 invoke）
- `office-hours` — 需求诊断（用户主动触发，Stage -1 前置）
- `gstack` — 浏览器自动化 QA（前端任务时 team-qa 调）

**独立 Java 生态**（Meituan 环境用户本地安装）：
- `meituan-java-standards`
- `java-backend-i18n-refactor`
- `costasset-i18n-phase2`

### 能力缺失检测

`harness doctor` 会在以下情况发 warning 但不 abort：
- 3 插件 / 2 MCP / 7 hooks 任一缺失
- 独立 Java skill 缺失（company-mt 会降级到 bundled references/java-rules.md 保底）
- `docs/harness/knowledge/INDEX.md.last_full_scan > 90 天`

硬 abort 场景：
- `.harness/managed-files.json` 被 git tracked
- `.harness/current.json.workflow_schema_version` 高于当前 CLI 能理解
- `docs/memory/.harness-memory.yml` 不存在

---

## 六、后续工作

### 短期（近 1-2 周）

- 真 `npm publish` 到 npm public + 公司内部 registry（本次迭代完成了 `npm pack --dry-run` 验证，真发布等用户授权）
- 在真实 Java 项目（`alopex-costasset`）跑 `harness scan` 产出完整 5 domain knowledge（当前 smoke 只验证 init 骨架）
- team-init 的 "Step 1 全局依赖预检" 脚本化（当前是 AI 按提示 grep，可以抽成 `harness doctor --deps` 子命令）

### 中期（1-3 个月）

- Round 1-12 实施过程中积累的 learnings 升格到 `docs/memory/cases/`
- knowledge scanner 在多个 Java / Node 项目跑过后，bundled `company-mt/references/java-rules.md` 的 5 条种子可能需要扩充
- harness-feature Stage 3 与 superpowers:subagent-driven-development 的融合深度（当前是 invoke，可以考虑嵌入）

### 长期

- `--agent-type codex` 抽象（当前只 claude）
- Plugin 市场机制（当前 skill 直接打进 CLI bundled，未来可考虑按需从 marketplace 下载）

---

## 七、数据汇总

- **30+ git commits**（从 `c17aa08` 起）
- **npm 包**：`harness-workflow-cli@0.1.0`，44.9 kB tarball / 113 files
- **Skill 生态**：21 个 skill（14 本地 + 3 外部 Java + 4 preset overlay）
- **Tests**：87 PASS（TDD，R1-R4 全量测试覆盖）
- **CLI 命令**：5 个（init / adopt / maintain / doctor / scan）
- **Canonical types**：4 份（knowledge / review-target / profile / managed-file）+ 对应 JSON Schema
- **References**：6 个新 skill 累计 14 份 references + harness-workflow/ 13 份 canonical bank = 27 份
- **Prompts**：4 份 Stage prompt（pd / architect / qa / security，双份）
- **Templates**：27 份 bundled template（root 5 + memory 7 + knowledge 17 + learnings 3）

---

## 八、关键决策

| 决策 | 选项 | 最终选择 | 理由 |
|------|------|----------|------|
| npm 包名 | `@twelve/harness-cli` / `harness-workflow-cli` / `@ziwei/harness-cli` | `harness-workflow-cli` | 无 scope 顶级名，内外部 registry 共用 |
| 仓库布局 | myskills monorepo / 独立 repo | monorepo `packages/harness-cli/` | canonical types 共享最简 |
| 发布目标 | npm public / 私有 / 双 | **双 registry 同 tarball 同名** | 对外开源 + 公司内部都能装 |
| team-init 命名 | 废弃换 harness-bootstrap / 改名 / **保留 v1 内容优化** | 保留原名 | 用户习惯 + 避免双入口 |
| CLI 边界 | CLI 做一切 / skill 做一切 / 分层 | 分层（CLI 幂等写 + skill 智能决策） | Codex R1-R5 反复强调的核心 |
| 历史话语 | 保留 reshape 说明 / 完全去掉 | **完全去掉** | skill 是 canonical current doc，不带历史包袱 |

---

文档结束。迭代方案的完整 spec 见 `harness-workflow/specs/2026-04-24-harness-cli-integration-design.md`，
完整实施 plan 见 `harness-workflow/plans/2026-04-24-harness-cli-integration-implementation.md`。
