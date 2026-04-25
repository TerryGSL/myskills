# Harness 统一工作流设计

> 一套核心工作流（规则 / 流程 / 契约统一），多种使用方式（直接用 markdown / 使用 CLI），跨工具兼容（Claude Code / Codex / Cursor / Aider / Copilot）。

## 核心定位

仓库当前 `harness/` 子目录与顶层 + `packages/harness-cli/` 是**同一套规则的两种 packaging**：

- **直接用法（markdown-only）** = 把规则展开写在 SKILL.md 里，AI 读 SKILL 直接执行；无 node 依赖
- **CLI 用法** = 把规则编译成 CLI 命令（`harness <cmd>`），AI 调 CLI 拿结论；有 jest 测试 + GitHub workflow CI 守门

底层规则只有一份。两种用法的输出在 contract test 守门下必须等价。

## 4 层架构

```
┌─────────────────────────────────────────────────────────┐
│ Layer 0: Machine Contracts（机器契约 — 程序化、可验证）  │
│ - packages/harness-cli/src/types/constants.ts           │
│ - packages/harness-cli/resources/schemas/*.json (12 个) │
│ - .harness-profile marker schema（YAML，统一）          │
│ - knowledgeCheck 8-field state object schema            │
│ - golden fixtures: 20 个起步（5 大类 15 + routing 5）    │
│ - regen-schema.ts + schema-drift CI                      │
└────────────────────────────┬────────────────────────────┘
                             │ 派生 / 引用
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Narrative Contracts（叙述契约 — 给 AI 读的）    │
│ harness-common/contracts/*.md                            │
│ - profile.md / task-type.md / aggression-mode.md /      │
│   push-decision.md / knowledge.md / memory.md /          │
│   autonomy.md / reviewer-gates.md / drift.md /           │
│   phase-init.md / hooks.md / hard-floor-enforcement.md / │
│   doctor-protocol.md / routing.md                        │
│ - 顶部 source-of-truth header → constants.ts 或对应 schema│
│ - 不能引用 Claude Code 专属概念（claude-mem / Skill 工具）│
└────────────────────────────┬────────────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        ▼                                         ▼
┌─────────────────────┐                 ┌─────────────────────┐
│ Layer 2A: Direct    │                 │ Layer 2B: CLI       │
│ markdown runtime    │                 │ runtime             │
│                     │                 │                     │
│ SKILL.md 详尽展开    │                 │ SKILL.md 薄壳，     │
│ + bash setup-harness│                 │ 调 harness CLI      │
│                     │                 │                     │
│ AI 读 SKILL → 引用   │                 │ AI 读 SKILL → 调 CLI│
│ Layer 1 contracts   │                 │ → CLI 内部读 Layer 0│
│ 推理执行            │                 │ /1 后程序化输出     │
│                     │                 │                     │
│ 无 node 也能跑      │                 │ Contract test 守门  │
│ (Tier 3 fallback)   │                 │ (jest 20 fixture起) │
└─────────────────────┘                 └─────────────────────┘
        │                                         │
        └─────────────────┬───────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Tool Wrappers（每工具 compact duplicated kernel）│
│                                                          │
│ 每个 wrapper 含完整核心 kernel（7 条规则）：             │
│ 1. profile resolution order (marker → matchers, file_exists 包含)│
│ 2. task routing (quick/bugfix/feature/refactor)         │
│ 3. hard-floor precedence (profile > invocation flags)   │
│ 4. CLI-first rule + markdown fallback                   │
│ 5. Stage -0.5 retrieval rule                            │
│ 6. Refusal rule (hard-floor 不可静默降级)               │
│ 7. Routing handoff rule (wrapper 只能消费 route object， │
│    不可自行重新 parse user message)                      │
│                                                          │
│ Tier-1: Claude Code (SKILL.md) + Codex (AGENTS.md)      │
│ Tier-2: Cursor (.cursor/rules/) + Aider (CONVENTIONS.md)│
│         + Copilot (.github/copilot-instructions.md)     │
└─────────────────────────────────────────────────────────┘
```

## 14 能力清单

| # | 能力 | Layer 0 schema | Layer 1 narrative | 直接用法 | CLI 用法 |
|---|------|----------------|-------------------|---------|---------|
| 1 | Profile 探测（含 marker yaml + matcher 三类含 file_exists） | profile.schema.json | profile.md | profile-entry SKILL Step 0-1 + bash | `harness profile-resolve --json` |
| 2 | Profile 派生（含 .harness-profile yaml 写入契约） | marker.schema.json | profile.md §bootstrap | profile-bootstrap SKILL + lib/derive.sh | `harness profile-bootstrap` |
| 3 | Fast-path 路由 | task-type.schema.json | task-type.md §fast-path | profile-entry SKILL Step 2 | `harness route --json`（Tier 1+2 主路径）/ profile-entry SKILL Step 2（Tier 3 fallback） |
| 4 | Push 决策 | push-decision.schema.json | push-decision.md | leaf SKILL 引用 | `harness push-check --json` |
| 5 | Knowledge scanner（含 5-domain manifest schema） | knowledge.schema.json | knowledge.md §scan | profile-scanner SKILL + bash | `harness scan --json` |
| 6 | Knowledge retrieval（**含 8-field knowledgeCheck 状态对象**） | knowledgeCheck.schema.json | knowledge.md §retrieval | harness-feature SKILL Stage -0.5 | `harness route --json` 产出 knowledge_manifest（Tier 1+2 主路径）/ profile-entry 加载 leaf 前调（Tier 3 fallback） |
| 7 | Memory contract（项目级文件 + 三层权限矩阵） | memory.schema.json | memory.md | harness-common SKILL 引用 | `harness memory check --json` |
| 8 | Drift detection（6 类） | drift.schema.json | drift.md | maintenance.md | `harness maintain --json` |
| 9 | Autonomy 决策（一般决策） | — | autonomy.md | leaf SKILL 引用 | AI 直接读 |
| 10 | **Hard-floor enforcement（6 flags 强制执法）** | hard-floor.schema.json | hard-floor-enforcement.md | leaf SKILL 引用 | profile-entry/CLI 强制 |
| 11 | Strict reviewer 4 硬门 | reviewer-gates.schema.json | reviewer-gates.md | strict-reviewer SKILL（共享） | strict-reviewer SKILL（共享） |
| 12 | Phase 1-4 init（**含 install / doctor handshake**） | doctor-protocol.schema.json | phase-init.md + doctor-protocol.md | bash setup-harness.sh | `harness install --doctor` + `harness init` |
| 13 | Stop Hook 自适应阈值 | — | hooks.md | hooks/context-monitor.sh（共享） | hooks/context-monitor.sh（共享） |
| 14 | **Routing as CLI**（统一执行点，避免重复加载 profile-entry SKILL） | route-output.schema.json | routing.md | profile-entry SKILL（Tier 3 fallback） | `harness route --json`（Tier 1+2 主路径） |

第 14 项与 #1-3 的关系：#14 不是替换 #1-3（profile 探测 / 派生 / fast-path），而是**把它们的运行时整合**为单一 CLI 入口（`harness route --json`）。它们的概念契约（schema / narrative）保持不变；只是执行点统一。

## 关键约束

### C1：Single Source of Truth
- **Layer 0 是机器契约的唯一源**（不只是 enum，含 schema / state object / fixture）
- Layer 1 markdown 是叙述化的 Layer 0（顶部 source-of-truth header → constants.ts 或对应 schema）
- 直接用法 SKILL 和 CLI 用法都不能"自己再写一份规则"
- 实现层（直接用法 SKILL / CLI 用法）必须可以**独立**复现 Layer 0/1 的输出

### C2：Contract Test 守门
- Layer 0 的 golden fixtures：**起步 20 个**（原五大类 profile resolution / hard-floor enforcement / push risk / knowledge retrieval filtering / marker parsing 各 3 个 = 15，另加 routing 5 个）
- jest 跑 fixture vs CLI 输出 vs markdown 手算（参考实现）三方一致
- 不一致 → CI fail
- **拓展时**：补充 fixture 直到关键路径 100% 覆盖

### C3：跨工具 portability
- Layer 1 文档**不能引用** Claude Code / Codex / Cursor / Aider / Copilot 任一工具专属概念
- 工具专属逻辑（claude-mem / codex resume / cursor history）只能在 **Layer 3 wrapper** 里
- "持久 memory" 的契约是：**项目级 = `docs/memory/*.md` 必需**（Layer 1 强约束）；**跨会话 = 工具自带能力**（每个 wrapper 自己处理）
- claude-mem 反转依赖：从"required infrastructure"降级为"optional acceleration layer for recall and search"

### C4：能力对等
- 14 能力 × 直接用法 / CLI 用法两套 = 28 个 cell，**每个 cell 都必须有实现或明确等价 mapping**
- 矩阵的 gap 在 Phase B/C 必须 close
- CLI 用法现状缺：#1（profile-resolve CLI 拆分） + #3（fast-path CLI 整合到 route）+ #5 #6（Knowledge Scanner / retrieval depth）+ #7（memory CLI wrap）+ #10 hard-floor 显式契约文档 + #14（Routing-as-CLI 整合执行点）

### C5：降级路径
- 每个能力都有 markdown-only fallback
- CLI 不可用 → AI 按 Layer 1 markdown 手算
- 已有先例：push-decision Tier 3 + setup-harness wrapper

### C6：Drift 优先修
**在加新结构前**，必须先修当前已知的不一致：
- hard-floor flags：constants.ts 写 6 个（auto_push / force_push / destructive_ops / auto_merge / rewrite_history / network_install）；profile-bootstrap.ts / SKILL / install.ts / setup-harness.sh / harness-pack-test 还在用 4 个 → 全部对齐到 6 个
- `.harness-profile` marker：profile.ts 解析 YAML，profile-bootstrap.ts 写 YAML；setup-harness.sh / profile-bootstrap SKILL 描述成裸 string → 全部对齐到 YAML 格式
- 不修 drift 直接搞融合 = "把现有混乱冻结进新架构"

## Routing-as-CLI 设计要点

### 调用方式

```bash
harness route --task "<user message>" --flags "<flags>" --json
# 输出（JSON）：
{
  "leaf_skill": "harness-feature",
  "resolved_profile": "harness",
  "resolved_mode": "standard",
  "task_description": "<user message>",
  "hard_floor": ["auto_push", "force_push"],
  "knowledge_manifest": {},
  "fast_path_hit": false,
  "context_to_inject": "<markdown text>"
}
```

### Tier 分层

| Tier | 路由方式 | profile-entry SKILL 角色 |
|------|---------|-------------------------|
| Tier 1+2（有 CLI） | AI 调 `harness route --json` → 拿到 leaf 名 + 准备好的 context → 加载**唯一**那一个 leaf SKILL | **不加载**（CLI 替代） |
| Tier 3（无 node） | AI 按 profile-entry SKILL markdown 手算（产出等价 route object） | 加载（fallback） |

### route-output.schema.json 字段

- leaf_skill: enum（harness-quick / harness-bugfix / harness-feature / harness-refactor）
- task_description: string（user message verbatim，leaf SKILL 输入契约必需）
- resolved_mode: enum（conservative / standard / aggressive；命名与 leaf SKILL 输入契约一致）
- resolved_profile: string
- hard_floor: HARD_FLOOR_FLAGS 子集
- knowledge_manifest: object（含 8-field knowledgeCheck 状态对象）
- fast_path_hit: boolean
- context_to_inject: **markdown string**（已 render 好的 prompt 段，markdown 格式保留 heading/list/emphasis；不嵌套 JSON）

### Canonical fallback 文件

`profile-entry/SKILL.md`（顶层版本，rename 自 skill.md 后；薄壳契约结构 ~108 行）。`harness/profile-entry/SKILL.md`（226 行）改为同步 alias / 部分内容迁入 Layer 1 contracts；不再独立维护。

## 实施分阶段

### Phase A1：Drift Cleanup（必须最先做）
**目标**：把现状的 enum / marker 不一致全部对齐
- hard-floor flags 4 → 6 同步到所有 5 处（profile-bootstrap.ts / setup-harness.sh / harness-pack-test / profile-bootstrap SKILL / install.ts hardFloor list）
- `.harness-profile` marker 格式统一为 YAML（profile-bootstrap SKILL 改用 YAML 描述；setup-harness.sh fallback 也写 YAML）
- 顺便修 skill.md → SKILL.md 命名（顶层 8 个文件）

### Phase A2：Conformance Fixtures + Schema Sync（必须先于 B/C）
- 在 packages/harness-cli/tests/fixtures/golden/ 写 20 个 fixture（5 大类各 3 个 = 15 + routing 5 个）
- 跑两套实现，记录三方输出（markdown 手算 / CLI / fixture expected）。**Oracle 规则**：A 套 markdown 手算结果只用于起草 fixture；定稿后以 Layer 0 schema + fixture 为最终 machine truth，两套都必须 conform 到 Layer 0
- 任何输出不一致就在 fixture 标注；这些就是 Phase B/C 要 close 的 parity gap
- 新增 Layer 0 schemas：marker.schema.json / task-type.schema.json / knowledge.schema.json / knowledgeCheck.schema.json / hard-floor.schema.json / memory.schema.json / drift.schema.json / reviewer-gates.schema.json / doctor-protocol.schema.json / route-output.schema.json（**10 个新 schema**；含现有 profile.schema.json + push-decision.schema.json = **12 个**）
- regen-schema.ts 扩展为生成全部 12 个

### Phase B：直接用法 SKILL 薄化 + Layer 1 contracts 提取（A1/A2 完成后可与 C 并行）
- harness-common/references/ → harness-common/contracts/（rename + 重整）
- 各 leaf SKILL 把内嵌规则迁到 contracts/，SKILL 内只留"流程顺序 + 调用清单 + 紧凑 operational summary"
- 直接用法 SKILL 行数预估：feature 404 → 150；refactor 368 → 130；bugfix 270 → 100；quick 153 → 80
- **不做"裸链"**——保留每个 SKILL 的执行顺序 + guardrail 描述

### Phase C：CLI 用法 parity 补全（A1/A2 完成后可与 B 并行）
- **不是 from zero**，而是在现有 init/adopt/maintain/doctor/scan 基础上 close gap
- 补 `harness scan --json`（Knowledge Scanner 完整实现，含 5-domain manifest）
- 补 Stage -0.5 retrieval（profile-entry 加载 leaf 前调，含 8-field knowledgeCheck 状态对象）
- 补 `harness memory check --json`
- 补 `harness profile-resolve --json`（命令拆分，目前 profile-entry SKILL 隐含逻辑）
- 补 `harness route` 命令（合并 profile-resolve + fast-path 检测 + aggression 解析 + hard-floor 装载 + knowledge retrieval 调用）
- profile-entry SKILL 改造为 thin Tier-3 fallback（不再是 Tier 1+2 主路径）
  - **Canonical fallback 文件**：`profile-entry/SKILL.md`（顶层版本，rename 自 skill.md 后；已是薄壳契约结构 108 行）
  - 历史版本 `harness/profile-entry/SKILL.md`（226 行）改为同步 alias / 部分内容迁入 Layer 1 contracts；不再独立维护
- 补 `#10 hard-floor enforcement` 显式契约文档（contracts/hard-floor-enforcement.md）+ CLI 强制执法点（profile-entry / push-check / 加载 leaf 前 6 个 flag 全检查）
- 跑 fixture：CLI route 输出 vs A 套 markdown 手算的等价（5 fixture 起步，**必须覆盖以下 5 个独立路径**）：
  1. `.harness-profile` marker 显式解析（marker 命中 → 跳 fallback matchers）
  2. matcher tie-break（同 priority 下用具体度决胜，参 profile.md）
  3. `/yolo` flag vs 公司 hard_floor 冲突（hard_floor 必须胜，不可静默降级）
  4. bugfix 路由（task_description 含"修 X bug"等触发词 → leaf_skill = harness-bugfix）
  5. refactor 路由（task_description 含"重构"或 `/refactor` flag → leaf_skill = harness-refactor）

### Phase D：跨工具 Wrapper Kernel（A2 完成后启动）
- 写 AGENTS.md（Tier-1，业界事实标准 Codex 等读）—— compact kernel 含 7 条核心规则
- 写 SKILL.md kernel section（Claude Code 入口同步 kernel）
- 写 .cursor/rules/harness.md（Tier-2 smoke test）
- 写 CONVENTIONS.md + .aider.conf.yml（Tier-2 smoke test）
- 写 .github/copilot-instructions.md（Tier-2 smoke test）
- **每个 wrapper 都是 duplicated kernel**，不是 one-line pointer
- 工具集成 smoke test：每个 Tier-1/Tier-2 工具跑一遍接入

### Phase E：Cleanup
- claude-mem 反转：harness-init / harness-feature 等 SKILL 改 claude-mem 引用为"optional"
- `docs/memory/*` 升为 required（Layer 1 强约束）
- 删除直接用法 / CLI 用法各自的重复规则文档
- 顶层 README 反映新架构
- harness/README.md 改"直接用法"（不是"独立实现"，因为现在都基于同一份 contracts）

## Routing-as-CLI 收益

- **Context 占用降低 ~30-40%**（不再加载 profile-entry SKILL）
- **路由完全确定性**（不依赖 LLM 推理 path_glob / fast-path / hard-floor）
- **延迟降低**（CLI 单调用 vs SKILL 加载 + LLM 推理）
- **统一执行点**（profile 探测 / fast-path / aggression / hard-floor / knowledge retrieval 都在 CLI 里，不分散到 SKILL markdown）

## 严格约束总结

每个 PR 必须 atomic + 含 rollback 步骤；跨 PR 不允许并行；PR 内不同文件可并行。
contract test 是新增能力的强制守门——不通过 jest 全部 fixture，PR 不允许合。
