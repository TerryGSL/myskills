---
name: company-bugfix
description: >
  company-mt overlay of harness-bugfix. Java 企业仓库的 bug 修复在五步基础上追加
  代码路径定位约束（Spring MVC controller / MyBatis mapper / 消息中间件监听器的
  grep 锚点），+ Step 5 必须写 docs/memory/cases/ 带 Meituan-style 元数据。
  触发命令：（无公开触发词）
---

# company-bugfix — Java 企业 bug 修复（v1 overlay）

> 基于 `harness-bugfix`，叠加 Java 定位与 case 写入约束。

## Step 1 额外指引（for invoke Skill(investigate)）

invoke investigate 时，附加 `profile_hints`：

```
Java/Spring Boot/MyBatis 常见路径：
- Controller: src/main/java/**/*Controller.java (@RequestMapping 定位入口)
- Service:    src/main/java/**/*Service*.java  (@Transactional 定位事务边界)
- Mapper:     src/main/resources/mapper/*.xml + src/main/java/**/*Mapper.java
- Entity:     src/main/java/**/entity/*.java / **/po/*.java
- MQ 监听器:  src/main/java/**/*Consumer.java / *Listener.java (@RocketMQMessageListener)
- 审批流:     bpm_flow_node* 表 / ApprovalFlow*.java
```

`investigate` 无装 → degraded fallback 提示 + 自行按上述 glob grep。

## Step 5 case 写入额外要求

`docs/memory/cases/harness_<date>_<slug>.md` 的 frontmatter 必须含：

```yaml
applies_to:
  paths: [...]
  symbols: [...]
  deps:
    - name: <mvn-groupId>:<artifactId>
      range: <version or version range>
```

如果 bug 涉及以下类别，必须在 negative_patterns 里写 Meituan-style 避坑模式：

- Transaction boundary（`@Transactional` propagation 选错）
- ThreadLocal 泄漏（MDC / RequestContextHolder 没清）
- i18n 硬编码（中文字符串直接拼在 return / throw）
- 审批流状态机跳转漏校验

## 其他

承接 `harness-bugfix` 的五步（investigate → reproduce → fix → regression → commit + case）。

## 参考

- 基础：`harness-bugfix/skill.md`
- Spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md` §7.4
