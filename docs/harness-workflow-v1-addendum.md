# Harness-Workflow v1 升级 — CLI + Skill 生态 + Profile + Knowledge Scanner

> 本文是 `harness-workflow-sharing.md`（1796 行 v0 深度介绍）的**追加篇**。
> v0 的 8-Stage / 角色体系 / 分级 / 状态管理 / 并行编排基础不变 —— 本次升级是在它
> 之上**加料**（npm CLI + profile 多轴 + 知识扫描），不是推倒重来。

---

## 1. 为什么要升级

v0 运行良好但暴露四个瓶颈：

1. **分发门槛高**：同事想用 = clone myskills + symlink 20+ skill + 手工搞 CLAUDE.md，
   新电脑接入要 30 分钟。
2. **初始化不幂等**：AI 用 Edit/Write 手工生成项目文件，重新跑一次可能漂移，没法版本化升级。
3. **个人和公司项目一把抓**：企业项目需要强制禁止 `auto_push`、强制过 Java 规范，但 v0 只有
   "一套 8-Stage"，无法按项目差异化。
4. **进存量代码盲写**：接入一个 Java 老项目时 AI 不懂团队约定，写出"初学者味道"的代码。

---

## 2. 四层决策架构（Before / After）

### v0（单体）

```
用户 → /harness-workflow → 一个 363 行 skill 做完全部事（路由 + Stage 0-8 + 监控 + 维护）
```

### v1（分层）

```
Layer 1: task-dispatcher              ← 一条消息多任务时外层 splitter（不变）
             │
Layer 2: harness-workflow             ← 代码任务统一入口（保留 / 触发词兼容）
             │ 转发
             ↓
Layer 3: profile-entry                ← 内部路由器（不对外）
             │ marker → matcher → fast-path → 优先级
             ↓
Layer 4: 叶子 skill                    ← harness-{quick|bugfix|feature|refactor}
                                         或 company-{quick|bugfix|feature|refactor}
```

**关键不变**：用户用 `/harness-workflow` 触发，和 v0 一模一样。拆分发生在内部。

---

## 3. Profile 多轴调度

### 三正交轴

| 轴 | 含义 | 取值 |
|----|------|------|
| **Profile** | 项目属性（个人 / 企业 / 自定义）| `harness`（personal）/ `company-mt` / `default` 兜底 |
| **Task Type** | 任务复杂度 | `quick` / `bugfix` / `feature` / `refactor` |
| **Aggression Mode** | AI 激进度 | `conservative` / `standard` / `aggressive` |

### 优先级硬规则

```
profile.hard_floor > per-invocation flag (/yolo /safe) > profile.default_mode > conservative 兜底
```

**关键**：`hard_floor` 永远赢。company-mt 的 `auto_push` 在 hard_floor 里 → `/yolo` 也不能让它自动 push。

### 项目自动识别 profile

`.harness-profile` marker（CLI 写入）+ `~/.claude/profiles/*.yml` fallback matcher：
- path_glob（`~/Movies/alopex-*` → company-mt）
- git_remote_regex（`meituan|internal-host.com` → company-mt）
- file_exists（`pom.xml` → 可能 company-mt）

matcher 按 `priority × specificity` 打分，最高分胜。

---

## 4. CLI 层：harness-workflow-cli npm 包

### 哲学：CLI 写文件，Skill 做决策

| 动作 | 谁做 |
|------|------|
| 探测项目类型 / 装模板 / 写 `.harness-profile` / 更新 `.harness/managed-files.json` | **CLI**（确定性、幂等） |
| 判断走哪个 profile / 拆任务 / 执行 8-Stage / 审稿 | **Skill**（AI 决策） |

### 5 个命令

| 命令 | 用途 |
|------|------|
| `harness init [--preset personal\|company-mt]` | 新项目一键脚手架（33-41 files） |
| `harness adopt` | 已有项目接入，不覆盖用户改动 |
| `harness doctor [--json]` | 健康检查 + bootstrap 握手 |
| `harness maintain [--upgrade]` | 漂移检测 + 升级模板 |
| `harness scan [--domain X] [--apply-answers]` | 触发 knowledge 扫描 |

### ManagedFile 四态（防误伤用户改动）

```
target_hash vs source_hash vs bundled_hash → 算出：
  unchanged  / update-available / user-modified / conflict / missing
```

- `user-modified`：跳过（保留用户改动）
- `conflict`：personal 写 `.rej.<ts>`；company-mt 整批 BLOCK
- `update-available`：`maintain --upgrade` 可安全写

### 三级降级（新电脑 clone 即用）

| Tier | 步骤 | 适用 |
|------|------|------|
| 1 | `npm install -g harness-workflow-cli` | 有网 + 有 npm |
| 2 | `cd <clone>/packages/harness-cli && npm install && npm run build` + PATH/alias/npm link | 只有 node |
| 3 | AI 手工读 `packages/harness-cli/resources/templates/**` + Edit/Write | 完全无 node（应急） |

---

## 5. Knowledge Scanner — 进存量代码不再盲写

### 问题

接入某 Java 企业老项目，AI 不懂：
- 这个项目的 Service 层用 `Result<T>` 还是抛 `BusinessException`？
- 审批流权限判断是 `taskCode` 还是 `ruleCode`？
- Mapper XML 和 Java 接口方法名的对齐约定？

写出来的代码**语法对但风格不对**，融入不了团队。

### 解法：5 Domain 扫描 + Stage -0.5 注入

**5 个扫描 domain**：
1. `style-and-structure`（Service/Controller/Mapper 约定）
2. `internal-components`（内部 SDK / utility / 复用组件）
3. `exception-and-error-contracts`（异常契约 / Result<T> 等）
4. `integrations-and-sdk-usage`（MQ / HTTP / Redis / DB）
5. `i18n-and-text-boundaries`（文本边界 / 硬编码中文检测）

**产物**：`docs/harness/knowledge/<domain>/{manifest, evidence, gaps}.md`
- `manifest.md`：规则清单（每条带 `violation_test` + `Evidence: file:line`）
- `evidence.md`：规则的代码证据（≥2 正例 + 可选反例）
- `gaps.md`：扫描不确定的问题（≤ 8 条放 `TODO.md` 让用户批量回答）

### Stage -0.5 Project Context Retrieval

每个 Round 开始前，先读 `INDEX.md` + `manifest.md`，按：
- 本轮 changed_files 的 path glob
- 需求描述的 keyword
- always-load domains（style-and-structure + internal-components）

选出 `relevant_knowledge_files`，render 为两视图：
- **Binding Rules**（Status=active）→ 违反即 reviewer FAIL
- **Advisory Context**（Status=expired / user_override）→ 仅风格参考

### Stage 4 strict-reviewer Step 5 知识合规检查

reviewer 读 `knowledge_requirements` 逐条核查 diff 是否违反：
- `must_use_wrapper`（必须返回 Result<T>）
- `must_not_throw_raw_exception`
- `must_annotate_with`（必须带 @Transactional）
- …7 种 violation_test 枚举

违反 → finding 指向具体 file:line，**verdict = FAIL**。

---

## 6. 企业 Profile：company-mt 实体

### hard_floor 6 种动作（永禁）

- `auto_push` / `force_push` / `auto_merge`（不自动 push / merge）
- `destructive_ops`（禁 `rm -rf` / `DROP TABLE`）
- `rewrite_history`（禁 `git rebase` / `amend`）
- `network_install`（Stage 8 不跑 `mvn install` 触发外部下载）

### 4 个 overlay skill

```
company-quick    在 harness-quick 基础上禁止触碰 pom.xml / SQL migration / 权限代码 / 审批流 / i18n
company-bugfix   在 harness-bugfix Step 1 注入 Java profile_hints；Step 5 case 加 Meituan-style metadata
company-feature  Stage 1 前强制 invoke java-standards；Stage 3 新 i18n 时 invoke java-backend-i18n-refactor；
                 Stage 8 严格执法 6 hard_floor
company-refactor Phase 1 baseline 额外要 JaCoCo ≥70% + MyBatis SQL fixture；Phase 4 P95 阈值 3%（vs personal 5%）
```

### 4 份 reference seed（init 时投放）

- `java-rules.md` → `docs/harness/knowledge/style-and-structure/manifest.md`（5 条基础 rule）
- `enterprise-sdk.md` → `docs/harness/knowledge/integrations-and-sdk-usage/manifest.md`（MessageSender / HttpClientWrapper / Redis key 格式）
- `approval-flow.md` → `docs/memory/constraints/harness_approval_flow.md`（`ruleCode` vs `taskCode`）
- `i18n.md` → `docs/harness/knowledge/i18n-and-text-boundaries/manifest.md` + `docs/memory/constraints/harness_i18n_boundaries.md`

---

## 7. 使用流程（端到端）

### 新同事接入

```bash
# 1. clone 源仓库
git clone <myskills-git-url> ~/myskills

# 2. 选一条 CLI 安装路径
cd ~/myskills/packages/harness-cli
npm install && npm run build
ln -sf $PWD/bin/cli.js /usr/local/bin/harness

# 3. symlink 所有 skill 到 ~/.claude/skills/
cd ~/myskills
for d in harness-workflow harness-init profile-entry harness-common \
         harness-quick harness-bugfix harness-feature harness-refactor \
         strict-reviewer team-pd team-architect team-senior-dev \
         team-junior-dev team-qa team-security team-commander \
         task-dispatcher investigate office-hours gstack; do
  ln -sf "$PWD/$d" ~/.claude/skills/
done
ln -sf "$PWD/team-init" ~/.claude/skills/   # 向后兼容别名

# 4. 配全局 hook / MCP / plugin（见 harness-workflow/references/hooks.md）

# 5. 任一项目接入
cd my-java-project
# Claude Code 对话中对 AI 说"接入 harness"
# → harness-init skill 自动探测 + 跑 harness init --preset company-mt
```

### 日常开发

```
用户: "修一下 refund 接口的死循环"
→ /harness-workflow 触发
→ profile-entry 读 .harness-profile = company-mt，识别为 bug → 路由到 company-bugfix
→ company-bugfix Step 1 invoke investigate → 定位问题
→ Step 2 写失败测试 → Step 3 最小修复 → Step 4 全量 regression
→ Step 5 写 docs/memory/cases/ 记录根因 + Meituan-style metadata
→ Stage 8 收尾（company-mt hard_floor：不自动 push）
```

---

## 8. 和其他 agent 工作流的差异

| 项 | harness-workflow v1 | 单 skill 方案 | "Just a prompt" 方案 |
|----|-------------------|------------|-------------------|
| 复杂任务拆分 | task-dispatcher 自动 | ❌ | ❌ |
| 任务类型路由 | profile-entry 4 类 | 人工判断 | AI 猜 |
| 企业 policy 强制 | profile.hard_floor 硬规则 | ❌ | ❌ |
| 项目约定感知 | knowledge scanner | ❌ | ❌ |
| 审稿严格度 | strict-reviewer 5 硬门 | code review 看心情 | ❌ |
| 状态持久化 | STATE.json + memory + learnings 三层 | 无 | 无 |
| 新电脑接入 | CLI 一键或 3 级降级 | 靠运气 | 靠文档 |

---

## 9. 边界 / 非目标

- **不是代替 Claude Code 的一般对话能力** —— 只接管"代码任务"，闲聊 / 问答 / 看文档不走工作流
- **不是强 AI 决策** —— 所有破坏性动作（git push / npm publish / 真实 repo 跑 init）都保留用户 explicit 授权
- **不是绑定单一模型** —— skill 以 markdown 形式提供规范，Claude Opus / Sonnet / Haiku 都能读；CLI 的 JSON Schema 单一真源保证跨模型一致
- **不是替代 CI/CD** —— 重在"开发 Round"层面质量，合规 / 发布 / 监控生产仍由 CI/CD + 观测系统做

---

## 10. 参考

- Spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md`
- Plan：`harness-workflow/plans/2026-04-24-harness-cli-integration-implementation.md`
- 迭代文档：`docs/harness-iteration-2026-04-24.md`（+ 2026-04-25 Addendum）
- 原 v0 深度介绍：`docs/harness-workflow-sharing.md`（1796 行，本文前章）
