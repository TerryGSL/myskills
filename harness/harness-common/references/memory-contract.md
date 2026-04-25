# Memory Contract — 共享版

> **迁移说明**：本文档从 `harness-workflow/references/memory.md` 迁入（harness 架构重构），所有 harness-* task-type sub-skill 共享本契约。原路径的文件作为历史参照保留，本文档为权威版本。

> 本文档是 harness 体系内项目长期记忆机制的权威 runtime 规范。
> 完整设计推导见 `docs/specs/2026-04-22-memory-reviewer-upgrade.md`。

---

## 1. 两类记忆的分工

harness 管理的是**项目长期记忆**，与两种账户级记忆系统明确分工、互补。

**harness `docs/memory/`（本规范范围）**：跟随 repo 走。git 追踪、团队共享、跨设备。目标是 3 个月/1 年后新人打开仓库也能读懂的案例、决策、约束。由 `.harness-memory.yml` 作为机器可读 contract 锚定所有权与行为。

**claude-mem 插件**：负责每轮 observation 的语义搜索（SQLite + embedding）。适合每轮变更记录、技术发现、按需语义搜索。不跟随 repo，不被 git 追踪。两者互补：claude-mem 管"每轮发生了什么"，`docs/memory/` 管"项目级沉淀的知识"。

**Claude Code auto-memory**：账户级，跟着用户账户走，换设备/换用户/多人协作全丢。适合用户偏好、工作流规则、用户个人的项目上下文。**本规范不涉及 auto-memory**，harness 不读写也不依赖该层。

三者职责无交叉：harness 写 `docs/memory/`，claude-mem 记 observation，auto-memory 保用户偏好。

## 2. `.harness-memory.yml` Contract

### 2.1 Schema

```yaml
schema_version: "1.0.0"              # required, semver

project:
  name: "acme-dashboard"
  type: "nextjs"
  root_fingerprint: "package.json:name=acme-dashboard"

owned_paths:                         # required — harness 可读写
  - "docs/memory/.harness-memory.yml"            # contract 本身
  - "docs/memory/harness_reviewer_scorecard.yml" # scorecard
  - "docs/memory/MEMORY.md"                      # 人类导航索引（HTML marker 块内）
  - "docs/memory/ERRORS.md"                      # 错误案例总索引（HTML marker 块内）
  - "docs/memory/harness_*.md"                   # harness 托管的根级 md
  - "docs/memory/cases/harness_*.md"
  - "docs/memory/decisions/harness_*.md"
  - "docs/memory/constraints/harness_*.md"
  - "docs/memory/archive/harness_*.md"           # 归档的 md（superseded cases 等）
  - "docs/memory/archive/harness_*.yml"          # 归档的 yml（scorecard rollover 等）

forbidden_paths:                     # required — 绝对黑名单，胜过 owned_paths
  - "docs/memory/private/**"
  - "docs/memory/team-written/**"

suspect_rules:                       # optional, default []
  - id: "auth-session"
    memory_paths:
      - "docs/memory/cases/harness_2026-04-15_safari_cookie.md"
    applies_to:
      paths: ["src/auth/**", "middleware.ts", "app/api/auth/**"]
      symbols: ["refreshSession", "setSessionCookie"]
      deps: [{ name: "next-auth", range: ">=5" }]
      commit_keywords: ["auth", "session", "cookie"]
    match: "any"                     # any | all
    action: "mark_suspect"           # mark_suspect | require_review

errors_collection:                   # required
  min_criteria: 2
  criteria:
    - "diagnosis_over_30m"
    - "cross_module"
    - "repeated"
    - "platform_specific"
    - "user_visible"
    - "invalidated_assumption"

archive_policy:                      # required
  hot_index_max_lines: 200
  archive_after_days_unused: 180
  archive_if_status: ["superseded", "archived"]
  cold_dir: "docs/memory/archive"

audits:                              # optional, default all null
  last_full_audit: null
  last_error_audit: null
  last_reviewer_score_audit: null
  conflicts: []                      # HTML-marker 块内冲突记录

supersession:
  format: "relative-path#case-id"

reviewer:                            # required
  scorecard_path: "docs/memory/harness_reviewer_scorecard.yml"
```

### 2.2 版本演化

| 级别 | 含义 |
|------|------|
| Patch (1.0.0 → 1.0.1) | 字段描述修正 / typo / 非语义变化 |
| Minor (1.0.0 → 1.1.0) | 向后兼容新增字段 |
| Major (1.x → 2.0.0) | 行为变化 / 所有权变化 / 字段改名 |

Migration steps 声明式写在 `../references/memory-migrations.md`。每次 major bump 补一节。

### 2.3 失败处理

| 场景 | 动作 |
|------|------|
| Contract 缺失 | `--init/--adopt` 时创建；autonomous mode 只创建最小 harness 集合 |
| Schema 过老（major 低） | 运行 migration；否则 BLOCKED |
| Schema 过新（major 高） | **只读模式**，harness 不写任何 memory |
| YAML malformed | BLOCKED。**拒绝 auto-fix**（数据丢失陷阱） |
| Contract 与磁盘矛盾 | 只补齐 harness 托管的缺失文件；**绝不删除未知文件** |

### 2.4 硬约束

- `forbidden_paths` 必填，不能为空 — 防止用户配置遗漏黑名单
- **禁止 broad unscoped 模式**：`owned_paths` 里任何**不带 `harness_` 前缀或非显式文件**的通配（如 `docs/memory/**`、`docs/memory/*.md`、`**/*.yml`）直接 **BLOCKED**，**无关** `forbidden_paths` 是否有条目。允许的模式：
  - 具体文件（`docs/memory/MEMORY.md`）
  - `harness_` 前缀通配（`docs/memory/*/harness_*.md`、`docs/memory/archive/harness_*.yml`）
  - 显式 `harness/` 子目录（`docs/memory/archive/harness/**`）
- **逃生门**：若项目确实需要 broad ownership（极少见），必须在 contract 里显式设 `allow_broad_owned_paths: true`，harness 会在第一次加载时要求用户交互确认（autonomous_mode 下拒绝加载）

---

## 3. `docs/memory/` 物理形态

### 3.1 目录布局

```
docs/memory/
├── .harness-memory.yml              ← contract（机器锚点）
├── MEMORY.md                        ← 人类导航用主索引
├── ERRORS.md                        ← 错误案例总索引（链到 cases/）
├── harness_project_stack.md         ← 技术栈快照（harness 托管）
├── harness_workflow.md              ← 工作流接入事实（harness 托管）
├── harness_reviewer_scorecard.yml   ← strict-reviewer 评分板
├── cases/                           ← 每个 bug 一个 dated 文件
│   └── harness_<date>_<slug>.md
├── decisions/                       ← 架构决策（Stage 2 产出）
│   └── harness_<date>_<slug>.md
├── constraints/                     ← 遗留约束 / 业务限制
│   └── harness_<slug>.md
└── archive/                         ← superseded / 冷存档
    └── harness_<date>_<slug>.md
```

### 3.2 前缀规则

- `harness_*` 前缀 = harness 托管，可覆盖更新
- 无前缀 = 用户手写，harness **只读**（除非 contract `owned_paths` 显式声明）
- `archive/` 只存 superseded 或 >180 天未引用

### 3.3 HTML Marker 协议

`MEMORY.md` 和 `ERRORS.md` 是人类主笔 + harness 补充的**共享**文件。harness 只编辑自己的块：

```markdown
<!-- harness-memory:start id="project-stack" schema="1.0.0" -->
- [Project Stack](harness_project_stack.md) — Next.js 15 + TypeScript + pnpm
<!-- harness-memory:end id="project-stack" -->
```

**规则**：
- `id` 必填且在文件内唯一（支持同文件多块）
- 不嵌套
- 用户在块内编辑 → **保留编辑** + 记录到 `audits.conflicts`，等 `--maintain` 审核
- 同 ID 块重复 → 保留第一个 + 删除后续（前提：两块都能解析）
- ERRORS.md 用 `<!-- harness-errors:start id="..." -->` 区分

### 3.4 Error Case 文件格式

```markdown
---
id: safari-cookie-refresh-2026-04-15
date: 2026-04-15
module: auth/session
status: active                       # active | suspect | archived | superseded
applies_to:
  paths: ["src/auth/**", "middleware.ts"]
  symbols: ["refreshSession", "setSessionCookie"]
  deps: [{ name: "next-auth", range: ">=5" }]
criteria_met:                        # 至少 2 项（contract errors_collection.criteria）
  - platform_specific
  - user_visible
  - invalidated_assumption
freshness:
  state: active
  last_verified: 2026-04-22
  last_used: 2026-04-22               # 最近一次被 runtime query 匹配/注入的日期，archive 政策依据
  suspect_since: null
superseded_by: null                  # 若被取代：relative/path.md#case-id
next_time_signal:                    # 未来 runtime 查询的 grep 关键词
  - "Safari session drop"
  - "Chrome works but Safari logs out"
  - "SameSite cookie auth failure"
---

# Safari refresh cookie silently failed

[## Symptom]
...

[## Root Cause]
...

[## Fix]
...

[## Negative Patterns]
- Tried extending token TTL; hid symptom, did not fix refresh.
- Tried client-side retry; failed because cookie was never sent.

[## Future Check]
...
```

> 注：上方 `[## Heading]` 表示 body 中的实际 Markdown H2，用方括号仅为避免文档自身 heading 计数混淆。

**硬规则**：
- `superseded_by` 必须 `relative/path.md#id`，禁止自由文本
- body heading `## Negative Patterns` **必须存在**（内容可为"（无）"） — 这是案例库相对原则库的核心价值。不作为 frontmatter key，避免 schema 与 heading 二义
- `next_time_signal` 是 runtime 查询的匹配源
- `freshness.last_used` **仅对 harness-owned case（`harness_*` 前缀）自动刷新**。runtime 匹配到用户手写 case（无 `harness_` 前缀）时，使用事实记录到 `.harness-status.json.memoryCheck.userCaseHits` 内存里，**不回写到用户文件**（维持用户文件 read-only 契约）。归档政策只对 harness-owned case 生效 — 用户 case 的归档完全由用户自己决定

---

## 4. Runtime 协议

### 4.1 ERRORS.md 查询 (Stage 3 前置)

```
Stage 3 agent 修改任何文件前 MUST:

1. 读 docs/memory/ERRORS.md 索引
2. 按变更路径 token 查询 cases/:
     - 完整路径 (src/auth/session.ts)
     - 模块名 (auth, session)
     - basename (session.ts)
     - 已知导出符号
3. 加载 ≤ 5 个匹配 case 或 ≤ 3,000 tokens，先到先停
4. 相关性判定：
     - applies_to.paths glob 命中 → 强相关
     - 两个弱信号同时命中（symbol+keyword / keyword+dep / symptom+module） → 弱相关
5. Agent 输出（强制）:
     "Memory check: consulted ERRORS.md.
      Matched cases: <case-id> — <reason>.
      Action: <specific pre-coding check>."
     或 "Memory check: no relevant cases found."
```

**硬门**：没输出 "Memory check" 行的话，Stage 3 不能进入编码。

### 4.2 执法点

上面的"硬门"不能靠子 agent 自律。实际执法四步（含实施后漂移扫描）。

**前置状态（Stage 2 结束时捕获）**：Stage 2 产出 plan 后、Stage 3 开始前，coordinator **必须**把当前 git HEAD 写入 `.harness-status.json.baseSha`（`roundId` / `baseSha` / `baseCapturedAt` / `memoryCheck`）。字段缺失 → Stage 4 入口门 BLOCKED。一轮内 `baseSha` 只写一次，不随 Stage 3 中间 commit 刷新。

**1. Coordinator 预查**（harness 主 agent 在 dispatch Stage 3 subagent 前）

- 从 Stage 2 产出的 plan 解析**本轮变更文件清单**（plan 必须声明 `changed_files: [...]`）
- 对每个文件，按上面的查询规则扫 `docs/memory/ERRORS.md` + `cases/*.md`
- 把匹配结果结构化写入 `.harness-status.json.memoryCheck`：
  ```json
  {
    "queriedAt": "<ISO>",
    "queriedFiles": ["src/auth/session.ts", "middleware.ts"],
    "matches": [
      { "file": "src/auth/session.ts", "case_id": "...", "relevance": "strong",
        "action": "verify cookie SameSite before editing session refresh" }
    ]
  }
  ```
- 若无任何匹配，写 `{ "queriedFiles": [...], "matches": [] }`

**2. Task prompt 注入**（每个 Stage 3 subagent 的 task prompt 自动 prepend）

```
# Memory Context（由 coordinator 预查）
以下 ERRORS 案例与本 task 相关：
- <case-id> — <reason> / relevance=<strong|weak> → 编码前请 <action>

（或 "No relevant ERRORS cases found."）

你必须在输出中 echo 一行 "Memory check:" 块，证明你已消化上述上下文，
并对 strong relevance 的 action 给出实施证据（file:line 或 test:case）。
```

**3. Post-check（Stage 3 subagent 输出后，按 relevance 分级）**

- 缺失 "Memory check:" 行 → Stage 3 该 task 视为 BLOCKED，发回重做一次；二次缺失 → 升级给用户
- 有 "Memory check:" 行，但 **strong relevance 的 action 无实施证据**（grep 不到 file:line / test:case）
  → **BLOCKED**，发回重做一次；二次仍无证据 → 升级给用户
- 有 "Memory check:" 行，**weak relevance 的 action** 无实施证据 → 记入 knownIssues 不阻塞

**4. 实施后 diff 扫描**（Stage 3 全部 task 完成、Stage 4 开始前）

这一步防止 subagent 动了 plan 没预见到的文件（`changed_files` 漂移）：

- 拿实际 diff：`git diff --name-only <base-sha>..HEAD`
- 对比 `.harness-status.json.memoryCheck.queriedFiles`
- **新增的（实际改但未 precheck 查过的）文件** → 重跑 ERRORS query
  - 匹配到 **strong** → 生成 remediation task 回 Stage 3 处理；或请求用户决策是否继续
  - 匹配到 **weak** → 追加到 `.harness-status.json.memoryCheck.matches` + 记 knownIssues，Stage 4 可继续
  - 无匹配 → 无影响
- Stage 4 入口门：`.harness-status.json.memoryCheck.queriedFiles` 必须包含最终 diff 里所有改动的文件；否则 BLOCKED

### 4.3 Suspect Rule 文法

```yaml
applies_to:
  paths: ["glob/**"]                 # 文件 glob
  symbols: ["Name"]                  # textual 匹配，**不用 AST**
  deps: [{ name: "pkg", range: "semver-range" }]
  commit_keywords: ["word"]          # commit msg 或 round summary
match: "any" | "all"
```

**触发事件**：
- 本轮 diff 的变更文件命中 paths
- 变更 diff 文本含 symbols
- 依赖版本改动落入 range
- 本轮 commit message / round summary 含 keyword

`match: all` = 每个非空类别至少一命中。

### 4.4 归档 + last_used 更新规则

**last_used 更新**：
- `freshness.last_used` 仅对 `harness_*` 前缀的 case 自动刷新，在 runtime query 匹配并注入 task prompt 时更新为当日 ISO 日期。
- 用户手写 case（无 `harness_` 前缀）被匹配时，命中事实仅记入 `.harness-status.json.memoryCheck.userCaseHits`，原文件不回写（维持 read-only 契约）。

**归档触发**（`archive_policy` 字段驱动）：
- `archive_after_days_unused: 180` — harness-owned case 的 `freshness.last_used` 超过 180 天未刷新时，触发归档
- `archive_if_status: ["superseded", "archived"]` — case frontmatter `status` 变为 superseded 或 archived 时，立即移至 `cold_dir`
- `hot_index_max_lines: 200` — `ERRORS.md` 主索引超过 200 行时，最旧/最冷的条目随下次 `--maintain` 被移到 archive 子节
- 归档目标：`docs/memory/archive/harness_<date>_<slug>.md`；`ERRORS.md` 对应条目转为 archive 链接或删除

---

## 5. 生命周期三时机

### 5.1 --init / --adopt (scaffold)

**`--init`**（全新项目）：
1. 生成 `.harness-memory.yml`（从 template 实例化，`schema_version: "1.0.0"`，`forbidden_paths` 必填）
2. 创建 `MEMORY.md`、`ERRORS.md`（含空 harness marker 块）
3. 建 `cases/`、`decisions/`、`constraints/`、`archive/` 四个子目录及 README
4. 验证：contract 可被 YAML 解析，字段完整

**`--adopt`**（已有 `docs/memory/` 的项目）：
1. 读取现有 `MEMORY.md`，识别并保留所有无 `harness-memory:start` 标记的用户段落
2. 仅插入 harness marker 块，**不覆盖、不删除**用户内容
3. 若已存在 `<!-- harness-memory:start -->` 块，仅更新块内容，保留块外用户编辑
4. 生成/补全 `.harness-memory.yml`（现有文件若 schema_version 兼容则追加字段，不重建）

### 5.2 Stage 8 收尾刷新

Stage 8 是每轮的 memory 收尾时机，负责：

1. **Case 状态扫描**：对照本轮 `git diff --name-only <baseSha>..HEAD`，检查所有 suspect_rules 的 `applies_to` 是否命中变更文件；命中则将对应 case 的 `freshness.state` 改为 `suspect`，`suspect_since` 写当日日期
2. **ERRORS.md 索引刷新**：新增 case → 追加条目；已归档 case → 更新链接；超 `hot_index_max_lines` → 触发冷移
3. **archive_policy 执行**：检查 `freshness.last_used` 超期或 `status` 变更的 case，执行文件移动至 `cold_dir`
4. **MEMORY.md 刷新**：更新 harness marker 块内的项目栈快照和工作流摘要
5. **scorecard 追加**：若本轮有 strict-reviewer 调用，将 `scorecard_delta` append 到 `harness_reviewer_scorecard.yml`，同步更新 `totals`
6. **contract `audits` 更新**：写入 `last_full_audit` 时间戳；若 HTML marker 有冲突则记入 `audits.conflicts`

### 5.3 --maintain 漂移检查

`--maintain` 是周期性的健康审计，覆盖四个维度：

**Contract audit**：重新加载 `.harness-memory.yml`，验证 schema_version，运行 migration（如需）。检查 `owned_paths` 是否含 broad unscoped 模式（发现则 BLOCKED）；检查 `forbidden_paths` 非空（空则警告）。

**Memory drift audit**：扫描磁盘文件 vs contract `owned_paths`（harness 托管文件是否齐全）；扫描 `cases/` 所有 frontmatter，`freshness.last_used` 超 180 天的 harness case → 标记并询问是否归档；检查 `ERRORS.md` 行数，超 `hot_index_max_lines` 则触发冷移。

**Conflicts review**：读取 `audits.conflicts`，列出所有 HTML marker 块内的用户编辑冲突，提示用户决策（保留/覆盖/手动合并）。处理后清空 `conflicts` 列表，写入 `last_full_audit`。

**Suspect 检测**：对比 `suspect_rules` 与近期 git log（最近一轮 commit message + diff）。命中 suspect_rule 但 case `freshness.state` 仍为 `active` → 改为 `suspect`。`suspect_since` 超 30 天无人处理 → 提示用户审核或归档。

## 6. Red Flags — 不要存什么

### 日常 Drift 自检

| 想法 | 意味着你在 drift |
|------|----------------|
| "跳过 plan doc，就几个小任务" | plan doc 是未来会话的恢复依据 |
| "让测试当 reviewer" | codex 抓测试覆盖不到的盲区 |
| "STATE.json 等做完再更新" | context compress 后就忘了 |
| "CLAUDE.md 过时了回头补" | 过时的 CLAUDE.md 误导下一个会话 |
| "用户很忙，他就想要进度" | 进度 + 过程 = 可持续；进度 - 过程 = 债 |

### 不应写入 `docs/memory/` 的内容

以下内容**不适合**存入项目长期记忆（`docs/memory/`），应由其他机制处理：

| 类型 | 原因 | 正确去处 |
|------|------|---------|
| 代码模式 / 实现细节 | 代码即文档，memory 不是代码注释 | 代码注释 / ADR |
| git 历史摘要 | git log 本身就是历史 | `git log` 直接查 |
| 调试过程流水账 | 过程记录无结构，不可复用 | 提炼成 Error Case 格式存 `cases/` |
| CLAUDE.md 内容重复 | 二义性，维护成本翻倍 | 统一写 CLAUDE.md |
| 单轮临时任务状态 | 会话内短命，污染长期记忆 | `.harness-status.json` 或会话内存 |
| 用户账户偏好 | 随用户走，不随项目走 | Claude Code auto-memory |
| 每轮 observation 流水 | 按需语义搜索即可，不需持久化文件 | claude-mem plugin observation |
| 未满足 `min_criteria` 的 bug | 门槛存在就是为了防止 noise | 不记录；满足标准后再开 case |
