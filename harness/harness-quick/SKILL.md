---
name: harness-quick
description: harness 体系的**快速路径 sub-skill**。用于 1 文件/< 10 行改动/无新文件/不触碰函数签名或类型定义的琐碎修改（typo 修正、注释完善、配置值调整等）。由 profile-entry 的结构性 fast-path 自动路由而来，或用户用 /quick flag 显式触发。不走 8-Stage 重流程，跳过 Stage -0.5 knowledge gate，跳过 strict-reviewer 4 硬门（由 fast-path allowlist 保证风险低）。仅做：直接改 → 测试命中 → commit → 写轻量 memory observation。
---

# harness-quick — 快速路径 sub-skill

> **通常由 profile-entry 调用**（profile-entry 解析结构性 fast-path 后派发到此处）。
> 直调支持，但跳过 profile 初始化检查和 fast-path 边界校验——直调时由调用者自行保证场景合规。

---

## 1. 何时触发

有两种进入路径：

**路径 A（自动路由）**：`profile-entry` 跑结构性 fast-path 检查，所有条件同时满足时沉默路由到本 skill：

```
if 用户消息无任务类型 flag
   AND git diff --stat 仅 1 文件改动
   AND diff 大小 < 10 行
   AND 无新文件创建
   AND 目标文件命中 fast-path allowlist
then → harness-quick
```

fast-path allowlist 细节见 `../profile-entry/references/fast-path.md`。典型命中场景：

- 扩展名 `.md` / `.txt` / `.json` / `.yml` / `.yaml` 的文档或配置修改
- 源码文件内的 typo 修正、注释完善、常量值调整（不触碰 exported 符号 / 函数签名 / 类型定义）

**路径 B（显式触发）**：用户消息含 `/quick` flag，profile-entry 直接派发到本 skill，跳过 fast-path 检查。显式触发时调用者自行保证任务规模在边界内。

---

## 2. 执行流程（4 步）

本 skill 不走 8-Stage 流水线，仅执行以下 4 步：

### Step 1：读现状

```bash
# 确认当前改动范围（快速校验任务仍在 quick 边界内）
git diff --stat HEAD
git diff -U3 HEAD
```

检查改动是否仍满足 fast-path 条件（≤1 文件，<10 行，无新文件）。若不满足，立即执行 **升级协议**（见第 5 节）。

### Step 2：改

直接在目标文件完成修改。**不**创建 PRD、**不**产出架构文档、**不**写 plan doc。

### Step 3：跑测试 / lint（若 < 30 秒可完成）

```bash
# 按项目实际命令执行，任一适用即可
# 若测试套件过慢（>30s），仅跑 lint；两者都慢则跳过并在 commit message 说明
<project-test-command> --filter <changed-file>
<project-lint-command> <changed-file>
```

测试或 lint 失败：修复后重新执行本步骤，不升级为 feature 路径（仍属 quick 范围内）。

### Step 4：commit

```bash
git add <changed-file>
git commit -m "fix: <具体描述改动内容，一行>"
# 示例：
# git commit -m "fix: typo in SKILL.md description field"
# git commit -m "chore: update timeout value in config.yml (30s -> 60s)"
```

commit 完成后，写一条轻量 memory observation（见第 4 节）。

---

## 3. 明确跳过的 Stage

harness-quick **不执行**以下流程，这是设计决定，不是遗漏：

| 跳过项 | 原因 |
|--------|------|
| Stage -0.5 knowledge gate | fast-path allowlist 已排除高风险改动；1 行 typo 不需要项目 knowledge 注入 |
| strict-reviewer 4 硬门 | allowlist 保证风险低；过度 review 违背 quick 路径的存在意义 |
| Stage 0 PD / Stage 1 架构 | 无 PRD，无设计决策点 |
| Stage 2 规划 / Stage 3 实现（harness 流程） | 直接改，不走计划-审批循环 |
| Stage 4-7 质量 / QA / 安全 / spec review | 场景明确低风险；测试 / lint 覆盖足够 |
| harness-common Phase init | 不适用（quick 场景不涉及项目初始化） |

如需跑完整流程，请使用 `harness-feature`。

---

## 4. 写 memory observation（轻量）

commit 完成后，用 `claude-mem` plugin 写一条轻量 observation，仅记录变更内容：

```
claude-mem observation:
  type: quick-fix
  file: <changed-file>
  summary: <一句话描述改了什么>
  commit: <commit-sha>
```

**不**写 Error Case 文件（需满足 `errors_collection.min_criteria` 的 bug 才写 case）。
**不**更新 `docs/memory/MEMORY.md` 或 `docs/memory/ERRORS.md`（轻量路径不污染项目级沉淀）。

memory 契约完整规范见 [harness-common/references/memory-contract.md](../harness-common/references/memory-contract.md)。

---

## 5. 硬约束：超出边界时的升级协议

在 Step 1 或执行过程中，若发现实际改动超出 fast-path 边界，**立即停止，升级到 `harness-feature`**，不自行继续：

触发升级的条件（任一命中即升级）：

- 实际改动超过 10 行
- 需要新增文件
- 改动触碰 exported 函数签名、公开类型定义、接口声明
- 改动触碰 SQL schema / migration 文件
- 改动触碰 `package.json` / `go.mod` / `pyproject.toml` / `Cargo.toml` 的依赖段

升级时输出：

```
harness-quick: 改动超出 fast-path 边界
  触发条件: <具体原因，例如"diff 达到 14 行 / 函数签名变更">
  升级到: harness-feature
  当前暂存状态: <已改动文件列表>
```

然后调用 `harness-feature`，把当前任务描述和已有上下文带过去。

---

## 6. 交叉引用

本 skill 是轻量路径，共享基础设施引用如下（按需查阅，quick 路径通常不触达）：

- **Memory 契约** → [harness-common/references/memory-contract.md](../harness-common/references/memory-contract.md)
- **项目探测规则** → [harness-common/references/project-detection.md](../harness-common/references/project-detection.md)
- **fast-path allowlist 细节** → [profile-entry/references/fast-path.md](../profile-entry/references/fast-path.md)
- **任务类型契约** → [profile-entry/references/task-type-contract.md](../profile-entry/references/task-type-contract.md)
