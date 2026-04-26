---
name: team-init
description: >
  Alias for harness-init. 历史命名保留作向后兼容；新用户请 invoke harness-init。
  当用户说 /team-init / "初始化 team" / "team 工作流" 等老用法时，本 skill 透传到
  harness-init 完成实际工作。
  触发命令：无斜杠命令；旧引用自动转发。
---

# team-init — 兼容别名（转发到 harness-init）

> 这是**向后兼容别名**。新文档和新用户直接用 `harness-init`。

## 行为

本 skill 不做具体工作，**完全转发**：

```
Skill(harness-init) with <所有 caller 传入参数原样透传>
```

## 为什么有这个 alias

- 历史版本叫 `team-init`，已经在多个项目的 CLAUDE.md / hooks / user memory 里引用
- 改名 `harness-init` 让命名体系一致（所有 harness 相关 skill 统一 `harness-*` 前缀）
- 保留 `team-init` 透明转发，避免破坏现有引用

## 引用

- 实际实现：`harness-init/SKILL.md`
- 命名决定见 spec §5.4：`docs/superpowers/specs/2026-04-24-harness-cli-integration-design.md`
