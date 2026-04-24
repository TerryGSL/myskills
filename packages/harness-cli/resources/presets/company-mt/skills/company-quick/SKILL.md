---
name: company-quick
description: >
  company-mt overlay of harness-quick. Java 企业仓库下的快速路径需要更严的 gate：
  禁止触碰 pom.xml / SQL migration / 权限代码 / 审批流节点，即使 diff 小。
  由 profile-entry 在 company-mt profile + fast-path 同时命中时路由到此。
  触发命令：（无公开触发词）
---

# company-quick — Java 企业快速路径（v1 overlay）

> 基于 `harness-quick`，叠加 Java 企业约束。任何被禁止的改动 → 退回 profile-entry 走 company-feature。

## 额外硬禁止（相对 harness-quick）

即使 1 文件 <10 行，以下改动**一律禁止**走 quick：

- `pom.xml` / `mvnw` / `build.gradle*` — 依赖 / 构建配置
- `src/main/resources/**/*.sql` — SQL schema / migration
- `**/*Mapper.xml` — MyBatis DDL/DML
- `**/Permission*.java` / `**/Auth*.java` / `**/Security*.java` — 权限/鉴权代码
- `**/ApprovalFlow*.java` / `bpm_flow_node*` — 审批流节点
- `messages_*.properties` / i18n resource bundle — 文本边界
- 任何带 `@RequestMapping` / `@GetMapping` / `@PostMapping` 的 Controller 方法签名变化

→ 上述任一命中 → 写 learnings ERROR 条 "quick route refused: <file> is enterprise-guarded" + 升级到 company-feature。

## 其他

承接 `harness-quick` 的 5 步（读 knowledge manifest → edit → 测试 → commit → learnings）。

## 参考

- 基础：`harness-quick/skill.md`
- 企业约束来源：company-mt profile 的 `hard_floor` + `repo_conventions`
- Spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md` §7.4
