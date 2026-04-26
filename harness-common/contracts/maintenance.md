# Maintenance — `harness maintain` 完整 Audit + 一致性校验 + Drift 恢复

> **Source of truth**: `packages/harness-cli/src/commands/maintain.ts` + `resources/schemas/drift.schema.json`。如本文档与代码不一致，以代码为准。
>
> 合并自 A 套 `references/maintenance.md`（12 项 audit + 4 类一致性校验 + 7 步 drift 恢复 + red-flag 自检）。drift 检测的 6 类粗粒度概览见 [drift.md](drift.md)；本文档定义具体的一致性校验项 + 漂移恢复流程。

`harness maintain` 是 harness 的**健康度自检模式**，不执行代码变更，仅对项目的 memory 与 knowledge 状态进行系统性 audit。本契约规范 4 类一致性校验项 + 标准化 7 步 drift 恢复流程 + 7 条 red-flag 自检。

## 1. 入口与触发

```bash
harness maintain                  # 标准模式（read-only audit）
harness maintain --upgrade        # 按新 bundled 重新处理 managed-files（见 drift.md §`--upgrade`）
```

### 触发频率建议

| 场景 | 建议频率 |
|------|---------|
| 活跃开发期（每周有 commit） | 每 2-4 周跑一次 |
| 进入存量维护期（偶发改动） | 每月跑一次 |
| 长期搁置后重启项目 | 必须跑 |
| 发现 STATE.json / memory 疑似过期 | 立即跑 |
| `harness scan --rescan` / `--partial-rescan` 后 | 建议顺带跑，确认 knowledge 一致性 |

### 输出格式

```
=== harness maintain ===
项目：<name>，检查时间：<ISO timestamp>

[Memory Audit]
  Item 1: STATE.json vs git log 同步                  ✓ OK / ⚠ WARN / ✗ FAIL
  Item 2: WALKTHROUGH.md 一致性                       ✓ OK / ⚠ WARN / ✗ FAIL
  Item 3: CLAUDE.md ADR 完整性                        ✓ OK / ⚠ WARN / ✗ FAIL
  Item 4: memory 文件 current state 刷新              ✓ OK / ⚠ WARN / ✗ FAIL
  Item 5: git status 未提交检查                       ✓ OK / ⚠ WARN / ✗ FAIL
  Item 6: harness_project_stack.md 漂移               ✓ OK / ⚠ WARN / ✗ FAIL

[Knowledge Audit]
  Item 7:  Knowledge snapshot freshness               ✓ OK / ⚠ WARN / ✗ FAIL
  Item 8:  Knowledge drift detection                  ✓ OK / ⚠ WARN / ✗ FAIL
  Item 9:  Expired free_form_review rules             ✓ OK / ⚠ WARN / ✗ FAIL
  Item 10: Evidence file:line 有效性                  ✓ OK / ⚠ WARN / ✗ FAIL
  Item 11: INDEX.md 自身 drift（孤儿检测）             ✓ OK / ⚠ WARN / ✗ FAIL
  Item 12: Knowledge ↔ Memory 反向链接一致性           ✓ OK / ⚠ WARN / ✗ FAIL

[Summary]
  PASS: <N> / WARN: <N> / FAIL: <N>
  BLOCKED: <是/否>

[Actions]
  自动修复：<已执行的修复列表>
  需用户决定：<需确认的修复列表>
```

### BLOCKED 条件

以下任一情形 → `harness maintain` 不继续 audit，输出 BLOCKED：

- Item 12（knowledge ↔ memory 反向链接一致性）发现 manifest rule 引用不存在 → BLOCKED（数据完整性损坏）
- Item 11（INDEX.md 自身 drift）发现 `active_domains` 声明的 domain 对应 manifest 不存在 → BLOCKED
- 在 drift 恢复流程中检测到 git 工作区存在 uncommitted 危险文件 → BLOCKED

---

## 2. 4 类一致性校验项（详细）

> drift.md §1-§6 是 6 类粗粒度 drift（managed-files / memory tree / frontmatter / learnings retention / knowledge freshness / schema 哨兵）。本节是 4 类**具体校验项**：WALKTHROUGH 一致性 / CLAUDE.md ADR 完整性 / evidence file:line 有效性 / knowledge↔memory 反向链。

### 校验类 A：WALKTHROUGH.md 一致性（Item 2）

**目标**：`docs/WALKTHROUGH.md` 中描述的"当前实现状态"与最新 git log 描述的变更一致。

**步骤**：

1. 读 `WALKTHROUGH.md` 最近更新的 Section（"当前进度"或"最近变更"）
2. 对比 `git log --oneline -10`
3. 若 WALKTHROUGH 最后更新的 commit reference 落后于 git log 超过 5 个 commit → WARN

**判定规则**：

| 情形 | 结果 |
|------|------|
| WALKTHROUGH 与 git log 对齐（±2 commit） | ✓ OK |
| 落后 3-10 commit | ⚠ WARN（建议同步） |
| 落后 >10 commit 或 WALKTHROUGH.md 不存在 | ✗ FAIL |

**自动修复**：不自动修改 WALKTHROUGH（人类主笔），仅提示需要更新的具体段落。

---

### 校验类 B：CLAUDE.md ADR 完整性（Item 3）

**目标**：`CLAUDE.md` 中的 ADR（架构决策记录）段落涵盖 `docs/memory/decisions/` 下所有关键决策。

**步骤**：

```bash
DECISION_COUNT=$(ls docs/memory/decisions/harness_*.md 2>/dev/null | wc -l)
ADR_REF_COUNT=$(grep -c "^## ADR\|^### ADR\|ADR-[0-9]" CLAUDE.md 2>/dev/null || echo 0)
```

**判定规则**：

| 情形 | 结果 |
|------|------|
| ADR 引用数 ≥ decision 文件数 | ✓ OK |
| ADR 引用数 < decision 文件数（差值 ≤ 2） | ⚠ WARN（新增决策未同步 CLAUDE.md） |
| ADR 引用数 < decision 文件数（差值 > 2） | ✗ FAIL |
| CLAUDE.md 无 ADR 段落，decisions/ 有文件 | ✗ FAIL |

---

### 校验类 C：Evidence file:line 有效性（Item 10）

**目标**：`docs/harness/knowledge/<domain>/evidence.md` 中每个 `File: <path>:<line>` 引用仍有效（文件存在 + 行号未漂移）。

**步骤**：

```bash
EVIDENCE_REFS=$(grep -rn "^\*\*File\*\*:" docs/harness/knowledge/*/evidence.md \
               | grep -oE "`[^:]+:[0-9]+`" | tr -d '`')

while IFS= read -r ref; do
  FILE=$(echo "$ref" | cut -d: -f1)
  LINE=$(echo "$ref" | cut -d: -f2)
  [ ! -f "$FILE" ] && echo "MISSING_FILE: $ref" && continue
  BLAME=$(git blame -L "$LINE,$LINE" "$FILE" 2>/dev/null)
  [ -z "$BLAME" ] && echo "LINE_DRIFTED: $ref"
done <<< "$EVIDENCE_REFS"
```

**判定规则**：

| 情形 | 结果 | 动作 |
|------|------|------|
| 所有 file:line 有效 | ✓ OK | — |
| 1-3 个 file:line 失效（文件存在，行号漂移） | ⚠ WARN | 记录到对应 domain 的 `gaps.md`；提示"建议 `harness scan --partial-rescan <domain>`" |
| >3 个 file:line 失效，或文件不存在 | ✗ FAIL | 同上，但优先级高，evidence 已失去审计价值 |

**gaps.md 记录格式**：

```markdown
- **Gap (evidence drift)**: `<path>:<line>` 已失效
  - 原引用：`<original_file:line>`
  - 失效原因：文件不存在 / 行号漂移（git blame 无返回）
  - 建议：`harness scan --partial-rescan <domain>` 重采证据
```

---

### 校验类 D：Knowledge ↔ Memory 反向链接一致性（Item 12）

**目标**：`docs/memory/` 与 `docs/harness/knowledge/` 之间的双向引用都有效。

**方向 A**（memory → knowledge）：`docs/memory/cases/harness_*.md` 中若含 `applies_to_knowledge:` 字段，其指向的 manifest rule 必须存在。

```bash
grep -rn "applies_to_knowledge:" docs/memory/cases/harness_*.md \
  | grep -oE "[a-z-]+/rule-[0-9]+" | while read rule_id; do
    DOMAIN=$(echo "$rule_id" | cut -d/ -f1)
    MANIFEST="docs/harness/knowledge/$DOMAIN/manifest.md"
    if ! grep -q "Rule ID.*$rule_id" "$MANIFEST" 2>/dev/null; then
      echo "BROKEN_REF: memory → knowledge: $rule_id (manifest missing or rule deleted)"
    fi
  done
```

**方向 B**（knowledge → memory）：`docs/harness/knowledge/<domain>/evidence.md` 的 Counterexample 段若链接 `docs/memory/cases/harness_*.md`，对应文件必须存在。

```bash
grep -rn "memory/cases/harness_" docs/harness/knowledge/*/evidence.md \
  | grep -oE "docs/memory/cases/harness_[a-z0-9_-]+\.md" | while read case_path; do
    [ ! -f "$case_path" ] && echo "BROKEN_REF: knowledge → memory: $case_path (case file missing)"
  done
```

**判定规则**：

| 情形 | 结果 | 动作 |
|------|------|------|
| 无损坏引用 | ✓ OK | — |
| 存在损坏引用（任一方向） | ✗ **FAIL → BLOCKED** | 输出损坏引用列表；等待用户修复（更新引用路径，或标记 `superseded`）；禁止自动删除 |

**BLOCKED 原因**：双向引用损坏意味着 memory case 或 knowledge rule 之间的关联信息不一致，继续跑可能导致 reviewer 错误引用已不存在的 rule 或 case。

---

## 3. Drift 恢复 7 步流程

当 `harness maintain` 发现严重漂移（多个 FAIL，或涉及 STATE/WALKTHROUGH/CLAUDE 的不一致），执行标准化恢复流程。

### 前提

在执行任何修改前，先完整阅读 `harness maintain` 的 audit 报告，确认哪些 Items 为 FAIL。

### Step 1：暂停编码

```
[harness maintain drift recovery: Step 1]
检测到多项 FAIL，进入漂移恢复模式。
本轮不进行代码变更，专注于文档状态恢复。
如需继续编码，请先完成恢复流程。
```

输出暂停声明，不执行任何代码修改。

### Step 2：git log 确认真实进度

```bash
git log --oneline -20
git show <STATE_SHA> --stat
```

输出 git log 摘要 vs STATE.json 记录的差异列表。

### Step 3：更新 STATE.json

```bash
ACTUAL_SHA=$(git rev-parse HEAD)
ACTUAL_BRANCH=$(git branch --show-current)

jq --arg sha "$ACTUAL_SHA" --arg branch "$ACTUAL_BRANCH" \
   '.last_commit_sha = $sha | .branch = $branch' \
   docs/STATE.json > docs/STATE.json.tmp && mv docs/STATE.json.tmp docs/STATE.json
```

**注意**：`current_stage` 由 coordinator 在各 Stage 执行时写入，恢复流程不动 stage 字段。

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

### Step 5：更新 CLAUDE.md ADR

若校验类 B（ADR 完整性）为 FAIL：

```
[建议更新 CLAUDE.md]
以下 decision 文件未在 CLAUDE.md 中有对应 ADR：
  - docs/memory/decisions/harness_<name>.md
建议在 CLAUDE.md 的 ADR 段落追加引用。
```

不自动写入 CLAUDE.md（用户主笔区），仅输出建议。

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

### Step 7：Commit

修复完成后，将所有 audit 产生的变更统一 commit：

```bash
git diff --name-only docs/STATE.json docs/memory/ docs/harness/knowledge/

git add docs/STATE.json docs/memory/ docs/harness/knowledge/
git commit -m "chore(harness): maintain drift recovery $(date +%Y-%m-%d)"
```

**强调**：不自动 push（遵循 harness 策略，等用户指示）。

---

## 4. Red-flag 自检（7 条）

在执行任何编码任务前，coordinator 必须自我检查以下禁忌项。存在任一 → 暂停并向用户汇报，不继续执行。

### 4.1 禁跳 Plan

```
RED FLAG: 跳过 Plan 直接开始实现
  症状：未产出 /plan 文档就进入 Stage 3（实现）
  后果：实现方向偏离需求，review FAIL 后返工成本高
  正确：Stage 0-2 产出 PRD → 架构 → Plan，Stage 3 按 Plan 实现
```

### 4.2 禁让测试当 reviewer

```
RED FLAG: 用"测试通过"替代 strict-reviewer review
  症状：Stage 4 因 strict-reviewer 不可用，改用"跑测试通过即视为 PASS"
  后果：绕过 4 硬门 + Knowledge Compliance Check，质量隐患未发现
  正确：strict-reviewer 不可用时按 reviewer-gates.md §strict-reviewer 不可用时的降级 执行，
        harness 模式下只能 BLOCKED，不降级
```

### 4.3 禁 STATE 等做完再更新

```
RED FLAG: 完成 Stage 3 后才回头更新 STATE.json
  症状：STATE.json 的 current_stage 总是落后 1-2 个 Stage
  后果：harness maintain 检测到 STATE 漂移，恢复成本高；Stage 间状态不可信
  正确：每个 Stage 开始时写 current_stage，结束时写 last_commit_sha
```

### 4.4 禁跳 Stage -0.5

```
RED FLAG: 跳过 Stage -0.5（Project Context Retrieval）
  症状：INDEX.md 存在但未跑 Stage -0.5，直接进 Stage 2/3
  后果：knowledge_requirements 为空，reviewer 第 4 硬门无法检查；
        可能违反 knowledge rule 而不被发现
  正确：每轮开始必须跑 Stage -0.5（S 级也不跳过）；
        disable 只通过 CLAUDE.md 的 harness-knowledge: disabled 表达
```

### 4.5 禁 fuzzy 匹配删除 knowledge

```
RED FLAG: 用 text similarity 自动删除 gaps.md / INDEX.md 的条目
  症状：cleanup 逻辑基于字符串相似度决定删除哪些 override / expired rule
  后果：误删相似但不同的条目（大型 repo 中跨 domain 相似表述常见）
  正确：cleanup 只按显式 rule_id / gap_id 精确匹配执行，禁止 fuzzy 删除
```

### 4.6 禁直接改 manifest

```
RED FLAG: reviewer / 主 agent 直接修改 manifest.md
  症状：发现 manifest 过时后直接编辑 manifest rule，不走 scanner
  后果：manifest 失去 evidence-first 约束，rule 无 file:line 支撑；
        下轮 reviewer 依据未验证 rule FAIL 代码
  正确：manifest 更新必须走 scanner（harness scan --rescan / --partial-rescan），
        用户可手动 bump last_verified（仅用于 free_form_review 续期）
```

### 4.7 禁在 autonomous_mode 降级

```
RED FLAG: autonomous_mode 下 strict-reviewer 不可用时自动降级
  症状：自治执行时 strict-reviewer 调用失败，自动改用 qa-prompt 继续
  后果：硬门保护形同虚设，autonomous_mode 的安全假设被破坏
  正确：autonomous_mode 下 strict-reviewer 不可用 → 永远 BLOCKED；
        不降级，不重试替代方案，等待用户介入
```

---

## 5. 快速参考

### 12 项 audit 一览

| # | 检查项 | 类别 | 失败时最严重结果 |
|---|--------|------|------------------|
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
| 11 | INDEX.md 自身 drift（孤儿检测） | Knowledge | FAIL → **BLOCKED** |
| 12 | Knowledge ↔ Memory 反向链接 | Knowledge | FAIL → **BLOCKED** |

### 关键阈值速查

| 参数 | 阈值 | 来源 |
|------|------|------|
| Snapshot freshness warn | 90 天 | Item 7 |
| Snapshot freshness stale | 180 天 | Item 7 |
| Drift 违反率阈值 | > 0.3（30%） | Item 8 |
| Drift 最小样本量 | >= 5 | Item 8 |
| Manifest drifted 阈值 | > 50% rules drifted | Item 8 |
| Free-form rule 默认过期 | 90 天（`expiry_after_days` 默认值） | Item 9 |
| Active case 未引用警告 | > 60 天 | Item 4 |
| STATE SHA 落后 WARN | > 3 commits | Item 1 |

## 6. 与其他 contracts 的关系

| 本契约关注 | 相关 contract |
|-----------|--------------|
| 6 类粗粒度 drift（managed-files 四态 / memory tree 完整性 / frontmatter 合规 / learnings retention / knowledge freshness / schema 哨兵） | [drift.md](drift.md) |
| Stage -0.5 如何产出 knowledge 字段 | [knowledge.md](knowledge.md) |
| memory 三层写入权限 + scorecard 写入格式 | [memory.md](memory.md) |
| Stage 4 reviewer 4 硬门 + strict-reviewer 不可用降级 | [reviewer-gates.md](reviewer-gates.md) |
| 项目技术栈探测（与 Item 6 配合） | [project-detection.md](project-detection.md) |

## 实现位置

- CLI 入口：`packages/harness-cli/src/commands/maintain.ts`
- Schema：`packages/harness-cli/resources/schemas/drift.schema.json`
- 自动修复执行：`packages/harness-cli/src/utils/maintain-recovery.ts`（计划中）
