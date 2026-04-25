# Harness-workflow 旧版备份

**备份日期**：2026-04-25
**备份原因**：新一代 harness 工作流接管，保留旧版供回溯/对照

## 这是什么

这是 `harness-workflow/` 旧版（profile 路由 + 项目知识扫描器接入**之前**）的完整快照。

特征：
- 单体 skill 设计（一个 skill 包揽 8-Stage、所有 task type）
- 没有 profile 概念，没有 fast-path 结构化路由
- 没有项目知识扫描器（Stage -0.5）
- strict-reviewer 还是 3 硬门版本（未升级到 4 硬门 + Knowledge Compliance）

## 谁取代了它

新一代统一工作流（在仓库根目录的对应位置）。

## 还能用吗

可以，但**不要主动激活**。如果想临时回退，可以把 symlink 指回这里：

```bash
ln -sf ~/Music/myskills/harness-workflow.legacy-backup-2026-04 ~/.claude/skills/harness-workflow
```

但更推荐用新版的回退机制（见新版 README）。

## 什么时候可以删

确认新一代工作流稳定运行 1-2 个月、没有需要回查旧设计的场景后，可以整个 `rm -rf` 掉。
