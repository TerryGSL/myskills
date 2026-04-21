# harness-workflow: 项目长期记忆 + 严格审稿机制升级

**日期**: 2026-04-22
**状态**: Design approved, ready for writing-plans
**决策者**: TerryGSL
**协作**: Claude (brainstorm orchestrator), Codex (adversarial reviewer, 3 rounds)

---

## Context

### 问题

harness-workflow 当前存在三处结构性缺陷：

1. **Auto Memory 和项目长期记忆被混为一谈**。Claude Code 内置的 auto memory（`~/.claude/projects/{hash}/memory/`）跟着用户账户走，换设备 / 换用户 / 多人协作全丢。这不是项目记忆。真正的项目记忆需要**跟着 repo 走**：git 追踪、团队共享、跨设备、3 个月/1 年后新人打开仓库也能读懂。

2. **Reviewer prompts 太温和，没有反谄媚纪律**。`qa-prompt.md` / `security-prompt.md` 等都是"任务清单 + 输出格式"，没有：
   - 默认 FAIL 立场（Claude 默认会把严重逻辑问题包成"几点小建议"）
   - 客观度量兜底（审稿疲劳会让第三轮变成"没看出大问题"）
   - 证据链硬门（grounding / reproduction / coverage）
   - Minimum adversarial search（PASS 前必须先列假设失败模式）

3. **项目知识写的是原则，不是案例**。"不要 hardcode" / "接口要 POST+JSON" 这种原则 AI 机械应用 — 该管的管，不该管的也管。一条带日期 / 现场 / 症状 / 根因 / 修复的**真实案例**比十条原则更能让 AI 在相似情境下对上号。

### 目标

升级 harness-workflow skill 自身，让它应用到目标项目时能：
- 在项目内**自动生成并维护** `docs/memory/` 层级，作为跟随 repo 的长期记忆
- **AI 主写 + 用户低介入审核**的闭环流程
- 提供**严格审稿纪律**给所有审稿 Stage（Stage 4/5/6/7），同时这套纪律作为独立 skill 可被任何项目直接用
- **3 个月/1 年后仍可用**：event-driven suspect 检测 + 状态机 superseded / archived + 机器可读 contract

### Non-goals

- 不改 `team-init` / `team-pd` / `team-architect` / `team-senior-dev` / `team-junior-dev` 等非审稿 skill（保持独立可用）
- 不替代 `claude-mem` 插件（它负责每轮 observation 的语义搜索，互补）
- 不触碰 Claude Code 内置 auto memory（那是用户账户级，不在本 spec 范围）
- 不在 myskills 仓库本地搭建 `docs/memory/` 脚手架（myskills 是 skill 分发仓库，不是 harness 消费者）

---

## 架构

### 两个产物

**产物 1：`strict-reviewer` skill（新建，独立 skill）**

- 路径：`/Users/twelve/Music/myskills/strict-reviewer/SKILL.md`
- 性质：**薄 wrapper** — schema-driven，不是 persona-driven。不是"表演 brutal honest"，是强制证据链。
- 消费者：harness-workflow Stage 4/5/6/7；任何需要严格审稿的独立场景
- 可复用：独立于 harness，可被其他项目直接 `/strict-reviewer` 调用

**产物 2：`harness-workflow` skill 升级**

文件级改动：

```
harness-workflow/
├── skill.md                                  ← 改：集成 memory + reviewer 调用
├── references/
│   ├── memory.md                             ← 大改：变为 contract + runtime 规范
│   ├── memory-migrations.md                  ← 新：schema 版本迁移声明
│   ├── workflow.md                           ← 改：Stage 2/3/6/7/8 加 memory 钩子
│   ├── maintenance.md                        ← 改：--maintain 覆盖 audit
│   └── reviewer-integration.md               ← 新：如何调 strict-reviewer
├── prompts/
│   ├── qa-prompt.md                          ← 改：调用 strict-reviewer
│   └── security-prompt.md                    ← 改：调用 strict-reviewer
├── templates/
│   └── project-memory/                       ← 新：目标项目脚手架
│       ├── .harness-memory.yml.template
│       ├── MEMORY.md.template
│       ├── ERRORS.md.template
│       ├── cases/README.md
│       ├── decisions/README.md
│       ├── constraints/README.md
│       └── archive/README.md
└── specs/                                    ← 新：本 spec + 未来设计文档
    └── 2026-04-22-memory-reviewer-upgrade.md
```

### 职责边界（明确）

| 产物 | 唯一负责 |
|------|---------|
| `strict-reviewer` skill | 审稿行为规范（三硬门 + adversarial search + scorecard） |
| `harness-workflow` skill | 触发时机（Stage 钩子）、目标项目脚手架、memory 生命周期、`.harness-memory.yml` 读写 |
| `docs/memory/` 在目标项目 | 项目长期记忆的物理存储 |
| `.harness-memory.yml` | 机器可读 contract，是两者唯一真实来源 |

### 保持不变

- `team-qa` / `team-security` 独立 skill 形态不变。harness 内被调用时经 strict-reviewer 执行纪律；独立调用时保持原语气。
- `team-init` 不负责 memory 初始化（Round 2 裁决）
- `claude-mem` 分工：每轮 observation 归它；项目长期记忆归 `docs/memory/`

---

## `.harness-memory.yml` Contract

### Schema（v1.0.0）

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

### 版本演化

| 级别 | 含义 |
|------|------|
| Patch (1.0.0 → 1.0.1) | 字段描述修正 / typo / 非语义变化 |
| Minor (1.0.0 → 1.1.0) | 向后兼容新增字段 |
| Major (1.x → 2.0.0) | 行为变化 / 所有权变化 / 字段改名 |

Migration steps 声明式写在 `references/memory-migrations.md`。每次 major bump 补一节。

### 失败处理（严格，不自动修复）

| 场景 | 动作 |
|------|------|
| Contract 缺失 | `--init/--adopt` 时创建；autonomous mode 只创建最小 harness 集合 |
| Schema 过老（major 低） | 运行 migration；否则 BLOCKED |
| Schema 过新（major 高） | **只读模式**，harness 不写任何 memory |
| YAML malformed | BLOCKED。**拒绝 auto-fix**（数据丢失陷阱） |
| Contract 与磁盘矛盾 | 只补齐 harness 托管的缺失文件；**绝不删除未知文件** |

### 硬约束

- `forbidden_paths` 必填，不能为空 — 防止 `owned_paths: ["docs/memory/**"]` 误伤用户手写 memory
- Contract load 时若 `forbidden_paths` 为空且 `owned_paths` 含通配符 → 报错拒绝加载

---

## `docs/memory/` 物理形态

### 目录布局

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

**前缀规则**：
- `harness_*` 前缀 = harness 托管，可覆盖更新
- 无前缀 = 用户手写，harness **只读**（除非 contract `owned_paths` 显式声明）
- `archive/` 只存 superseded 或 >180 天未引用

### HTML Marker 协议（共享文件）

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

### Error Case 文件格式

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

## Symptom
...

## Root Cause
...

## Fix
...

## Negative Patterns
- Tried extending token TTL; hid symptom, did not fix refresh.
- Tried client-side retry; failed because cookie was never sent.

## Future Check
...
```

**硬规则**：
- `superseded_by` 必须 `relative/path.md#id`，禁止自由文本
- body heading `## Negative Patterns` **必须存在**（内容可为"（无）"） — 这是案例库相对原则库的核心价值。不作为 frontmatter key，避免 schema 与 heading 二义
- `next_time_signal` 是 runtime 查询的匹配源
- `freshness.last_used` 在**每次 case 被 Stage 3 precheck 匹配或 post-diff 扫描命中时**自动刷新为 `date` (UTC)。归档政策（`archive_policy.archive_after_days_unused`）以此字段为依据 — 从来没被用过的 case 才会在 180 天后进 archive，用过的不会被误归档

---

## Runtime 协议

### ERRORS.md 查询（Stage 3 触碰代码前必做）

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

### 执法点（Stage 3 "Memory check" 怎么真正落地）

上面的"硬门"不能靠子 agent 自律。实际执法四步（含实施后漂移扫描）。

**前置状态（Stage 2 结束时捕获）**：

Stage 2（规划）产出 plan 后、Stage 3 开始前，coordinator **必须**把当前 git HEAD 写入 `.harness-status.json.baseSha`：

```json
{
  "roundId": N,
  "baseSha": "<git rev-parse HEAD 的输出>",
  "baseCapturedAt": "<ISO>",
  "memoryCheck": { ... }
}
```

- `baseSha` 用于第 4 步的 `git diff --name-only <base-sha>..HEAD` 确定"本轮实际改动"
- 字段缺失 → Stage 4 入口门 BLOCKED（不能盲跑 diff 扫描）
- 一轮内 `baseSha` 只写一次，不随 Stage 3 的中间 commit 刷新

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

**为什么这四步必要**：
- 第 1 步 `.harness-status.json.memoryCheck` 是**机器可验证的 sentinel**，不是靠 agent 嘴上说
- 第 2 步 task prompt 注入保证 agent 能看见上下文（而不是需要它主动查）
- 第 3 步 Post-check 按 relevance 分级 — strong 必做、weak 可记 — 防止硬阻塞误伤与无声忽略两种极端
- 第 4 步实施后扫描补上"plan 预见不到的实际改动"这个黑洞，闭环覆盖

### Suspect Rule 文法

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

---

## `strict-reviewer` Skill — IO Contract

### Input

```yaml
review_target:
  changed_files: ["src/auth/session.ts", ...]
  diff_summary: "..."
  stage: "qa" | "security" | "spec" | "quality"
  claims_to_verify: ["code handles expired refresh cookie", ...]
  memory_cases: [...]                # Stage 3 Memory check 结果
  prior_verdict: null | {...}
```

### Required Steps

1. **Read every changed file** 或显式列出跳过项（含原因）
2. **Verify every claim** 对着 file:line / 命令输出 / repro 步骤
3. **Minimum adversarial search** — 列 3 个可能失败模式，逐条判定
4. **Apply three gates**:
   - **Grounding gate**: 每个 finding 必须带 file:line / 符号 / 命令输出 / repro
   - **Reproduction gate**: 任何声称的 bug 必须有 repro steps / failing test / trace，或明说"无法复现的理由"
   - **Coverage gate**: 声明已检查 / 未检查表面；**未读关键变更文件 → 不能 PASS**

### Output

```yaml
verdict: "PASS" | "FAIL" | "BLOCKED"
reasons: []
coverage:
  inspected_files: [...]
  skipped_files: [{path: "", reason: ""}]
adversarial_search:
  failure_modes_checked: ["concurrent refresh race", ...]
  hits: ["#2 — expired token replay missing nonce check"]
findings:
  - severity: critical | high | medium | low
    file: src/auth/session.ts
    line: 47
    grounded_by: "read:file"         # read:file | exec:command | test:repro
    reproduction: "test/auth/session.spec.ts:expired-refresh-case"
scorecard_delta:
  total_reviews: 1
  pass_count: 0
  fail_count: 1
  blocked_count: 0
```

### 默认立场（prompt 前置）

```
DEFAULT = FAIL. Hesitation counts as FAIL.
You are not here to be kind. You are here to find what will break.
PASS is a privilege that requires all three gates + three adversarial mode
analyses to pass cleanly.
If coverage is incomplete, verdict is BLOCKED — not PASS.
```

### Invocation Protocol（调用方必读）

`strict-reviewer` 是**独立 skill**，不是 prompt include 或 inline role。调用者（Stage 4/5/6/7 的 coordinator，或手动用户）按如下协议：

**步骤**：

1. **构造 review_target**（上面 Input 段的 YAML schema），写入会话上下文中 AI 可见的文本块
2. **调用方式**：AI 用 Skill tool 调用 `strict-reviewer`，参数是步骤 1 的 YAML 字符串（作为 `args` 传入）
3. **期待返回**：YAML-shaped output（上面 Output 段的 schema）。必须在 AI 文本回复中可解析
4. **Caller 解析 verdict**：
   - `PASS` → 继续下一 Stage
   - `FAIL` → 触发该 Stage 的自动修复循环（Stage 4 最多 3 轮 / Stage 5 最多 3 轮 / Stage 6/7 按 P0 bug 规则）
   - `BLOCKED` → **必须上报用户**（表示 coverage 不足或 input 不完整，不是 review 本身的"fail"，是系统错误）
5. **Scorecard 持久化**：`strict-reviewer` 本身 stateless — 它只返回 `scorecard_delta`。**Caller 负责把 delta append 到 `docs/memory/harness_reviewer_scorecard.yml`**

**异常处理**：
- 非 YAML / schema 不合法的输出 → caller 重试 1 次（同一个 review_target）
- 二次失败 → `verdict: BLOCKED`，上报用户

**strict-reviewer 不可用的处理（关键 — 不得绕过硬门）**：

| 场景 | 动作 |
|------|------|
| **harness 模式**（docs/STATE.json 存在）| `verdict: BLOCKED`，停止 Stage 并上报用户。**禁止自动降级到传统 prompt** — 否则硬门形同虚设 |
| 用户明确一次性同意降级 | 仅当次 Stage 使用传统 prompt + knownIssues 记 "degraded review: strict-reviewer unavailable" |
| `autonomous_mode`（用户预设无人值守） | 仍然 `BLOCKED`，等待用户回来。autonomous 不等于绕过安全网 |
| **独立调用**（非 harness，用户手动 `/qa`) | 可降级到传统 prompt，knownIssues 仅作提示 |

设计理由：strict-reviewer 在的时候审得严，strict-reviewer 没了就变温柔——这是系统最脆弱的时候还把防线撤了，违反 default-FAIL 根本原则。harness 模式下**硬阻塞**比"继续凑合"安全得多。

**调用示例**（Stage 6 QA coordinator 伪代码）：

```
review_target:
  changed_files: [...from git diff]
  diff_summary: "...from git log"
  stage: "qa"
  claims_to_verify: [...from plan test checklist]
  memory_cases: [...from .harness-status.json.memoryCheck]
  prior_verdict: null

→ Skill(skill="strict-reviewer", args=<serialized review_target>)
← "verdict: FAIL\nreasons: [...]\nfindings: [...]\nscorecard_delta: {...}"

→ Coordinator:
   1. parse verdict
   2. if FAIL: apply findings.reproduction as failing tests, patch code, re-invoke
   3. if PASS: append scorecard_delta to harness_reviewer_scorecard.yml
   4. if BLOCKED: escalate
```

### `harness_reviewer_scorecard.yml` Schema

Scorecard 是一个独立 YAML 文件，不是 log。固定 schema：

```yaml
schema_version: "1.0.0"

totals:
  total_reviews: 0
  pass_count: 0
  fail_count: 0
  blocked_count: 0

reviews:                              # append-only，每次调 strict-reviewer 追加一条
  - review_id: "r-2026-04-22-001"     # 单调递增 or UUID
    stage: "qa"                       # qa | security | spec | quality
    timestamp: "2026-04-22T10:30:00+08:00"
    changed_files: ["src/auth/session.ts", ...]
    verdict: "PASS"                   # PASS | FAIL | BLOCKED
    findings_count: 0
    linked_error_case: null           # "cases/harness_xxxx.md#id" | null

false_pass_incidents:                 # 反向修正事件
  - incident_id: "fpi-2026-05-01-001"
    original_review_id: "r-2026-04-22-001"      # 被推翻的 PASS
    bug_case: "cases/harness_2026-05-01_refresh_race.md#race-session-2026-05-01"
    detected_at: "2026-05-01T14:00:00+08:00"
    action_taken: "opened case + scorecard delta + retrained reviewer prompt example"
```

**追加规则**：
- `reviews` 严格 append-only，不改老条目（包括 verdict 纠错也只加 `false_pass_incidents`，不改原 review）
- `totals` 每次 append 同步更新
- 文件超过 500 条 reviews → 归档到 `docs/memory/archive/harness_reviewer_scorecard_<year>.yml` + 本文件保留最新 100 条

### False-Pass Correction 闭环

- Caller（Stage 6/7 coordinator）每次 review 追加一条到 `reviews[]`，同步更新 `totals`
- 后续某 bug 推翻前 PASS 审稿：
  1. 在 `cases/` 新开 error case（满足 `errors_collection.min_criteria` 时）
  2. 在 scorecard 追加一条 `false_pass_incidents` 指向原 review + 新 case
  3. `--maintain` 会定期扫 `false_pass_incidents`，把高频 false-pass 模式作为 reviewer prompt 的反向训练例子

---

## 实施范围

### 新建文件

| 路径 | 用途 |
|------|------|
| `strict-reviewer/SKILL.md` | 新 skill 主文件 |
| `harness-workflow/references/memory-migrations.md` | schema 迁移声明 |
| `harness-workflow/references/reviewer-integration.md` | harness 如何调 strict-reviewer |
| `harness-workflow/templates/project-memory/.harness-memory.yml.template` | contract 模板 |
| `harness-workflow/templates/project-memory/MEMORY.md.template` | 人类索引模板 |
| `harness-workflow/templates/project-memory/ERRORS.md.template` | 错误索引模板 |
| `harness-workflow/templates/project-memory/cases/README.md` | 子目录说明 |
| `harness-workflow/templates/project-memory/decisions/README.md` | 子目录说明 |
| `harness-workflow/templates/project-memory/constraints/README.md` | 子目录说明 |
| `harness-workflow/templates/project-memory/archive/README.md` | 子目录说明 |

### 修改文件

| 路径 | 改动 |
|------|------|
| `harness-workflow/skill.md` | Phase 3 重写为 contract init；Stage 8 自检清单；集成 strict-reviewer 调用 |
| `harness-workflow/references/memory.md` | 大改：变为 contract runtime 规范（生命周期 / ERRORS 查询 / suspect 文法 / 归档） |
| `harness-workflow/references/workflow.md` | Stage 2 决策记忆、Stage 3 ERRORS 查询强制、Stage 6/7 调 strict-reviewer、Stage 8 全流程 memory 刷新 |
| `harness-workflow/references/maintenance.md` | `--maintain` 增加 contract audit / conflicts review / suspect 检测 |
| `harness-workflow/prompts/qa-prompt.md` | 替换为 strict-reviewer 调用 + QA 域上下文 |
| `harness-workflow/prompts/security-prompt.md` | 替换为 strict-reviewer 调用 + Security 域上下文 |
| `team-commander/SKILL.md` | Step 6 重命名为 "Session Health Check"：6.1 context pressure（保留）+ 6.2 persistent memory drift（新增：检查 `.harness-memory.yml` contract suspect 状态 + audits 漂移）|

### 不动

- `team-init/SKILL.md`
- `team-pd/SKILL.md`
- `team-architect/SKILL.md`
- `team-senior-dev/SKILL.md`
- `team-junior-dev/SKILL.md`
- `team-qa/SKILL.md` / `team-security/SKILL.md` 独立可用部分不动；只在 harness 调用时通过新 prompt 调 strict-reviewer

---

## 验证方式

### 端到端场景（手跑验证）

1. **新建项目 `--init`**：
   - 新 Next.js 项目跑 `/harness-workflow --init`
   - 验证：生成 `.harness-memory.yml` + `MEMORY.md` + `ERRORS.md` + 4 个子目录
   - 验证：contract 可被 YAML 解析，字段完整

2. **`--adopt` 保护用户文件**：
   - 目标项目已有 `docs/memory/MEMORY.md`（含用户手写 2 条）
   - 跑 `/harness-workflow --adopt`
   - 验证：用户 2 条原样保留；新增 `<!-- harness-memory:start -->` 块只插 harness 条目

3. **Stage 3 触发 ERRORS 查询**：
   - 在有 2 条 cases 的项目改 `src/auth/session.ts`
   - 验证：Stage 3 输出 `Memory check:` 行，列出匹配 case 及 action
   - 验证：不输出该行时 Stage 3 被阻塞

4. **三硬门阻塞 PASS**：
   - 故意给 strict-reviewer 传 diff 但不让它读文件
   - 验证：coverage gate 触发 BLOCKED

5. **False-pass correction**：
   - mock 一次 PASS → 次轮发现推翻性 bug
   - 验证：scorecard 追加事件 + 若满足门槛则 `cases/` 开新 case

6. **Suspect 检测**：
   - 已有 case.applies_to.paths = `src/auth/**`
   - 修改 `src/auth/session.ts`
   - 验证：Stage 8 把 case.freshness.state 改为 `suspect`

### 回归检查

```bash
# 内部引用完整性
cd /Users/twelve/Music/myskills/harness-workflow
grep -rn "references/memory.md" .           # 所有引用指向实存文件
grep -rn "strict-reviewer" .                # 调用点齐全

# 模板可渲染
cat templates/project-memory/.harness-memory.yml.template | \
  sed 's/{{project_name}}/test/' | \
  python3 -c "import sys, yaml; yaml.safe_load(sys.stdin)"  # 不抛异常
```

---

## Resolved Decisions

1. **`.harness-memory.yml` 版本检查时机 — 两阶段**

   - **活跃时（每次 harness-workflow skill 被调用）**：只读检查 schema_version
     - 过老 / 过新 / malformed → **只读模式**，不拒绝 skill 运行，但禁止 memory 写操作
     - 目的：不挡路，但防止盲写
   - **写操作前（`--init` / `--adopt` / `--maintain` / Stage 8 memory 刷新）**：严格检查
     - malformed → BLOCKED，不写任何 memory
     - major 不匹配 → 先运行 migration（如有），否则 BLOCKED

2. **strict-reviewer 完全 stateless**

   - 只读 input（review_target），返回 output（含 scorecard_delta）
   - **不**持有任何跨调用状态
   - **不**读写磁盘
   - Scorecard 由 caller（Stage 6/7 coordinator）负责 append 到 `docs/memory/harness_reviewer_scorecard.yml`
   - 理由：stateless 让 strict-reviewer 可被任何上下文复用（harness 外也能用），且易测试

3. **`docs/memory/cases/` 文件命名**

   - **harness 自动生成的 case**：必须 `harness_YYYY-MM-DD_<slug>.md` 前缀
   - **用户手写 case**：允许无 `harness_` 前缀放在 `cases/`，但 harness 视为 **read-only**（不更新其 freshness、不归档、不覆盖）
   - 用户手写的长期知识（非 bug case 型）更适合放 `decisions/` 或 `constraints/`（无 `harness_` 前缀的用户文件 harness 只读）
   - 同目录并存不冲突，命名空间分开

---

## 附：本次设计的 codex 参与度

| 轮次 | 主题 | 成果 |
|------|------|------|
| Round 1 | 审核 V1 plan | 7 条 HOLD issues，否决 `team-init` 扩散 |
| Round 2 | 4 条主线脑暴 + 3 个骨架选择 | 提出 Option D (C + contract file) |
| Round 3 | 7 个具体 spec 细节 | 完整 schema + HTML markers + ERRORS 运行时 + strict-reviewer IO |

Codex session ID: `.context/codex-session-id`（可 `/codex` 继续追问）
