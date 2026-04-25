---
name: company-bugfix
description: >
  company-mt overlay of harness-bugfix. Java 企业 bug 修复五步在基础上追加：
  Step 1 Java 定位路径提示、Step 4 事务边界/ThreadLocal/审批流额外警戒、
  Step 5 case 写入带 Meituan-style 元数据。
  触发命令：（无公开触发词）
---

# company-bugfix — Java 企业 bug 修复 overlay

> 基于 `harness-bugfix`，叠加 Java 定位与 case 写入约束。

## 差异点（相对 harness-bugfix）

### Step 1 Investigate — Java 栈 profile_hints

invoke `Skill(investigate)` 时附加 Java 专用定位提示：

```
Java/Spring Boot/MyBatis 常见定位路径：
- Controller: src/main/java/**/*Controller.java (@RequestMapping 入口)
- Service:    src/main/java/**/*Service*.java  (@Transactional 事务边界)
- Mapper:     src/main/resources/mapper/*.xml + src/main/java/**/*Mapper.java
- Entity:     src/main/java/**/entity/*.java / **/po/*.java
- MQ 监听器:  src/main/java/**/*Consumer.java / *Listener.java (@RocketMQMessageListener)
- 审批流:     bpm_flow_node* 表 / ApprovalFlow*.java
```

**Degraded**：`investigate` 未装 → 走通用 grep/read + 上述路径 hint；显式标 degraded（见
[../../references/degraded-fallback.md](../../references/degraded-fallback.md)）。

### Step 4 Regression — 额外警戒区

跑完全量测试 PASS 之外，还要 grep diff 是否触碰以下**警戒代码区**，命中则 review 要更严：

- 事务边界（新增/删除 `@Transactional`，propagation 改动）
- ThreadLocal / MDC / RequestContextHolder（是否有 `finally { ...clear() }`）
- 异步（`@Async` / `CompletableFuture.*Async`）线程上下文传递
- 审批流状态机跳转（新增状态转移是否有权限校验）

详见 [../../references/java-gates.md](../../references/java-gates.md) Category 2。

### Step 5 Case Entry — Meituan-style metadata

`docs/memory/cases/harness_<date>_<slug>.md` 的 frontmatter **额外要求**：

```yaml
applies_to:
  paths: [...]
  symbols: [...]
  deps:
    - name: <mvn-groupId>:<artifactId>
      range: <version or version range>
```

若 bug 涉及以下类别，`negative_patterns` 章节必须写 Meituan-style 避坑模式：

- Transaction boundary（propagation 选错导致嵌套事务）
- ThreadLocal 泄漏（MDC / RequestContextHolder 没清）
- i18n 硬编码（中文字符串直接拼在 return / throw）
- 审批流状态机跳转漏校验

这些在 Round 后由 strict-reviewer Step 5 校验 case 写入完整性。

## 共用 harness-bugfix 的硬约束

- Step 2 测试必须 FAIL 才进 Step 3（TDD 顺序不可颠倒）
- Step 3 最小侵入，范围 ≤ Step 2 测试覆盖的代码路径
- 连续 3 次 Step 4 全量 FAIL → 升级到 company-feature
- 不自己写调试方法论（Step 1 必须 invoke investigate）

## 引用

- 基础 skill：`harness-bugfix/SKILL.md`
- 五步 TDD 完整细节：`harness-bugfix/references/five-step-tdd.md`
- Java 警戒区：[../../references/java-gates.md](../../references/java-gates.md) Category 2
- Degraded fallback：[../../references/degraded-fallback.md](../../references/degraded-fallback.md)
- Case frontmatter schema：`harness-common/references/memory-layers.md`
