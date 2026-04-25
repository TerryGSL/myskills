# Routing — Routing-as-CLI 设计要点

> **Source of truth**: `packages/harness-cli/resources/schemas/route-output.schema.json` + `src/types/constants.ts`。如本文档与代码不一致，以代码为准。

定义 `harness route --json` 单一执行点契约：合并 profile-resolve + fast-path 检测 + aggression 解析 + hard-floor 装载 + knowledge retrieval。**Tier 1+2 主路径**；Tier 3（无 node）走 profile-entry SKILL fallback。

## 调用方式

```bash
harness route --task "<user message>" --flags "<flags>" --json
```

输入：

- `--task`：用户 verbatim 消息（必填）
- `--flags`：用户附加 flag（如 `/yolo` / `/quick` / `/no-push`），逗号分隔
- `--json`：以 JSON 输出（默认；无此 flag 输出 markdown 摘要）

## 输出 Schema（route-output.schema.json）

```json
{
  "leaf_skill": "harness-feature",
  "resolved_profile": "harness",
  "resolved_mode": "standard",
  "task_description": "<user message>",
  "hard_floor": ["auto_push", "force_push"],
  "knowledge_manifest": { /* 8-field knowledgeCheck */ },
  "fast_path_hit": false,
  "context_to_inject": "<markdown text>"
}
```

### 字段语义

| 字段 | 类型 | 含义 |
|------|------|------|
| `leaf_skill` | enum | `harness-quick` / `harness-bugfix` / `harness-feature` / `harness-refactor` |
| `resolved_profile` | string | 命中的 profile.name |
| `resolved_mode` | enum | conservative / standard / aggressive |
| `task_description` | string | user message verbatim（leaf 输入契约必需） |
| `hard_floor` | list | `HARD_FLOOR_FLAGS` 子集 |
| `knowledge_manifest` | object | 8-field knowledgeCheck 状态对象 |
| `fast_path_hit` | bool | fast-path 是否命中 |
| `context_to_inject` | string | **markdown 字符串**，已 render 好的 prompt 段（保留 heading/list/emphasis；不嵌套 JSON） |

`context_to_inject` 包含 Stage -0.5 注入文本（Binding Rules + Advisory Context），由 leaf skill prepend 到 subagent task prompt。

## Tier 分层

| Tier | 路由方式 | profile-entry SKILL 角色 |
|------|---------|-------------------------|
| **Tier 1+2（有 CLI）** | AI 调 `harness route --json` → 拿到 leaf 名 + 准备好的 context → 加载**唯一**那一个 leaf SKILL | **不加载** |
| **Tier 3（无 node）** | AI 按 profile-entry SKILL markdown 手算（产出等价 route object） | 加载（fallback） |

Tier 1+2 的核心收益：

- Context 占用降低 ~30-40%（不加载 profile-entry SKILL）
- 路由完全确定性（不依赖 LLM 推理 path_glob / fast-path / hard-floor）
- 延迟降低（CLI 单调用 vs SKILL 加载 + LLM 推理）
- 统一执行点（profile 探测 / fast-path / aggression / hard-floor / knowledge retrieval 都在 CLI 里）

## 内部决策顺序（CLI 实现）

`harness route` 内部依次执行：

1. **Profile resolve**：
   - 读 `<repo>/.harness-profile` marker（YAML）
   - marker 命中 → 用 marker.profile 加载对应 YAML，跳 step 2
   - marker 缺失 / malformed → 进 step 2
2. **Fallback matcher**：按 profile.detection.priority 降序 + matcher specificity tie-break，选第一个命中的 profile
3. **Mode resolution**：`/safe` → conservative；`/yolo` → aggressive；marker `mode` 字段；profile.default_mode；兜底 standard
4. **Task type 选择**：显式 flag → fast-path 检测 → 关键词 → 兜底 quick（详见 [task-type.md](task-type.md)）
5. **Hard-floor 装载**：复制 profile.hard_floor 到 output（不可在此层增减）
6. **Knowledge retrieval**：跑 Stage -0.5 流程（详见 [knowledge.md](knowledge.md)）
7. **Render context_to_inject**：合并 Binding Rules view + Advisory Context view 为 markdown
8. **输出 JSON**

## 5 个独立路径（contract test 必须覆盖）

`harness/tests/golden/` fixture 至少覆盖以下 5 个独立路径（见 spec Phase C）：

1. `.harness-profile` marker 显式解析（marker 命中 → 跳 fallback matchers）
2. matcher tie-break（同 priority 下用具体度决胜）
3. `/yolo` flag vs 公司 hard_floor 冲突（hard_floor 必须胜，不可静默降级）
4. bugfix 路由（task_description 含"修 X bug"等触发词 → leaf_skill = harness-bugfix）
5. refactor 路由（task_description 含"重构"或 `/refactor` flag → leaf_skill = harness-refactor）

## Tier 3 Fallback 契约

无 node 环境下，AI 按 `profile-entry/SKILL.md` 描述手算等价 route object：

- 读 `~/.claude/profiles/*.yml` + `<repo>/.harness-profiles/*.yml`
- 应用同样的决策顺序（marker → matcher → mode → task_type → hard_floor → knowledge）
- 输出与 CLI 等价的 7 字段 JSON（`context_to_inject` 由 AI 自己 render）

**Canonical fallback 文件**：`profile-entry/SKILL.md`（顶层薄壳契约结构 ~108 行）。

## 与 leaf skill 的接口

leaf skill 的输入契约固定：

```yaml
task_type: <enum>            # leaf_skill 字段去掉 "harness-" 前缀
task_description: <verbatim>
resolved_mode: <enum>
fast_path_hit: <bool>
hard_floor: <list>
knowledge_manifest: <8-field object>
context_to_inject: <markdown>
```

leaf skill 启动时把 `context_to_inject` prepend 到第一个 subagent 的 task prompt。

## 失败处理

| 场景 | 动作 |
|------|------|
| 没找到任何匹配 profile（连 default 都不可读） | `verdict: BLOCKED`，原因 `no_profile_loadable` |
| `harness route` 命令缺失（无 CLI） | AI 走 Tier 3 fallback；CLI 输出 stderr 提示装 npm |
| Knowledge retrieval BLOCKED（如 schema-too-new） | route 输出包含 BLOCKED 标记；leaf skill 不应启动 |
| `context_to_inject` render 失败 | route 输出空 string 但其它字段保留；leaf skill 自行 fallback |

## 字段合法性

| 字段 | 必填 | 默认 |
|------|-----|------|
| `leaf_skill` | 是 | — |
| `resolved_profile` | 是 | — |
| `resolved_mode` | 是 | `standard` |
| `task_description` | 是 | — |
| `hard_floor` | 是 | `[]` |
| `knowledge_manifest` | 是 | `effective_index_status: disabled` 等价空对象 |
| `fast_path_hit` | 是 | `false` |
| `context_to_inject` | 是 | `""`（空字符串） |

## 实现位置

- Schema：`packages/harness-cli/resources/schemas/route-output.schema.json`
- Command：`packages/harness-cli/src/commands/route.ts`（计划中，PR C）
- Tier 3 fallback：`profile-entry/SKILL.md`（顶层）
- 各依赖契约：
  - profile resolve → [profile.md](profile.md)
  - task type → [task-type.md](task-type.md)
  - aggression mode → [aggression-mode.md](aggression-mode.md)
  - hard floor → [hard-floor-enforcement.md](hard-floor-enforcement.md)
  - knowledge retrieval → [knowledge.md](knowledge.md)
