---
name: company-quick
description: >
  company-mt overlay of harness-quick. Java 企业仓库下的快速路径更严：
  禁止 pom.xml / SQL migration / Mapper.xml / 权限代码 / 审批流节点 / i18n 文本改动，
  即使 diff 很小。由 profile-entry 在 company-mt profile + fast-path 同时命中时路由到此。
  触发命令：（无公开触发词）
---

# company-quick — Java 企业快速路径 overlay

> 基于 `harness-quick`，叠加 Java 企业约束。违禁类改动 → 退回 company-feature。

## 差异点（相对 harness-quick）

在 harness-quick 的 5 步（读 manifest → edit → scoped test → commit → learnings）基础上：

1. **额外 gate**：Step 1 后 + Step 2 前，检查是否触碰 Java 企业保护路径
2. **违禁 → 退回**：不尝试 quick，立即回 profile-entry 走 company-feature

## 保护路径清单（完整详见引用）

**绝对禁止 quick**（即使 diff 1 行）：

- 依赖 / 构建：`pom.xml` / `build.gradle*` / `mvnw*`
- Schema：`migration/*.sql` / `Mapper.xml` 结构 / `entity/*.java` 字段
- 权限：`**/Permission*.java` / `**/Auth*.java` / `**/Security*.java` / Filter / Interceptor
- 审批流：`**/ApprovalFlow*.java` / `**/bpm/*.java` / `bpm_flow_node` SQL
- i18n：`messages_*.properties` / 含中文字面量 `"[一-龥]+"` 的源文件 diff
- API 边界：Controller `@*Mapping` 方法签名变化 / RPC 接口

**完整清单（Category 1）** → [../../references/java-gates.md](../../references/java-gates.md)

## 退回处理

检测到违禁路径 → 立即：

1. echo "company-mt quick 路径不适用：<具体路径/原因>，退回 company-feature"
2. 不 commit、不 write learnings（未完成不记账）
3. return control to profile-entry with hint `task-type: feature`
4. profile-entry 重新路由到 company-feature

## 共用 harness-quick 的硬边界

- 不调 team-pd / team-architect
- 不写 ADR
- 不触发完整 Round
- 只读 `docs/harness/knowledge/*` 不写
- 只读 `docs/memory/*` 不写

## 引用

- 基础 skill：`harness-quick/SKILL.md`
- Java 保护路径完整清单：[../../references/java-gates.md](../../references/java-gates.md)
- Degraded fallback 协议：[../../references/degraded-fallback.md](../../references/degraded-fallback.md)
- company-mt profile hard_floor：`../../profile/company-mt.yml.template`
