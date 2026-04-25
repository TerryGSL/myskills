# Task Type — quick / bugfix / feature / refactor 契约 + Fast-path 路由

> **Source of truth**: `packages/harness-cli/src/types/constants.ts` + `resources/schemas/task-type.schema.json`。如本文档与代码不一致，以代码为准。

四种 task type 是 leaf skill 的离散维度。每个 round 必有 exactly one task type，由 routing 决定。

## 4 种 task type

| Task type | 适用场景 | 典型 Stage 路径 | 文件改动量 |
|-----------|---------|---------------|----------|
| `quick` | trivial 编辑、文档、配置、单文件 < 10 行 | 2 → 3 → 5 → 8 | 1-3 文件 |
| `bugfix` | 已知 bug 复现 + 定位 + 修复 + 回归测试 | investigate → 3 → 5 → 6 → 8 | 1-5 文件 |
| `feature` | 新功能 / M/L/XL 级 / 涉及新模块 | 0 → 1 → 2 → 3 → 4 → 5 → 6 → (7) → 8 | 4+ 文件 |
| `refactor` | 跨模块重构、行为不变、需要 baseline 对比 | 1 → 2 → 3 → 5 → 6 → 8 | 任意 |

各 stage 详细语义见 [phase-init.md](phase-init.md) 和各 leaf skill 的 SKILL.md。

## 选择契约

每条用户消息必须 **routing 出 exactly one** task type。决策顺序：

1. 显式 flag（`/quick` / `/bugfix` / `/feature` / `/refactor`）→ 直接锁定
2. fast-path 命中 → 见下文
3. 关键词触发：
   - "修 X bug" / "fix bug" / "找一下错" → bugfix
   - "重构" / "refactor" / "重新组织" → refactor
   - "加功能" / "实现" / "新增" → feature
4. 兜底 → quick（保守起步，不命中其它三类的小改动）

## Fast-path 路由

fast-path 是结构化跳过路径，目标：trivial 改动直接进 quick，不做无意义的 stage 0/1/2 仪式。

### 触发条件（全满足才进 fast-path = quick）

| 条件 | 检测 |
|------|------|
| 单文件 | `git diff --name-only HEAD` 仅 1 文件 |
| 改动行数小 | diff `+` 行 < 10 |
| 不碰公共导出 | 不改 `index.ts` / `__init__.py` / `lib.rs` 等模块入口 |
| 不碰 schema | 不改 `*.schema.json` / `migrations/` / `schema.sql` |
| 不碰依赖 | 不改 `package.json` / `pyproject.toml` / `Cargo.toml` 等 dependencies 段 |
| 不碰 CI/构建 | 不改 `.github/workflows/` / `Dockerfile` / `Makefile` |

### 命中 → leaf_skill = harness-quick

**任一不满足 → 不命中 fast-path**，回退到关键词 + 兜底逻辑。

## task-type.schema.json 字段

```json
{
  "task_type": "quick" | "bugfix" | "feature" | "refactor",
  "fast_path_hit": true | false,
  "trigger_source": "explicit_flag" | "fast_path" | "keyword" | "default"
}
```

`trigger_source` 给 audit 用，不影响 leaf 行为。

## 与 leaf skill 的输入契约

每个 leaf skill 启动前必须收到：

```yaml
task_type: <enum>            # 锁定本轮
task_description: <verbatim user message>
resolved_mode: <conservative|standard|aggressive>
fast_path_hit: <bool>
hard_floor: <list of HARD_FLOOR_FLAGS>
```

leaf skill **不允许在执行中改 task_type**；如发现需要改（譬如 quick 启动后发现 diff > 10 行）→ 升级路径：

1. quick → bugfix/feature/refactor：BLOCKED，要求用户重新触发
2. bugfix → feature：可在 investigate 阶段升级（修 bug 顺带做改造），需用户确认
3. feature ↔ refactor：BLOCKED，必须重新触发

## 写入权限

| 字段 | 写入者 |
|------|-------|
| `task_type` | routing layer（CLI 或 profile-entry SKILL）|
| `fast_path_hit` | routing layer |
| 历史记录 | leaf skill Stage 8 写入 round summary |

## 实现位置

- Constants：`packages/harness-cli/src/types/constants.ts` `TASK_TYPES`
- Schema：`packages/harness-cli/resources/schemas/task-type.schema.json`
- Fast-path 实现：`packages/harness-cli/src/commands/route.ts`（计划中）
- Routing 整体：见 [routing.md](routing.md)
