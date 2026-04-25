# 五步 TDD 详解

Detailed contract for each step of harness-bugfix.

## Step 1：Investigate

**Invoke `Skill(investigate)`**（复用独立 skill 的 4 阶段调试方法论）：

```
Skill(investigate) with:
  task_description: <bug 描述>
  profile_hints: <根据 resolved_profile 附加 Java/Node/Python 调试路径>
```

### company-mt 的 profile_hints（Java 栈）

```
Java/Spring Boot/MyBatis 常见定位路径：
- Controller: src/main/java/**/*Controller.java (@RequestMapping 入口)
- Service:    src/main/java/**/*Service*.java  (@Transactional 事务边界)
- Mapper:     src/main/resources/mapper/*.xml + src/main/java/**/*Mapper.java
- Entity:     src/main/java/**/entity/*.java / **/po/*.java
- MQ 监听器:  src/main/java/**/*Consumer.java / *Listener.java (@RocketMQMessageListener)
- 审批流:     bpm_flow_node* 表 / ApprovalFlow*.java
```

### Degraded fallback

`investigate` skill 未装：

```
[degraded] investigate skill 不可用，走通用调试（grep + read + 日志）
```

自行按：
1. grep 错误消息在代码里的出现位置
2. Read 可能涉及的文件
3. 若有 stacktrace，从 top frame 顺着读

**不静默兜底** —— 在 `.harness/learnings/ERRORS.md` 追加 entry 标记 `degraded_investigate`。

## Step 2：Reproduce — 写失败测试

**硬要求**：写的测试**必须 FAIL** 才能进 Step 3。

目的：确认你真的抓到了 bug，而不是以为抓到了但实际 reproduce 不出来。

| 测试类型 | 用法 |
|---------|------|
| Unit test | 隔离调用相关函数，断言特定输入得到错误输出 |
| Integration test | 起半真实环境（DB / HTTP mock），复现调用链 |
| 手工 curl | API bug，用 curl + assertion 断言响应码/字段 |

跑 → 确认 **FAIL with expected error**。若测试 PASS 或 FAIL 原因不对 → 回 Step 1 重新诊断。

## Step 3：Fix — 最小侵入修复

**原则**：只让 Step 2 的测试通过。不重构、不扩展功能、不"顺手"改别的。

- 修复范围 ≤ Step 2 测试覆盖的代码路径
- 若发现需要大改（e.g. 要重构架构） → 停下升级到 `harness-feature`（本 bugfix Round 废弃）

## Step 4：Regression — 测试 + doctor

1. 跑 Step 2 的测试 → 必须 PASS
2. 跑全量测试（`npm test` / `mvn test` 等） → 必须 PASS（不 regress）
3. 跑 `harness doctor` → 无新 error level issue

**FAIL 处理**：
- Step 2 测试 PASS 但全量 FAIL → 你的修复破坏了其他功能 → 回 Step 3 重做
- 连续 3 次修复都让全量 FAIL 更糟 → **升级到 harness-feature**（本 Round 废弃，重新 plan）

## Step 5：Commit + Case entry

### Commit

Message：`fix: <根因描述>`（不是 `fix: bug`，要具体到根因）

```
fix: session token not invalidated on refresh endpoint
```

### Case entry（docs/memory/cases/ frontmatter schema）

按 `harness-common/references/memory-layers.md` 里的 case schema 写入
`docs/memory/cases/harness_<date>_<slug>.md`。

### 何时写 case（errors_collection 阈值）

`.harness-memory.yml.errors_collection` 规定 `min_criteria: 2`（默认）；本轮 bug 满足以下**至少 2 条**才算"值得记"：

- `diagnosis_over_30m` — 诊断花了 > 30 分钟
- `cross_module` — 跨模块
- `repeated` — 之前出现过同类
- `platform_specific` — 平台特定（只在 macOS / Linux 复现）
- `user_visible` — 用户可见的错
- `invalidated_assumption` — 推翻了某假设

不满足阈值 → 只写 `.harness/learnings/ERRORS.md`，不进 `docs/memory/cases/`。

### Case 额外：knowledge 关联

若 bug 涉及违反某 knowledge manifest rule → 在 case frontmatter 加：

```yaml
applies_to_knowledge:
  - style-and-structure/rule-3
```

strict-reviewer Step 5 在后续 Round 会读此字段，判断类似 bug 是否重复。
