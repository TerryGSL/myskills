# Judge Agent — 仲裁决策准则

> 本文件展开 SKILL.md 第 3 步（应用决策准则）的细则。judge-agent 按 4 条准则各打 0-10 分，
> 综合评出 verdict。准则与 strict-reviewer 4 硬门对偶，但语义是「哪一方更接近」而非「过 / 不过」。

## 四条准则（按权重排序）

### 1. 一致性（consistency，权重 ×3）

**问题**：方案是否落在 spec / ARCHITECTURE.md / 已有 API 契约的边界内？

| 分数 | 表现 |
|------|------|
| 9-10 | 方案完全遵循 spec §X.Y；引用了 ARCHITECTURE.md 的现有抽象 |
| 6-8  | 方案与 spec 一致，但引入了 spec 未覆盖的小决策（可接受） |
| 3-5  | 方案偏离 spec 某段；或绕过现有抽象自起一套 |
| 0-2  | 方案与 spec 直接矛盾；或破坏 ARCHITECTURE.md 契约 |

判分锚点：`dispute.spec_path` 引用行号 / 段落号。

### 2. 简洁性（simplicity，权重 ×2）

**问题**：方案的 diff 是否最小？是否引入了不必要的抽象 / 依赖 / 配置？

| 分数 | 表现 |
|------|------|
| 9-10 | diff <50 行；无新依赖；复用现有工具 |
| 6-8  | diff 50-200 行；新增 1 个内部抽象 |
| 3-5  | diff 200-500 行；新增 npm 包 / 重大重构 |
| 0-2  | diff >500 行；新增多个抽象层；牵动跨模块改动 |

判分锚点：`parties[i].proposed_diff` 行数 / `package.json` 改动。

### 3. 测试覆盖（coverage，权重 ×2）

**问题**：方案有测试佐证吗？现有测试是否仍通过？

| 分数 | 表现 |
|------|------|
| 9-10 | 新增单测 + 集成测；test_results 全绿 |
| 6-8  | 有单测；test_results 全绿但覆盖率持平 |
| 3-5  | 仅手测 / 仅 type check 通过 |
| 0-2  | 无测试；或 test_results 有失败 |

判分锚点：`dispute.test_results_path` 通过 / 失败计数 + 新增 test 文件数。

### 4. 知识合规（knowledge，权重 ×3）

**问题**：方案是否违反 `docs/harness/knowledge/` manifest 中 active 的规则？

| 分数 | 表现 |
|------|------|
| 9-10 | 显式遵守 ≥1 条 knowledge rule；无违规 |
| 6-8  | 无显式遵守，也无违规 |
| 3-5  | 违反 1 条 medium 规则（如命名约定） |
| 0-2  | 违反 ≥1 条 high/critical 规则（如错误处理 / 安全） |

判分锚点：`dispute.parties[i].summary_path` 中的 knowledge_compliance 字段。
若 caller 未注入 knowledge 信息 → 该项默认 5 分（中性）。

## 综合判分公式

```
score(party) = consistency × 3 + simplicity × 2 + coverage × 2 + knowledge × 3
最高分 = 100
```

### Verdict 决定规则

| 条件 | verdict |
|------|---------|
| `score(A) - score(B) >= 15` | A 胜 |
| `score(B) - score(A) >= 15` | B 胜 |
| `\|score(A) - score(B)\| < 15` 且双方均 ≥60 | `merge`（reasoning 必须给出合并方式）|
| 双方均 <50 | `rollback`（spec / 任务边界本身有问题）|
| consistency 任一方 ≤2（spec 矛盾） | 该方直接淘汰；另一方未必胜出，按上面规则再判 |
| knowledge 任一方 ≤2（高危违规） | 该方直接淘汰 |

## 边界情况

- **多方（≥3）**：按两两对决，但 `verdict` 字段填 `winner_id` 而非 `"A" / "B"`；comparison 矩阵写入 `criteria_scores`。
- **证据不足**：caller 未注入 `summary_path` / `proposed_diff` → 该方对应准则计 0 分；若双方都 0 分 → `rollback`。
- **完全平局**（差值 <5 且都很高）：默认 `merge`；只有 caller 在 `dispute.options.no_merge: true` 时才退回 `rollback`。
