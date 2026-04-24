---
name: company-feature
description: >
  company-mt overlay of harness-feature. Java 企业级 8-Stage 新功能流程，叠加
  Stage 1 前强制 invoke java-standards / meituan-java-standards；Stage 3 涉及新
  i18n 文本时强制 invoke java-backend-i18n-refactor；Stage 8 严格禁止 auto_push。
  触发命令：（无公开触发词）
---

# company-feature — Java 企业 8-Stage 新功能（v1 overlay）

> 基于 `harness-feature`，叠加 Java 编码规范 + i18n + hard_floor 约束。

## Stage 1 前置：Java 编码规范（新增步骤）

在 team-architect invoke 之前：

```
try Skill(java-standards) → 若无 → try Skill(meituan-java-standards) → 若都无 → degraded
```

**degraded fallback**（两个 skill 都缺）：

1. `harness doctor --json` 的 `issues[]` 追加一条：
   ```json
   {
     "severity": "warn",
     "code": "java-standards-missing",
     "message": "company-mt degraded: java-standards + meituan-java-standards unavailable, using bundled references/java-rules.md fallback"
   }
   ```
2. 显式打印到用户 "company-mt degraded: Java 深度约定不可用，仅使用 bundled preset references"
3. 改读 `docs/harness/knowledge/style-and-structure/manifest.md`（init 时从 preset/references/java-rules.md seed）
4. **不**静默兜底假装覆盖完整企业模式

## Stage 3 前置：i18n 检测

若 diff 涉及任何新增 "中文字符串字面量" 或 `@RequestMapping("/<路径>")` 的错误文案：

```
Skill(java-backend-i18n-refactor) with diff
```

若 repo 命中 `costasset-*` matcher 且 java-backend-i18n-refactor 已跑 → 追加
`Skill(costasset-i18n-phase2)` 做 phase 2 细化。

## Stage 8 硬禁止（company-mt hard_floor）

Stage 8 收尾时：

- `auto_push`：禁止（即使 `/yolo` — profile-entry 已经在 mode resolution 剔除）
- `force_push`：禁止
- `auto_merge`：禁止
- `destructive_ops`：git reset --hard 一律手工
- `rewrite_history`：rebase / amend 必须用户 explicit
- `network_install`：Stage 8 不跑 `mvn install` 触发外部 repo download

上述任一在 Stage 8 被 AI 尝试 → `harness doctor` 立刻 BLOCKED + 要求人工接管。

## 其他

承接 `harness-feature` 的 Stage -0.5 至 Stage 8 完整流程。

## 参考

- 基础：`harness-feature/skill.md`
- Java 规则 seed：`../../references/java-rules.md`（init 时复制到 `docs/harness/knowledge/style-and-structure/`）
- Enterprise SDK seed：`../../references/enterprise-sdk.md`
- Spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md` §7.4
