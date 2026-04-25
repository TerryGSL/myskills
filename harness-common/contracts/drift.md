# Drift Detection — `harness maintain` 检查清单

> **Source of truth**: `packages/harness-cli/src/types/constants.ts`（或对应 `drift.schema.json`）。如本文档与代码不一致，以代码为准。

What `harness maintain` checks and how leaf skills hook into it.

## 6 类 drift 检查

### 1. Managed-files vs bundled（四态比对）

对 `.harness/managed-files.json` 里每条记录：

```
bundled_hash = sha256(resources/<template-path>)
target_hash  = sha256(<project_root>/<record.path>)
```

四态（见 `packages/harness-cli/src/utils/managed-files.ts` `compareState`）：

| target vs source | bundled vs source | 状态 | 建议 |
|------------------|-------------------|------|------|
| 相等 | 相等 | `unchanged` | 跳过 |
| 相等 | 不等 | `update-available` | 跑 `maintain --upgrade` |
| 不等 | 相等 | `user-modified` | 跳过（用户 own） |
| 不等 | 不等 | `conflict` | `.rej` (personal) / BLOCK (company-mt) |
| source 缺失 | — | `missing` | 跑 `adopt` 补 |

### 2. `docs/memory/` tree 完整性

检查：
- `docs/memory/.harness-memory.yml` 存在且 YAML parse OK
- 四子目录 `{cases,decisions,constraints,archive}/` 存在
- `MEMORY.md` / `ERRORS.md` / `harness_reviewer_scorecard.yml` 存在

任一缺 → warn `memory-tree-incomplete` + 建议 `harness adopt`。

### 3. `docs/memory/{cases,decisions,constraints}/` frontmatter 合规

扫描每文件，YAML parse + schema 校验：
- 缺 required 字段 → warn
- 字段值不在 enum → error
- `superseded_by` 指向不存在的 id → warn

### 4. Learnings retention + promotion

见 [memory.md](memory.md) 的 "Retention 规则" 章节。

`harness maintain` 输出：
- 可压缩的 learnings 条目计数
- "可升格 learnings 待人工分类" 清单（不自动升格）

### 5. Knowledge 扫描新鲜度（Spec 1）

读 `docs/harness/knowledge/INDEX.md`：
- `last_full_scan > 90 天` → warn "建议跑 `harness scan`"
- `last_full_scan > 180 天` → warn + `INDEX.status: stale`
- `active_domains` 每一个都要在目录里存在对应 manifest.md → 缺 = error

### 6. Schema 版本哨兵（AD4 bidirectional）

见 [doctor-protocol.md](doctor-protocol.md) 的 "Schema 版本双向哨兵" 章节。

## 叶子 skill 对接

叶子 skill（`harness-feature` / `harness-bugfix` 等）在以下时点调用 `harness doctor`：

- **Round 开始前**：确保项目健康（memory 树 + managed-files + schema 版本都 OK）
- **Round 结束后（Stage 8）**：确认本轮没引入新 drift
- **`--maintain` 模式**：专门跑漂移报告 + promotion 提醒

调用方式：

```
1. 探测 CLI 可用性 + 版本握手（见 doctor-protocol.md）
2. 读 exitCode
   - 0 → 继续
   - 1 → 把 issues[] 呈现给用户但继续
   - 2 → 硬 abort，不继续
3. 特别情况：
   - managed_files_git_status == "tracked" → 立即提示 git rm --cached
   - schema-too-new → 立即硬 abort，提示升级 CLI
```

## `--upgrade` 模式

```
harness maintain --upgrade
```

会按照新 bundled 把 target 对照四态重新处理（见 §1）：
- unchanged：跳过
- update-available：写入新版
- user-modified：保留用户版
- conflict：按 profile 决定 `.rej` 还是 BLOCK

**不自动触发** —— 用户必须显式跑 `--upgrade`（AD2）。
