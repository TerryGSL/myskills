# Maintenance — `--maintain` 完整 Audit 流程

> **本文档权威路径**：`harness/harness-common/references/maintenance.md`
> **关联 spec**：`harness-workflow/specs/2026-04-23-project-knowledge-scanner-design.md`
> **关联 references**：`memory-contract.md`（memory audit 基础定义）、`knowledge-retrieval.md`（Stage -0.5 + retrieval 协议）

---

## 1. `--maintain` 入口概述

`--maintain` 是 harness 的**健康度自检模式**，不执行代码变更，仅对项目的 memory 与 knowledge 状态进行系统性 audit，发现漂移、过期、孤儿、一致性问题并输出修复建议或执行修复。

### 1.1 触发方式

```bash
/harness-workflow --maintain
# 或（profile-entry 重塑后的等效路径）
/harness-workflow --maintain
```

`--maintain` 是 harness 模式的保留命令，通过 `harness-workflow/SKILL.md` passthrough 到 harness-common。所有 harness-* 子 skill 共用本文档定义的 audit 流程。

### 1.2 触发频率建议

| 场景 | 建议频率 |
|---|---|
| 活跃开发期（每周有 commit）| 每 2-4 周跑一次 |
| 进入存量维护期（偶发改动）| 每月跑一次 |
| 长期搁置后重启项目 | 必须跑 |
| 发现 STATE.json / memory 疑似过期 | 立即跑 |
| `--rescan` 或 `--partial-rescan` 后 | 建议顺带跑，确认 knowledge 一致性 |

### 1.3 输出格式

```
=== harness --maintain ===
项目：<name>，检查时间：<ISO timestamp>

[Memory Audit]
  Item 1: ...  ✓ OK / ⚠ WARN / ✗ FAIL
  ...
  Item 6: ...  ✓ OK / ⚠ WARN / ✗ FAIL

[Knowledge Audit]
  Item 7: ...  ✓ OK / ⚠ WARN / ✗ FAIL
  ...
  Item 12: ... ✓ OK / ⚠ WARN / ✗ FAIL

[Summary]
  PASS: <N> / WARN: <N> / FAIL: <N>
  BLOCKED: <是/否>

[Actions]
  自动修复：<已执行的修复列表>
  需用户决定：<需确认的修复列表>
```

### 1.4 BLOCKED 条件

以下任一情形导致 `--maintain` 不继续 audit，输出 BLOCKED：

- Item 12（knowledge ↔ memory 反向链接一致性）发现 manifest rule 引用不存在 → BLOCKED（数据完整性损坏）
- Item 11（INDEX.md 自身 drift）发现 `active_domains` 声明的 domain 对应 manifest 不存在 → BLOCKED
- 在 drift 恢复流程中检测到 git 工作区存在 uncommitted 危险文件 → BLOCKED

---

## 2. Memory Audit（Items 1-6）

Memory audit 验证 harness 管理的 `docs/memory/` 体系与当前 git 状态是否一致。完整 memory 机制见 `memory-contract.md`。

### Item 1：STATE.json vs git log 同步

**检查目标**：`docs/STATE.json` 中的 `current_stage`、`last_commit_sha`、`branch` 是否与实际 git 状态匹配。

**检查步骤**：

```bash
# 读取 STATE.json 的关键字段
STATE_SHA=$(jq -r '.last_commit_sha' docs/STATE.json)
STATE_STAGE=$(jq -r '.current_stage' docs/STATE.json)
STATE_BRANCH=$(jq -r '.branch' docs/STATE.json)

# 对比 git 实际状态
ACTUAL_SHA=$(git rev-parse HEAD)
ACTUAL_BRANCH=$(git branch --show-current)
```

**判定规则**：

| 情形 | 结果 |
|---|---|
| SHA 与 HEAD 完全一致，branch 一致 | ✓ OK |
| SHA 落后 1-3 个 commit，branch 一致 | ⚠ WARN（本轮提交未同步 STATE）|
| SHA 落后 >3 个 commit，或 branch 不匹配 | ✗ FAIL → 进入漂移恢复流程 |
| STATE.json 不存在 | ✗ FAIL（项目未初始化）|

**自动修复**：仅 WARN 时可自动刷新 SHA；FAIL 时必须进漂移恢复流程（见第 4 节）。

---

### Item 2：WALKTHROUGH.md 一致性

**检查目标**：`docs/WALKTHROUGH.md` 中描述的"当前实现状态"是否与最新 git log 描述的变更一致。

**检查步骤**：

1. 读 `WALKTHROUGH.md` 最近更新的 Section（通常为"当前进度"或"最近变更"）
2. 对比 `git log --oneline -10`
3. 若 WALKTHROUGH 最后更新的 commit reference 落后于 git log 超过 5 个 commit → WARN

**判定规则**：

| 情形 | 结果 |
|---|---|
| WALKTHROUGH 与 git log 对齐（±2 commit）| ✓ OK |
| 落后 3-10 commit | ⚠ WARN（建议同步）|
| 落后 >10 commit 或 WALKTHROUGH.md 不存在 | ✗ FAIL |

**自动修复**：不自动修改 WALKTHROUGH（内容由人类主笔），仅提示需要更新的具体段落。

---

### Item 3：CLAUDE.md ADR 完整性

**检查目标**：`CLAUDE.md` 中的 ADR（架构决策记录）段落是否涵盖所有 `docs/memory/decisions/` 目录下的关键决策。

**检查步骤**：

```bash
# 统计 decisions/ 下 harness 管理的决策文件数
DECISION_COUNT=$(ls docs/memory/decisions/harness_*.md 2>/dev/null | wc -l)

# 统计 CLAUDE.md 中 ADR 段落的引用数（按约定格式计数）
ADR_REF_COUNT=$(grep -c "^## ADR\|^### ADR\|ADR-[0-9]" CLAUDE.md 2>/dev/null || echo 0)
```

**判定规则**：

| 情形 | 结果 |
|---|---|
| ADR 引用数 ≥ decision 文件数 | ✓ OK |
| ADR 引用数 < decision 文件数（差值 ≤ 2）| ⚠ WARN（新增决策未同步 CLAUDE.md）|
| ADR 引用数 < decision 文件数（差值 > 2）| ✗ FAIL |
| CLAUDE.md 无 ADR 段落，decisions/ 有文件 | ✗ FAIL |

---

### Item 4：memory 文件 current state 刷新

**检查目标**：`docs/memory/cases/harness_*.md` 中状态为 `active` 的 case，其 `last_referenced` 字段是否在近期内有更新（防止遗忘的活跃错误案例）。

**检查步骤**：

读 `docs/memory/ERRORS.md` 中所有 `status: active` 的 case header，检查 `last_referenced` 字段：

```bash
# 找出 last_referenced 超过 60 天未更新的 active case
NOW=$(date +%s)
THRESHOLD=5184000  # 60 天（秒）
```

**判定规则**：

| 情形 | 结果 |
|---|---|
| 所有 active case 均在 60 天内引用过 | ✓ OK |
| 存在 1-3 个 active case 超过 60 天未引用 | ⚠ WARN（建议检查是否应 archive）|
| 存在 >3 个 active case 超过 60 天未引用 | ✗ FAIL（memory 体系可能过期）|

完整 case 生命周期见 `memory-contract.md` §生命周期管理。

---

### Item 5：git status 未提交检查

**检查目标**：当前 git 工作区是否有未提交的变更影响 harness 管理的文件。

**检查步骤**：

```bash
# 检查 harness 管理路径下的未提交变更
git status --porcelain docs/memory/ docs/STATE.json docs/WALKTHROUGH.md CLAUDE.md \
           docs/harness/ 2>/dev/null
```

**判定规则**：

| 情形 | 结果 |
|---|---|
| 无未提交变更 | ✓ OK |
| 有未提交变更（仅 docs/memory/ 或 docs/harness/）| ⚠ WARN（未提交的 memory/knowledge 更新）|
| 有未提交变更（涉及 STATE.json / CLAUDE.md）| ✗ FAIL → 提示用户先 commit 再跑 `--maintain` |

**自动修复**：不自动提交（遵循 harness "不主动 push" 原则）；输出待提交文件列表，建议用户操作。

---

### Item 6：harness_project_stack.md 漂移

**检查目标**：若项目存在 `docs/memory/harness_project_stack.md`（或等效的技术栈记录），其中记录的框架版本是否与 `package.json` / `go.mod` / `pyproject.toml` / `Cargo.toml` 等实际依赖文件一致。

**检查步骤**：

```bash
# 读取 harness_project_stack.md 中的版本记录
# 对比实际依赖文件中的版本
# 以 package.json 为例
RECORDED_VERSION=$(grep -A1 "next:" docs/memory/harness_project_stack.md | tail -1 | tr -d ' ')
ACTUAL_VERSION=$(jq -r '.dependencies.next // .devDependencies.next' package.json)
```

**判定规则**：

| 情形 | 结果 |
|---|---|
| 记录版本与实际版本 patch 一致 | ✓ OK |
| 记录版本与实际版本 minor 不同 | ⚠ WARN（小版本升级未同步记录）|
| 记录版本与实际版本 major 不同，或文件不存在但有依赖文件 | ✗ FAIL |

**自动修复**：WARN 时可自动更新 `harness_project_stack.md` 版本号；FAIL 时建议人工确认后再更新（可能含 breaking change）。

---

## 3. Knowledge Audit（Items 7-12）

Knowledge audit 是 `--maintain` 在 memory audit 基础上新增的 6 项检查，针对 `docs/harness/knowledge/` 体系的健康状态。若项目未接入 knowledge（`docs/harness/knowledge/INDEX.md` 不存在），本节全部跳过，标注 `N/A`。

完整 knowledge 机制见 `knowledge-retrieval.md`。

---

### Item 7：Knowledge Snapshot Freshness

**检查目标**：`docs/harness/knowledge/INDEX.md` 中的 `last_full_scan` 时间戳是否过期。

**检查步骤**：

```bash
LAST_SCAN=$(grep "last_full_scan:" docs/harness/knowledge/INDEX.md | \
            grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:Z]+")
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# 计算天数差 DAYS_SINCE_SCAN
```

**判定规则**：

| `DAYS_SINCE_SCAN` | 结果 | 动作 |
|---|---|---|
| ≤ 90 天 | ✓ OK | — |
| 91-180 天 | ⚠ WARN | 建议跑 `--rescan`；输出警告"knowledge snapshot 已 X 天，建议刷新" |
| > 180 天 | ✗ FAIL | **自动将 `INDEX.status` 改为 `stale`**；Stage -0.5 注入时会加 warning；输出"knowledge snapshot 超 180 天，已标记 stale，请尽快 `--rescan`" |

**注意**：`INDEX.status` 只有 `active | stale | drifted` 三态，`disabled` 只通过 `CLAUDE.md` 表达（见 `knowledge-retrieval.md` §Step 0）。

---

### Item 8：Knowledge Drift Detection

**检查目标**：每个 manifest 中每条 `Status: active` 的 rule，其 `violation_test` 对应的代码遵循率是否仍在阈值之上。

**检查步骤（occurrence-based，非文件级采样）**：

对每条 active rule：

1. 用 `violation_test` + `applies_to` glob，在对应代码中采样**最多 10 个 matched occurrences**
   - `must_use_wrapper`：采所有 service 方法返回类型
   - `must_not_throw_raw_exception`：采所有 throw 语句
   - `free_form_review`：无法机器采样，降级为 TODO 提示（见下）
2. 对每个 occurrence 评分：`compliant` / `noncompliant` / `not_applicable`
3. 计算违反率：`noncompliant / (compliant + noncompliant)`

```bash
# 示例：检查 must_not_throw_raw_exception（Java）
MATCHES=$(rg --json "throw new (RuntimeException|Exception)\(" \
          --glob "src/main/java/**" | head -10)
# 逐条评判是否 compliant
```

**Drift 触发条件**（必须同时满足）：
- 违反率 > **0.3**（30%）
- `sample_size = compliant + noncompliant >= 5`（少于 5 个样本不下结论）

**命中时执行**：

- 将该 Rule 的 per-rule `Status` 改为 `drifted`（**不**动 manifest 级 frontmatter status）
- drifted rule 清单写入对应 `<domain>/gaps.md`
- drifted rule **不**进 `knowledge_requirements`，**不**进 `advisory_knowledge`，只记 `knownIssue`

**manifest 级 frontmatter status 更新规则**：

| 条件 | manifest frontmatter status |
|---|---|
| 多数 rule（>50%）drifted | → `drifted` |
| 少数 rule drifted（≤50%）| 保持 `active`（单条 rule 标 drifted，manifest 整体不变）|

**`free_form_review` rule 的 drift 处理**：无法机器采样 → 追加 TODO.md 条目，提示用户人工抽查；本轮不改 Rule Status。

**聚合输出**：所有 drifted rule 汇总到 `TODO.md`，格式为"Rule X drifted — 是否通过 `--partial-rescan <domain>` 更新？"

---

### Item 9：Expired Free-Form Rules

**检查目标**：`violation_test: free_form_review` 的 rule，其 `last_verified` 距今是否超过 `expiry_after_days`。

**检查步骤**：

```bash
# 对每个 manifest 中 violation_test: free_form_review 的 rule
# 读取 last_verified 和 expiry_after_days
# 计算 days_since_verified = now - last_verified

# 示例提取
RULES=$(grep -A10 "free_form_review" docs/harness/knowledge/*/manifest.md)
```

**判定规则**：

| 条件 | 动作 |
|---|---|
| `days_since_verified <= expiry_after_days` | ✓ OK，跳过 |
| `days_since_verified > expiry_after_days` | **执行以下两步**：① 在 manifest.md 中将该 rule 的 per-rule `Status` 改为 `expired`；② 在 `INDEX.md` 的 `## Expired Free-Form Rules` 表追加一行 |

**INDEX.md 追加格式**：

```markdown
## Expired Free-Form Rules

| rule_id | domain | last_verified | expiry_after_days | requirement_text |
|---------|--------|---------------|-------------------|-----------------|
| <domain>/rule-N | <domain> | YYYY-MM-DD | <int> | <一句话描述> |
```

**恢复机制**：

- 若用户跑 `/harness-workflow --partial-rescan <domain>` 重新采证据，或手动 bump `last_verified` → 从 `INDEX.md Expired Free-Form Rules` 表精确移除对应行 + manifest 恢复 `Status: active`
- 恢复必须按 `rule_id` 精确匹配，禁止 text similarity 模糊删除

**Stage -0.5 处理**：`expired` rule **不进** `knowledge_requirements`（不 binding）；进 `advisory_knowledge`（作为 `source: expired_rule` 的 advisory 注入），reviewer 不以此 FAIL。

---

### Item 10：Evidence file:line 有效性

**检查目标**：`docs/harness/knowledge/<domain>/evidence.md` 中每个 `File: <path>:<line>` 引用是否仍有效（文件存在且行号未漂移）。

**检查步骤**：

```bash
# 提取所有 evidence.md 中的 file:line 引用
EVIDENCE_REFS=$(grep -rn "^\*\*File\*\*:" docs/harness/knowledge/*/evidence.md \
               | grep -oE "`[^:]+:[0-9]+`" | tr -d '`')

# 对每个引用验证
while IFS= read -r ref; do
  FILE=$(echo "$ref" | cut -d: -f1)
  LINE=$(echo "$ref" | cut -d: -f2)

  # 验证文件存在
  if [ ! -f "$FILE" ]; then
    echo "MISSING_FILE: $ref"
    continue
  fi

  # 用 git blame 检测行号漂移
  BLAME=$(git blame -L "$LINE,$LINE" "$FILE" 2>/dev/null)
  if [ -z "$BLAME" ]; then
    echo "LINE_DRIFTED: $ref"
  fi
done <<< "$EVIDENCE_REFS"
```

**判定规则**：

| 情形 | 结果 | 动作 |
|---|---|---|
| 所有 file:line 有效 | ✓ OK | — |
| 1-3 个 file:line 失效（文件存在，行号漂移）| ⚠ WARN | 记录到对应 domain 的 `gaps.md`；提示"建议 `--partial-rescan <domain>` 重新抓证据" |
| >3 个 file:line 失效，或文件不存在 | ✗ FAIL | 同上，但标注优先级高，evidence 已失去审计价值 |

**gaps.md 记录格式**：

```markdown
- **Gap (evidence drift)**: `<path>:<line>` 已失效
  - 原引用：`<original_file:line>`
  - 失效原因：文件不存在 / 行号漂移（git blame 无返回）
  - 建议：`--partial-rescan <domain>` 重采证据
```

---

### Item 11：INDEX.md 自身 Drift

**检查目标**：`INDEX.md` 中 `active_domains` 列表与实际 `docs/harness/knowledge/` 目录下的 domain 是否一致（孤儿检测）。

**检查步骤**：

```bash
# 读取 INDEX.md 的 active_domains 列表
ACTIVE_DOMAINS=$(grep "active_domains:" docs/harness/knowledge/INDEX.md \
                | grep -oE "\[.*\]" | tr -d '[]"' | tr ',' '\n' | tr -d ' ')

# 读取实际存在的 domain 目录
ACTUAL_DOMAINS=$(ls -d docs/harness/knowledge/*/manifest.md 2>/dev/null \
                | xargs -I{} dirname {} | xargs -I{} basename {})
```

**判定规则**：

| 情形 | 结果 | 动作 |
|---|---|---|
| `active_domains` 与实际目录完全一致 | ✓ OK | — |
| `active_domains` 声明了某 domain，但 manifest 不存在 | ✗ **FAIL → BLOCKED** | 数据完整性损坏，输出 BLOCKED；用户必须手动修复（创建 manifest 或从 INDEX 移除 domain）|
| manifest 存在但 INDEX 未在 `active_domains` 列出 | ⚠ WARN（孤儿文件）| 输出孤儿 manifest 列表，建议用户决定是否加入 INDEX 或删除 manifest |

**孤儿文件处理注意**：孤儿 manifest 不自动删除（用户可能是手动创建的临时 domain），仅 WARN 并列出路径。

---

### Item 12：Knowledge ↔ Memory 反向链接一致性

**检查目标**：`docs/memory/` 与 `docs/harness/knowledge/` 之间的双向引用必须有效。

**检查方向 A**：memory → knowledge

`docs/memory/cases/harness_*.md` 中若含 `applies_to_knowledge:` 字段，其指向的 manifest rule 必须存在。

```bash
# 提取所有 applies_to_knowledge 引用
grep -rn "applies_to_knowledge:" docs/memory/cases/harness_*.md \
  | grep -oE "[a-z-]+/rule-[0-9]+" | while read rule_id; do
    DOMAIN=$(echo "$rule_id" | cut -d/ -f1)
    MANIFEST="docs/harness/knowledge/$DOMAIN/manifest.md"
    if ! grep -q "Rule ID.*$rule_id" "$MANIFEST" 2>/dev/null; then
      echo "BROKEN_REF: memory → knowledge: $rule_id (manifest missing or rule deleted)"
    fi
  done
```

**检查方向 B**：knowledge → memory

`docs/harness/knowledge/<domain>/evidence.md` 的 Counterexample 段若链接 `docs/memory/cases/harness_*.md`，对应文件必须存在。

```bash
grep -rn "memory/cases/harness_" docs/harness/knowledge/*/evidence.md \
  | grep -oE "docs/memory/cases/harness_[a-z0-9_-]+\.md" | while read case_path; do
    if [ ! -f "$case_path" ]; then
      echo "BROKEN_REF: knowledge → memory: $case_path (case file missing)"
    fi
  done
```

**判定规则**：

| 情形 | 结果 | 动作 |
|---|---|---|
| 无损坏引用 | ✓ OK | — |
| 存在损坏引用（任一方向）| ✗ **FAIL → BLOCKED** | 输出损坏引用列表；等待用户修复（更新引用路径，或标记 `superseded`）；禁止自动删除 |

**BLOCKED 原因**：双向引用损坏意味着 memory case 或 knowledge rule 之间的关联信息不一致，继续跑可能导致 reviewer 错误引用已不存在的 rule 或 case。

---

## 4. Drift 恢复流程（7 步）

当 `--maintain` 发现严重漂移（多个 FAIL，或涉及 STATE/WALKTHROUGH/CLAUDE 的不一致），执行标准化恢复流程。

### 前提：确认漂移范围

在执行任何修改前，先完整阅读 `--maintain` 的 audit 报告，确认哪些 Items 为 FAIL。

---

### Step 1：暂停编码

```
[--maintain drift recovery: Step 1]
检测到多项 FAIL，进入漂移恢复模式。
本轮不进行代码变更，专注于文档状态恢复。
如需继续编码，请先完成恢复流程。
```

输出暂停声明，不执行任何代码修改。

---

### Step 2：git log 确认真实进度

```bash
# 读取最近 20 个 commit，确认实际完成的工作
git log --oneline -20

# 对比 STATE.json 中记录的 last_commit_sha
git show <STATE_SHA> --stat
```

输出：git log 摘要 vs STATE.json 记录的差异列表。

---

### Step 3：更新 STATE.json

```bash
# 用实际 HEAD SHA 更新 STATE.json
ACTUAL_SHA=$(git rev-parse HEAD)
ACTUAL_BRANCH=$(git branch --show-current)

# 更新字段（不改 current_stage 和 task_description，保留人工填写）
jq --arg sha "$ACTUAL_SHA" --arg branch "$ACTUAL_BRANCH" \
   '.last_commit_sha = $sha | .branch = $branch' \
   docs/STATE.json > docs/STATE.json.tmp && mv docs/STATE.json.tmp docs/STATE.json
```

**注意**：`current_stage` 由 coordinator 在各 Stage 执行时写入，`--maintain` 不修改 stage 字段（Stage 状态应由实际执行流控制）。

---

### Step 4：更新 WALKTHROUGH.md

不自动重写（WALKTHROUGH 是人类主笔），但输出需更新的具体段落建议：

```
[建议更新 WALKTHROUGH.md]
当前 WALKTHROUGH 最后更新：<timestamp>
实际 git log 新增了以下变更：
  - <commit1>: <message>
  - <commit2>: <message>
  ...
建议在 WALKTHROUGH.md "当前进度" 段落追加上述变更描述。
```

---

### Step 5：更新 CLAUDE.md ADR

若 Item 3（ADR 完整性）为 FAIL：

```
[建议更新 CLAUDE.md]
以下 decision 文件未在 CLAUDE.md 中有对应 ADR：
  - docs/memory/decisions/harness_<name>.md
建议在 CLAUDE.md 的 ADR 段落追加引用。
```

不自动写入 CLAUDE.md（用户主笔区），仅输出建议。

---

### Step 6：更新 memory / knowledge 文件

**Memory 侧**（Item 4 / Item 6 漂移）：

```bash
# Item 6: harness_project_stack.md 版本同步（WARN 时可自动）
# 读取实际依赖版本，更新记录
```

**Knowledge 侧**（Item 7-10 / Item 11 / Item 12 修复）：

- Item 7（stale）：自动更新 `INDEX.status: stale`
- Item 8（drift）：自动更新 drifted rule 的 per-rule `Status: drifted`；追加 TODO.md
- Item 9（expired）：自动更新 expired rule 的 `Status: expired`；追加 INDEX.md Expired Free-Form Rules 表
- Item 10（evidence drift）：不自动修复（需 scanner 重采证据），仅记录 gaps.md
- Item 11（孤儿）：WARN 不自动修复；FAIL (BLOCKED) 等用户修复
- Item 12（链接损坏）：BLOCKED，等用户修复

---

### Step 7：Commit

修复完成后，将所有 `--maintain` 产生的变更统一 commit：

```bash
# 检查变更范围（仅 harness 管理的文件）
git diff --name-only docs/STATE.json docs/memory/ docs/harness/knowledge/

# 用户确认后执行
git add docs/STATE.json docs/memory/ docs/harness/knowledge/
git commit -m "chore(harness): --maintain drift recovery $(date +%Y-%m-%d)"
```

**强调**：不自动 push（遵循 harness 策略，等用户指示）。

---

## 5. Red-flag 自检

在执行任何编码任务前，coordinator 必须自我检查以下禁忌项。存在任何一条 → 暂停并向用户汇报，不继续执行。

### 5.1 禁跳 Plan

```
RED FLAG: 跳过 Plan 直接开始实现
  症状：未产出 /plan 文档就进入 Stage 3（实现）
  后果：实现方向偏离需求，review FAIL 后返工成本高
  正确：Stage 0-2 产出 PRD → 架构 → Plan，Stage 3 按 Plan 实现
```

### 5.2 禁让测试当 reviewer

```
RED FLAG: 用"测试通过"替代 strict-reviewer review
  症状：Stage 4 因 strict-reviewer 不可用，改用"跑测试通过即视为 PASS"
  后果：绕过三硬门 + Knowledge Compliance Check，质量隐患未发现
  正确：strict-reviewer 不可用时按 reviewer-integration.md §5 降级规则执行，
        harness 模式下只能 BLOCKED，不降级
```

### 5.3 禁 STATE 等做完再更新

```
RED FLAG: 完成 Stage 3 后才回头更新 STATE.json
  症状：STATE.json 的 current_stage 总是落后 1-2 个 Stage
  后果：--maintain 检测到 STATE 漂移，恢复成本高；Stage 间状态不可信
  正确：每个 Stage 开始时写 current_stage，结束时写 last_commit_sha
```

### 5.4 禁跳 Stage -0.5

```
RED FLAG: 跳过 Stage -0.5（Project Context Retrieval）
  症状：INDEX.md 存在但未跑 Stage -0.5，直接进 Stage 2/3
  后果：knowledge_requirements 为空，reviewer 第 4 硬门无法检查；
        可能违反 knowledge rule 而不被发现
  正确：每轮开始必须跑 Stage -0.5（S 级也不跳过）；
        disable 只通过 CLAUDE.md 的 harness-knowledge: disabled 表达
```

### 5.5 禁 fuzzy 匹配删除 knowledge

```
RED FLAG: 用 text similarity 自动删除 gaps.md / INDEX.md 的条目
  症状：cleanup 逻辑基于字符串相似度决定删除哪些 override / expired rule
  后果：误删相似但不同的条目（大型 repo 中跨 domain 相似表述常见）
  正确：cleanup 只按显式 rule_id / gap_id 精确匹配执行，禁止 fuzzy 删除
```

### 5.6 禁直接改 manifest

```
RED FLAG: reviewer / 主 agent 直接修改 manifest.md
  症状：发现 manifest 过时后直接编辑 manifest rule，不走 scanner
  后果：manifest 失去 evidence-first 约束，rule 无 file:line 支撑；
        下轮 reviewer 依据未验证 rule FAIL 代码
  正确：manifest 更新必须走 scanner（--rescan / --partial-rescan），
        用户可手动 bump last_verified（仅用于 free_form_review 续期）
```

### 5.7 禁在 autonomous_mode 降级

```
RED FLAG: autonomous_mode 下 strict-reviewer 不可用时自动降级
  症状：自治执行时 strict-reviewer 调用失败，自动改用 qa-prompt 继续
  后果：硬门保护形同虚设，autonomous_mode 的安全假设被破坏
  正确：autonomous_mode 下 strict-reviewer 不可用 → 永远 BLOCKED；
        不降级，不重试替代方案，等待用户介入
```

---

## 6. 快速参考

### `--maintain` 完整 12 项检查一览

| # | 检查项 | 类别 | 失败时最严重结果 |
|---|---|---|---|
| 1 | STATE.json vs git log 同步 | Memory | FAIL → 漂移恢复 |
| 2 | WALKTHROUGH.md 一致性 | Memory | FAIL → 建议更新 |
| 3 | CLAUDE.md ADR 完整性 | Memory | FAIL → 建议更新 |
| 4 | memory 文件 current state 刷新 | Memory | FAIL → 建议 archive |
| 5 | git status 未提交检查 | Memory | FAIL → 先 commit |
| 6 | harness_project_stack.md 漂移 | Memory | FAIL → 建议更新 |
| 7 | Knowledge snapshot freshness | Knowledge | FAIL → 标 stale，建议 rescan |
| 8 | Knowledge drift detection | Knowledge | FAIL → 标 drifted，追加 TODO |
| 9 | Expired free_form_review rules | Knowledge | FAIL → 标 expired，追加 INDEX |
| 10 | Evidence file:line 有效性 | Knowledge | FAIL → 追加 gaps.md |
| 11 | INDEX.md 自身 drift（孤儿检测）| Knowledge | FAIL → **BLOCKED** |
| 12 | Knowledge ↔ Memory 反向链接 | Knowledge | FAIL → **BLOCKED** |

### 关键阈值速查

| 参数 | 阈值 | 来源 |
|---|---|---|
| Snapshot freshness warn | 90 天 | Item 7 |
| Snapshot freshness stale | 180 天 | Item 7 |
| Drift 违反率阈值 | > 0.3（30%）| Item 8 |
| Drift 最小样本量 | >= 5 | Item 8 |
| Manifest drifted 阈值 | > 50% rules drifted | Item 8 |
| Free-form rule 默认过期 | 90 天（`expiry_after_days` 默认值）| Item 9 |
| Active case 未引用警告 | > 60 天 | Item 4 |
| STATE SHA 落后 WARN | > 3 commits | Item 1 |
