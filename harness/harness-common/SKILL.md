---
name: harness-common
description: harness 体系的**共享基础设施层**。所有 harness-* 子 skill（quick / bugfix / feature / refactor）引用本 skill 来做项目初始化（Phase 1-4 基础设施）、memory 契约管理、项目探测、knowledge retrieval (Stage -0.5)、scanner pipeline、reviewer 集成、--maintain 漂移检查。不独立使用。通过 `见 references/<topic>.md` 引用，不复制内容。
---

# harness-common — 共享基础设施层

## 是什么 / 不是什么

**harness-common 是什么**：harness 体系的共享基础设施层。它封装了所有 harness-* task-type 子 skill 都需要的通用能力：项目一次性初始化（Phase 1-4）、memory 契约定义与验证、技术栈自动探测、`--maintain` 漂移检查入口。子 skill 通过引用本文档的 references/ 来获取规范，**不复制内容**。

**harness-common 不是什么**：
- 不是独立使用的 skill（没有直接触发命令）
- 不是某一任务类型的流程编排（那是 harness-quick / harness-bugfix / harness-feature / harness-refactor 的职责）
- 不是 8-Stage 工作流本身（Stage 编排由各子 skill 定义）
- 不包含与特定任务类型相关的业务逻辑

---

## References 清单

所有子 skill 按需引用以下文档。规范内容只在此处维护，子 skill 通过 `见 references/<topic>.md` 方式引用，**不复制**。

| Reference 文件 | 职责 |
|---------------|------|
| [`references/memory-contract.md`](references/memory-contract.md) | `.harness-memory.yml` 完整 schema、两类记忆分工、HTML Marker 协议、Runtime 查询协议、生命周期管理、Error Case 格式、归档政策 |
| [`references/project-detection.md`](references/project-detection.md) | 技术栈自动探测规则（语言 / 框架 / 测试命令 / 构建命令）、`.harness-context.json` 结构、缓存与失效策略 |
| [`references/phase-init.md`](references/phase-init.md) | 项目一次性初始化四步骤：Phase 1（全局基础设施）/ Phase 2（项目级配置）/ Phase 3（记忆契约初始化）/ Phase 4（验证与提交） |
| [`references/reviewer-integration.md`](references/reviewer-integration.md) | harness-common 与 strict-reviewer 调用协议：`review_target` 完整 schema（含 5 个 knowledge 字段）、Coordinator 职责映射、Verdict 决定规则（含第 4 硬门 Knowledge Compliance Check）、Invocation Protocol 5 步、strict-reviewer 不可用降级约定 |
| [`references/maintenance.md`](references/maintenance.md) | `--maintain` 完整 audit 流程：Memory Audit 6 项（STATE 同步 / WALKTHROUGH / CLAUDE ADR / memory 刷新 / git status / 技术栈漂移）+ Knowledge Audit 6 项（snapshot freshness / drift detection / expired free-form rules / evidence file:line / INDEX drift / knowledge↔memory 反向链接）+ 漂移恢复 7 步 + Red-flag 自检 |

> **扩展点**：未来可按需添加 `references/hooks.md`、`references/knowledge-retrieval.md` 等，保持此清单同步更新。

---

## Phase Init 流程摘要

> 详见 [`references/phase-init.md`](references/phase-init.md)

各子 skill 在 `--init` 或 `--adopt` 模式下均需执行以下四阶段初始化。所有阶段只在**首次接入**或**显式重初始化**时运行，正常轮次不重跑。

### Phase 1 — 全局基础设施

为所有项目共享的一次性配置，包括：
- 安装 3 个必装插件（`claude-mem`、`codex`、`superpowers`）
- 配置 7 个 Hooks（危险命令拦截、secrets 检测、心跳保障等）
- 配置 MCP 服务器（`context7`、`playwright`）

已完成过（`~/.claude/hooks/` 存在）可跳过。

### Phase 2 — 项目级配置

- 运行项目探测器（详见 `references/project-detection.md`），结果写入 `.harness-context.json`
- 创建持久化文件骨架：`CLAUDE.md`、`docs/STATE.json`、`docs/DESIGN.md`、`docs/WALKTHROUGH.md`
- 按项目类型（web-app / api-server / cli-tool / library）生成对应 `DESIGN.md` 内容

### Phase 3 — 项目记忆契约初始化

- 渲染并写入 `docs/memory/.harness-memory.yml`（契约锚点）
- 生成 `docs/memory/` 骨架目录（`MEMORY.md`、`ERRORS.md`、`cases/`、`decisions/`、`constraints/`、`archive/`）
- 初始化 `harness_reviewer_scorecard.yml`
- 验证契约合规性（`forbidden_paths` 非空、无 broad unscoped 模式）

Memory 契约完整规范见 [`references/memory-contract.md`](references/memory-contract.md)。

### Phase 4 — 验证与提交

```bash
ls CLAUDE.md docs/STATE.json docs/DESIGN.md docs/WALKTHROUGH.md docs/memory/.harness-memory.yml
echo ".harness-status.json" >> .gitignore
echo ".harness-context.json" >> .gitignore
git add CLAUDE.md docs/ .gitignore
git commit -m "chore: initialize harness engineering environment"
```

---

## `--maintain` 入口

> 详见 `references/maintenance.md`（待补充）

`--maintain` 模式是周期性健康审计，**不重跑 Phase 1**，聚焦以下四个维度：

| 维度 | 检查内容 |
|------|---------|
| **同步检查** | `STATE.json` vs `git log`、`WALKTHROUGH.md` vs `STATE.json`、`CLAUDE.md` ADR 数量、`.harness-context.json` 技术栈一致性 |
| **Contract audit** | 重新加载 `.harness-memory.yml`，验证 schema_version，检查 `owned_paths` / `forbidden_paths` 合规性 |
| **Memory drift audit** | 磁盘文件 vs contract `owned_paths`、`freshness.last_used` 超期归档、`ERRORS.md` 行数超限冷移 |
| **Suspect 检测** | 对比 `suspect_rules` 与近期 `git log`，命中则将 case `freshness.state` 改为 `suspect` |

不一致项：**先同步文件，再写代码**。

---

## 引用本文档的方式

子 skill 在其 skill.md 中通过如下方式引用共享规范：

```markdown
**项目初始化流程** → 见 [harness-common/references/phase-init.md](../harness-common/references/phase-init.md)
**Memory 契约规范** → 见 [harness-common/references/memory-contract.md](../harness-common/references/memory-contract.md)
**技术栈探测规则** → 见 [harness-common/references/project-detection.md](../harness-common/references/project-detection.md)
```

不复制内容，只交叉引用。规范更新只需在 harness-common 中维护一处。
