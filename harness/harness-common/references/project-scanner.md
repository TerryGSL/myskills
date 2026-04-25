# Project Scanner — `--scan-project` / `--rescan` / `--partial-rescan` / `--apply-knowledge-answers` 规范

> 本文档规范 harness-workflow 的项目级 knowledge 扫描 pipeline。
> 完整设计推导见 `harness-workflow/specs/2026-04-23-project-knowledge-scanner-design.md`。
> runtime 检索与注入见 [`knowledge-retrieval.md`](knowledge-retrieval.md)（本规范的运行时伴侣）。

---

## 1. 触发方式

### 四个命令

| 命令 | 说明 |
|------|------|
| `/harness-workflow --scan-project` | **首次全量扫描**。从零开始，执行完整 5-Phase Pipeline，产出 `docs/harness/knowledge/` 所有产物（INDEX / manifest / evidence / gaps / TODO），并在 CLAUDE.md 追加触发契约块。 |
| `/harness-workflow --rescan` | **重新全量扫描**。与 `--scan-project` 等价，适用于主动刷新知识库（如大规模重构后）。覆盖已有产物，保留 user-override 中有显式 ID 关联的条目（精确匹配，不 fuzzy 删除）。 |
| `/harness-workflow --partial-rescan <domain>` | **局部重扫单个 domain**。只激活指定 domain 的 scanner，Scout 必须局部重跑 boundary 探测（不复用上次 scout），Codex Contradiction Pass 仍跑。时间上限 10 min，TODO 聚合上限 3 条。 |
| `/harness-workflow --apply-knowledge-answers` | **处理用户对 TODO.md 的批量回答**。读 TODO.md 中用户填写的 `Your answer:` 内容，对每条答案跑 micro-rescan 查证据，有 ≥ 2 正例则升级进 manifest，否则写入 gaps.md 作 user override。 |

### 前置条件

- `team-init` 已执行（`.harness-context.json` 存在，技术栈已探测）
- `--scan-project` / `--rescan`：目标项目根目录可访问
- `--partial-rescan <domain>`：`docs/harness/knowledge/INDEX.md` 存在且 `<domain>` 在 `active_domains` 内
- `--apply-knowledge-answers`：`docs/harness/knowledge/TODO.md` 存在且有用户已填写的答案

---

## 2. Scan Budget 硬上限

所有预算约束在 pipeline 执行期间强制遵守，任何 phase 不得突破：

| 约束项 | 上限 | 依据 |
|--------|------|------|
| 总 wall-clock（`--scan-project` / `--rescan`） | 28 min | 平衡完整性与响应性 |
| 每 domain scanner full file read | 24 个文件 | 足够采样，不溺水 |
| 呈现给用户的 TODO 总数 | 8 条 | 用户明示"尽量少" |
| 单 manifest.md 大小 | 140 行 | 超出后 retrieval 质量崩（Stage -0.5 加载成本过高） |
| 单 evidence.md 大小 | 220 行 | evidence 是 audit 工具，不是主检索 corpus |
| 最大激活 domain 数 | 5 个 | 超出说明 domain 分类有问题；scout 应合并 |
| `--partial-rescan` 总时间 | 10 min | — |
| `--partial-rescan` TODO 聚合上限 | 3 条 | — |

**manifest 超 140 行的处理**：scanner 在写入前检查行数，若超限，按以下优先级挤掉规则：

1. low-confidence rule（应在 Phase 2 就丢，此处兜底检查）
2. 影响范围窄（`applies_to` 路径命中文件数少）的 rule
3. 优先保留 `violation_test` 为结构化类型（非 `free_form_review`）的 rule

---

## 3. 5-Phase Pipeline 详解

### 概览

```
Phase 1  Scout              8 min   主 coordinator 自跑，不派 subagent
Phase 2  Parallel Domain    12 min  N subagent 并行，max 5
Phase 3  Codex Pass         5 min   跨模型矛盾审查
Phase 4  TODO Aggregation   3 min   去重聚合，硬上限 8 条
Phase 5  User Batch Answer  用户异步  用户填 TODO.md → --apply-knowledge-answers
─────────────────────────────────────────────────────
Total                       ≤ 28 min（不含 Phase 5 用户填写时间）
```

---

### Phase 1：Scout（8 min，主 coordinator 自跑）

**执行者**：主 coordinator。不派 subagent，因为 scout 的职责是轻量全局探测，分派会引入协调开销。

**步骤**：

```bash
# 快速遍历：ls + rg，不做全文 AST 分析
ls -R <target-repo>/src
rg --files <target-repo>/src | head -500
```

1. **识别技术栈**：复用 `.harness-context.json`（`team-init` 已产出），不重新探测。
2. **识别模块边界**：top-level package 树 + 主要目录。
3. **探测 domain 激活信号**：

| 激活信号 | 激活 domain |
|---------|------------|
| resource bundles / `messages_*.properties` / i18n helper class / `MessageSource` | `i18n-and-text-boundaries` |
| SDK client / adapter package / HTTP client wrapper / Feign client | `integrations-and-sdk-usage` |
| 其他：按发现程度决定是否激活 | 视情况 |

4. **固定激活**：`style-and-structure` + `internal-components` **总是激活**，不经过 signal 探测。
5. **输出**：写入 `.harness-status.json.scoutReport`（临时字段，Phase 2 读取后在 Phase 5 清理）：

```json
{
  "scoutReport": {
    "activeDomains": ["style-and-structure", "internal-components", "integrations-and-sdk-usage"],
    "domainBoundaries": {
      "style-and-structure": {
        "applies_to": ["src/main/java/**"],
        "sample_dirs": ["src/main/java/com/acme/core/service", "src/main/java/com/acme/web"]
      },
      "integrations-and-sdk-usage": {
        "applies_to": ["src/main/java/com/acme/integration/**"],
        "sample_dirs": ["src/main/java/com/acme/integration"]
      }
    },
    "totalFilesFound": 312,
    "scoutDurationSec": 45
  }
}
```

**Phase 1 限制**：scout 期间不读取文件全文，不做 symbol 分析，不生成任何 convention 结论。结论留给 Phase 2 subagent。

---

### Phase 2：Parallel Domain Scan（12 min，N subagent 并行，max 5）

**执行者**：主 coordinator 按激活 domain 数派出 N 个 subagent（N ≤ 5）并行运行。

每个 subagent 的执行流程：

```
Step 1: 读 scoutReport 里对应 domain 的 boundary（applies_to glob + sample_dirs）

Step 2: 用 rg + symbol index 无限制搜索该 domain 边界内的文件
  - 不扫 domain 边界外文件（硬门）

Step 3: 从搜索结果中选 ≤ 24 个 representative 文件做 full read
  representative 文件选取优先级：
  1. 核心模块（import count 高，被多个模块引用）
  2. 最近改动（git log --name-only 最新）
  3. 边界模块（连接两个子模块的桥接类）

Step 4: 提取 convention
  high confidence（进 manifest）：
    - ≥ 2 个正例（file:line） 或
    - 1 个正例（核心模块）+ 1 个反例（边界/废弃模式）
  medium confidence（进 TODO buffer，高影响才留）：
    - 1 个强正例在核心模块，但无法找第二个支撑点
  low confidence（直接丢弃）：
    - 弱信号，单个证据，或边缘文件

Step 5: 产出 manifest-draft.md + evidence-draft.md 到对应 domain 目录
```

**subagent 硬门**（见 `prompts/scanner-prompts.md`）：

- 不扫 domain 边界外文件
- 不编造 convention（没有 file:line 证据的 convention 一律丢弃）
- 不照搬 legacy 坏风格（识别 deprecated pattern 放入反例，不写成正规则）
- 每条 high-confidence rule 必须有 `file:line + interpretation`，禁止纯 path glob

**evidence 硬格式要求**（每个 anchor）：

```markdown
## <anchor-matching-manifest-rule>

Supporting "<rule title>":

### Example 1 (positive, central)
- **File**: `<path>:<line>`
- **Interpretation**: <一句话解读>

### Example 2 (positive, central)
- **File**: `<path>:<line>`
- **Interpretation**: <一句话解读>

### Counterexample (optional, boundary / deprecated)
- **File**: `<path>:<line>`
- **Interpretation**: <一句话解读>
```

---

### Phase 3：Codex Contradiction Pass（5 min）

**执行者**：Codex CLI（`/codex`），以只读模式跨模型审查。

**职责**：

1. **域间矛盾检测**：两个 manifest 是否存在相互冲突的 rule（例如：`style-and-structure` 要求所有异常捕获在 service 层，`exception-and-error-contracts` 要求所有异常透传到 controller）。
2. **遗漏检测**：scout 激活的 domain 是否漏写关键 convention（例如：`integrations-and-sdk-usage` 有 SDK client，但 manifest 没有 timeout 约定）。
3. **编造检测**：manifest rule 能否在对应 evidence 里对上号（rule 描述与 evidence 文件路径/行号不一致）。

**产出**：`codex-contradictions.md`（临时文件，Phase 4 读取，Phase 5 清理）：

```markdown
# Codex Contradiction Pass — Results

## Cross-domain Conflicts
- [CONFLICT] style-and-structure/rule-3 vs exception-and-error-contracts/rule-1: ...

## Missing Conventions
- [MISSING] integrations-and-sdk-usage: HTTP timeout 约定未见于 manifest，evidence 里有 RestTemplate 配置

## Fabrication Suspicions
- [FABRICATED] internal-components/rule-4: manifest 描述与 evidence anchor 不匹配，rule 声称"必须使用 BeanFactory"但 evidence 文件找不到对应 file:line
```

**Codex 不可用时**：跳过 Phase 3，INDEX metadata 标注 `cross_model_pass: skipped`（见失败降级一节）。

---

### Phase 4：TODO Aggregation（3 min）

**执行者**：主 coordinator。

**来源合并**：

1. Phase 2 各 domain scanner 产出的 medium-confidence TODO buffer（高影响才保留）
2. Phase 3 codex 发现的不确定项（MISSING / CONFLICT / FABRICATED）

**去重规则**：相同 domain + 相同 convention 问题去重，保留描述最清晰的一条。

**优先级排序**：

```
核心模块相关 > 边界模块相关
CONFLICT > MISSING > FABRICATED
```

**硬上限 8 条**：超出则按优先级从后往前丢 low-impact 条目。

**产出**：`docs/harness/knowledge/TODO.md`：

```markdown
# Batch Q&A — Project Knowledge Gaps

Scanner found <N> gaps it couldn't resolve from code alone.
Answer inline; run `/harness-workflow --apply-knowledge-answers` when done.

## TODO-1: Service 层应使用哪种异常包装机制？

**Context**: 发现两种用法：
  - `src/main/java/com/acme/core/service/UserService.java:45` — 返回 `Result<T>`
  - `src/main/java/com/acme/core/service/OrderService.java:67` — 抛 `BusinessException`
**Question**: 新 service 应统一使用哪种方式？
**Your answer**: _____

---

## TODO-2: ...
```

---

### Phase 5：User Batch Answer → Evidence-Backed Finalize

#### Step 1：HALT，等待用户

scanner 完成 Phase 4 后**暂停**，提示用户：

```
扫描完成。发现 <N> 个需要您确认的约定问题，已写入：
  docs/harness/knowledge/TODO.md

请在每条 "Your answer:" 后填写答案，完成后运行：
  /harness-workflow --apply-knowledge-answers
```

#### Step 2：用户填写

用户在 `TODO.md` 的每条 `Your answer:` 后填写答案。用户可以不回答某条，系统会保留该 gap。

#### Step 3：`--apply-knowledge-answers` 处理

coordinator 读 TODO.md，对每条有答案的 TODO 执行以下分支逻辑（evidence-first 契约不可破）：

**Step 3a：写入 gaps.md resolved_by_user 块**

```markdown
## gap-<N> — resolved_by_user

**用户答案**（原话保留）: <用户填写的内容>
**处理时间**: <ISO timestamp>
**状态**: pending_verification
```

**Step 3b：跑 micro-rescan（查代码证据）**

按用户答案指引的 convention，用 `rg` / symbol index 在 domain boundary 内搜索支持该 convention 的 file:line 示例（目标：≥ 2 个正例，或 1 正 + 1 反）。

**Step 3c：分支处理**

**情况 A：找到 ≥ 2 正例（或 1 正 + 1 反）→ 升级进 manifest**

```
1. 将规则写入 <domain>/manifest.md，rule block 内必须声明：
   **Supersedes Gap ID**: <此次用户答案的 gap_id>

2. 在 evidence.md 补充对应 anchor + file:line examples

3. 精确清理旧的 user override（按 ID 精确匹配，禁止 fuzzy text similarity）：
   a. 把 <domain>/gaps.md 里 gap_id 精确匹配的 resolved_by_user 块
      标记为 superseded_by_rule: <new_rule_id>（保留历史，标注已被取代）
   b. 从 INDEX.md ## User Overrides 表按 gap_id 精确移除对应行

4. 在 INDEX.md ## User Overrides 不保留此条目（已升级为正式 rule）
```

**情况 B：找不到足够 evidence → 保留在 gaps.md 作 user override**

```
1. 更新 gaps.md 中该 gap 块状态为 resolved_by_user（explicit override，无 evidence）

2. 在 INDEX.md ## User Overrides 表追加一行：
   | <domain>/gap-<N> | <domain> | <用户答案一句话总结> | <domain>/gaps.md#gap-<N> |

3. 不进 manifest（evidence-first 契约：manifest 每条 rule 必须有 file:line 支撑）
   Stage -0.5 注入时标注"用户声明约定（未核实）"并作为 Advisory Context（非 FAIL 依据）
```

**为什么不直接把用户答案升成 high confidence**：evidence-first 契约要求 manifest 每条 rule 有 file:line 支撑。用户答案不等于代码证据。若代码里不存在符合答案的实例，说明约定只存在于用户脑中——写入 manifest 会让 reviewer 错误 FAIL 无辜代码。gaps.md + user-override 的形式保留信息但不污染 manifest。

#### Step 4：生成最终 INDEX.md

```markdown
# Project Knowledge INDEX

Generated by harness-workflow scanner — do not edit manually except user-notes blocks.

## Scan Metadata
- schema_version: "1.0.0"
- snapshot_id: "scan-YYYY-MM-DDTHH:MMZ"
- scanner_version: "1.0.0"
- last_full_scan: "<ISO timestamp>"
- scan_duration_sec: <int>
- active_domains: ["style-and-structure", "internal-components", "integrations-and-sdk-usage"]
- total_files_sampled: <int>
- total_todos_surfaced: <N>
- confidence_summary: {high: N, medium: N, low_dropped: N}
- status: active
- cross_model_pass: completed | skipped

## Domain Map (retrieval-ready)

| domain | applies_to (glob) | confidence | last_verified | status |
|--------|------------------|------------|---------------|--------|
| style-and-structure | src/main/java/** | high | YYYY-MM-DD | active |
| internal-components | src/main/java/** | high | YYYY-MM-DD | active |
| integrations-and-sdk-usage | src/main/java/com/acme/integration/** | high | YYYY-MM-DD | active |

## Retrieval Routing Rules

Rules Stage -0.5 uses to select relevant_knowledge_files for a task:
- Path globs (primary): 按 changed_files 与 Domain Map applies_to 匹配
- Keyword triggers (secondary): 按任务描述关键词匹配 domain
- Always-load domains: style-and-structure, internal-components

## Open TODOs

See TODO.md (count: <N>)

## User Overrides

| gap_id | domain | summary | source_gap_anchor |
|--------|--------|---------|-------------------|

## Expired Free-Form Rules

| rule_id | domain | last_verified | expiry_after_days | requirement_text |
|---------|--------|---------------|-------------------|-----------------|
```

#### Step 5：清理临时文件

```bash
# Phase 2 / Phase 3 产出的临时文件，Phase 5 完成后删除
rm docs/harness/knowledge/*/manifest-draft.md
rm docs/harness/knowledge/*/evidence-draft.md
rm docs/harness/knowledge/codex-contradictions.md
# scoutReport 从 .harness-status.json 移除（或清空）
```

#### Step 6：追加 CLAUDE.md 触发契约块（幂等）

见 `knowledge-retrieval.md` 第 8 节。已有 `<!-- harness-knowledge:start -->` 则跳过。

#### Step 7：git commit（用户授权前不 auto push）

```bash
git add docs/harness/knowledge/ CLAUDE.md
git commit -m "chore: initialize project knowledge base (scan-<snapshot_id>)"
# push 需用户确认
```

---

## 4. Partial Rescan 快速路径

### 触发条件

用户跑 `/harness-workflow --partial-rescan <domain>`，适用场景：

- 某 domain 的 manifest 被 `--maintain` 标为 `drifted`，需要重采证据
- 代码库该 domain 有大改动，已知老 rule 过时
- 用户回答了 TODO 后发现证据不足，想补充扫描

### 执行流程

**Phase 1（局部 Scout，不可省略）**：

partial-rescan **必须局部重跑 boundary 探测**，不能纯复用上次 scout：

```
1. 重新识别指定 domain 的 applies_to glob 是否变化（包/目录重命名、boundary 移动）
2. 若发现 boundary 变化：
   a. 同步更新 INDEX.md 的 Domain Map 对应行
   b. 旧 boundary 下的 manifest 做一致性检查：仍有 evidence 留下 → 保留；无 evidence → 归档至 superseded_by
3. 若 scout 发现新增 domain（之前未激活，现在有激活信号）→ 提示用户改跑 --rescan full 模式，不强行继续
```

**Phase 2（只跑指定 domain 的 scanner）**：

与全量 Phase 2 规则相同（24 files / high-confidence only / file:line 必须）。时间上限 10 min（含 scout）。

**Phase 3（Codex Contradiction Pass 仍跑）**：

防新 manifest 与其他 domain 的旧 manifest 冲突。只审查指定 domain vs 其他 domain 的交叉，不审查其他 domain 内部。

**Phase 4（TODO 聚合，上限 3 条）**：

与全量 Phase 4 规则相同，但硬上限降为 3 条。

**User Override Cleanup（精确 ID 匹配）**：

每条新升级的 high-confidence rule 必须在 rule block 内声明：

```markdown
**Supersedes Gap ID**: <gap_id>   （若此 rule 来自用户 override 升级）
**Supersedes Rule ID**: <rule_id>  （若此 rule 取代一条老 rule）
```

Cleanup 只按显式 ID 匹配执行：

- 声明 `Supersedes Gap ID: X` → 标记 `<domain>/gaps.md#X` 为 `superseded_by_rule: <new-rule-id>` + 从 INDEX `## User Overrides` 移除 gap_id=X 的行
- 声明 `Supersedes Rule ID: Y` → 从 INDEX `## Expired Free-Form Rules` 移除 rule_id=Y 的行 + 在对应 manifest 里保留旧 rule 但标 `status: superseded`

**禁止 text similarity 自动删除**：text similarity 只能 propose candidate 写入 TODO，让用户确认后再手动 bump `supersedes_*` ID 触发精确清理。大型 repo 里相似表述跨 domain 常见，自动 fuzzy 删除会误伤。

---

## 5. 失败降级

| 场景 | 动作 |
|------|------|
| Phase 1 Scout 失败（工具不可用、权限不足等） | **BLOCKED**，scanner 不继续执行，提示用户排查 |
| 某 domain scanner 超时（单 domain > 3 min） | 该 domain manifest frontmatter 标 `status: partial`，evidence 保留已采集部分；继续其他 domain |
| Codex 不可用（CLI 未装或 API 不通） | 跳过 Phase 3；INDEX metadata 标注 `cross_model_pass: skipped`；不 BLOCK |
| 用户不回答 TODO.md | knowledge 仍可用（只含 Phase 2 产出的 high-confidence 部分）；gaps.md 保留；`--maintain` 再次提醒 |
| 总耗时超 28 min | 当前 Phase 完成后 **BLOCKED**，提示用户：是否延长时间继续，还是接受 partial 结果（此时已有的 domain manifest 已写入，可用） |
| `--partial-rescan` 总耗时超 10 min | 同上，BLOCKED 后用户决定 |
| `--apply-knowledge-answers` micro-rescan 失败 | 该答案保留在 gaps.md 作 user override（等同于找不到 evidence 的情况 B）；不阻塞其他答案处理 |

**partial manifest 的注入行为**（见 `knowledge-retrieval.md` Rule Status 一节）：manifest 整体 `status: partial` 时，Stage -0.5 仍读该 manifest，Render Pipeline 按每条 rule 的 per-rule Status 独立过滤，仅渲染 `Status: active` 的 rule；注入 prompt 里加 warning "manifest <name> 为 partial 状态（扫描超时），active rule 参与 Binding Rules，置信度可能偏低"。

---

## 6. 与 Stage -0.5 的交接契约

scanner 的最终产物必须满足以下契约，Stage -0.5 才能正常工作：

### INDEX.md 必须字段

```yaml
schema_version: "1.0.0"      # required
snapshot_id: "scan-..."       # required，格式 scan-YYYY-MM-DDTHH:MMZ
last_full_scan: "<ISO>"       # required
active_domains: [...]          # required，列出所有激活的 domain 名
status: active | stale | drifted  # required，不含 disabled
```

INDEX 必须包含以下 sections（即使为空也要有标题）：

- `## Domain Map (retrieval-ready)` — Stage -0.5 Step 2 读取
- `## Retrieval Routing Rules` — Stage -0.5 Step 2 读取
- `## User Overrides` — Stage -0.5 Step 4a 读取
- `## Expired Free-Form Rules` — Stage -0.5 Step 4a 读取

### manifest.md frontmatter 必须字段

```yaml
---
domain: <name>               # required
snapshot_id: "scan-..."      # required，与 INDEX snapshot_id 一致
applies_to:                  # required
  paths: ["glob/**"]
last_verified: YYYY-MM-DD    # required
status: active | partial | drifted | superseded_by:<file>  # required
---
```

### 每条 Rule 必须字段（rule block 内）

```markdown
**Rule ID**: <domain>/rule-<N>   # 必须，稳定 ID，不可改变
**规则**: <描述>                   # 必须
**适用**: <path glob>              # 必须
**Evidence**: evidence.md#<anchor> # 必须，anchor 必须在对应 evidence.md 中存在
**Confidence**: high               # 必须，medium / low 不出现在 manifest
**Status**: active | expired | drifted | superseded  # 必须，默认 active
**violation_test**: <enum>         # 必须（free_form_review 须带额外字段）
```

### evidence.md 必须字段（每个 anchor）

- 至少 1 个 `### Example N` 正例
- 每个 example 必须有 `**File**: <path>:<line>` + `**Interpretation**: <一句话>`
- 禁止：纯 path glob（无行号）/ 无 File 字段 / 无 Interpretation

### gaps.md（条件生成）

仅当 scanner 有未解 gap 时生成。frontmatter：

```yaml
---
domain: <name>
snapshot_id: "scan-..."
---
```

---

## 7. domain 目录结构

scanner 在目标项目产出的文件布局：

```
<target-repo>/
├── docs/harness/knowledge/
│   ├── INDEX.md                              ← 根索引，harness 启动时必读
│   ├── TODO.md                               ← scanner 留给用户批量回答（≤ 8 条）
│   ├── style-and-structure/                  ← 总是激活
│   │   ├── manifest.md      ≤ 140 行
│   │   ├── evidence.md      ≤ 220 行
│   │   └── gaps.md          （条件生成）
│   ├── internal-components/                  ← 总是激活
│   │   ├── manifest.md
│   │   ├── evidence.md
│   │   └── gaps.md
│   ├── exception-and-error-contracts/        ← 条件激活
│   │   ├── manifest.md
│   │   ├── evidence.md
│   │   └── gaps.md
│   ├── integrations-and-sdk-usage/           ← 条件激活（有 SDK 才扫）
│   │   ├── manifest.md
│   │   ├── evidence.md
│   │   └── gaps.md
│   └── i18n-and-text-boundaries/             ← 条件激活（有 resource bundles 才扫）
│       ├── manifest.md
│       ├── evidence.md
│       └── gaps.md
└── CLAUDE.md                                 ← 自动追加 <!-- harness-knowledge:start --> 块
```

**最大激活 domain 数 = 5**（超出说明 domain 分类有问题，scout 应合并相近 domain，不应新增第 6 个 domain）。

---

## 8. 生命周期与 `--maintain` 集成

scanner 产物的健康由 `--maintain` 周期性审计，共 6 条 knowledge audit（编号 7-12，接在已有 memory audit 之后）：

| 编号 | 审计项 | 触发条件 | 动作 |
|------|--------|---------|------|
| 7 | Knowledge snapshot freshness | `last_full_scan > 90 天` | warn 建议 `--rescan` |
| 7 | Knowledge snapshot freshness | `last_full_scan > 180 天` | 标 `INDEX.status: stale`；Stage -0.5 注入时加 warning |
| 8 | Knowledge drift detection | 某 rule 的 occurrence-based 违反率 > 30%（且 sample_size ≥ 5） | 设该 rule `Status: drifted`；drifted 清单写入 gaps.md；聚合到 TODO.md |
| 9 | Evidence file:line 有效性 | evidence 里某 file:line 行号漂移或文件不存在 | 记入 gaps.md；`--rescan` 时重采 |
| 10 | TODO.md 未回答项超期 | 超过 30 天未回答 | warn |
| 11 | INDEX 自身 drift | `active_domains` 列出的 domain 无对应 manifest 文件 | BLOCKED |
| 11 | INDEX 自身 drift | manifest 存在但 INDEX 未列（孤儿文件） | warn |
| 12 | knowledge ↔ memory 反向链接 | `memory/cases/*` 里 `applies_to_knowledge` 指向的 manifest rule 不存在 | warn |

**drift detection 算法（编号 8）**：

```
for each manifest rule (violation_test != free_form_review):
  用 violation_test + applies_to glob 采最多 10 个 matched occurrences
  对每个 occurrence 评分：compliant / noncompliant / not_applicable
  违反率 = noncompliant / (compliant + noncompliant)
  if 违反率 > 0.3 AND sample_size >= 5:
    设 per-rule Status: drifted
    追加到 gaps.md drifted 清单
    聚合到 TODO.md（用户决定"更新 manifest"还是"修代码"）

violation_test: free_form_review 的 rule → 降级为人工抽查提示，追加到 TODO.md
```

**manifest 整体 drifted 条件**：多数 rule（>50%）都 drifted 时，设 manifest frontmatter `status: drifted`。

---

## 9. 与 strict-reviewer 的反向反馈闭环

reviewer 发现"代码违反 manifest Rule" → 产 finding，**不自动更新 manifest**。

| 情况 | 处理 |
|------|------|
| 代码错（manifest 对） | 代码修好后，manifest 不变；scorecard 记录 review 事件 |
| Manifest 过时（代码演化了） | 用户看到 FAIL 后手动判断 → 跑 `--partial-rescan <domain>` → scanner 重采证据 → manifest 更新 + snapshot_id bump → 下次 reviewer 读新 manifest |

**硬约束**：manifest 更新必须走 scanner，**不接受** reviewer / 主 agent 直接改 manifest。任何绕过 scanner 直接修改 manifest 的行为都违反 evidence-first 契约。
