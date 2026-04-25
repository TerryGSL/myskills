# 实时心跳监控机制

## 概述

在 Round 运行期间，通过 Claude Code 的 CronCreate 定时输出进度表，让用户无需主动询问即可看到当前状态。

---

## 心跳频率

| 阶段 | 频率 | 原因 |
|------|------|------|
| Stage 3（有并行 Agent） | 每 2 分钟 | 多 Agent 状态变化快 |
| 单 Agent 阶段（0/1/2/4/5/6/7） | 每 5 分钟 | 状态变化慢 |
| Stage 8 收尾 | 不轮询 | 主 agent 直接输出结果 |

---

## Token 消耗

- 单次心跳 prompt：~50 token
- 状态文件读取：~100 token
- 输出表格：~80 token
- **单次总计：~230 token**
- 30 分钟 Round（混合频率）：约 10 次 = **~2,300 token**

---

## 状态文件规范

文件：`.harness-status.json`（根目录，在 .gitignore 中）

```json
{
  "roundId": 3,
  "topic": "弹性层改进",
  "scale": "L",
  "startedAt": "2026-04-11T10:00:00Z",
  "cronJobId": "cron_xxx",
  "currentStage": 3,
  "stages": [
    {
      "stage": 0,
      "name": "需求分析",
      "agent": "team-pd",
      "status": "completed",
      "startedAt": "2026-04-11T10:00:00Z",
      "completedAt": "2026-04-11T10:01:30Z",
      "duration": 90,
      "summary": "PRD 已生成"
    },
    {
      "stage": 3,
      "name": "实现",
      "agent": "senior-dev",
      "status": "running",
      "startedAt": "2026-04-11T10:03:40Z"
    },
    {
      "stage": 4,
      "name": "Spec 审查",
      "agent": "spec-reviewer",
      "status": "pending"
    }
  ]
}
```

---

## 生命周期

```
Round 开始（Stage 2 前）
    → 创建 .harness-status.json
    → CronCreate（初始频率 5min）
    → 记录 cronJobId 到状态文件
        ↓
进入 Stage 3（有并行 Agent）
    → CronDelete 旧 cron
    → CronCreate 新 cron（2min）
    → 更新 cronJobId
        ↓
离开 Stage 3
    → CronDelete 旧 cron
    → CronCreate 新 cron（5min）
    → 更新 cronJobId
        ↓
Stage 8 开始
    → CronDelete（无条件执行，即使 cronJobId 为空也尝试）
    → 不再创建新 cron
        ↓
Stage 8 完成
    → 删除 .harness-status.json
    → 输出最终报告
```

---

## 心跳 Cron Prompt

CronCreate 的 prompt 必须极简，只做文件读取和格式化输出：

```
读取 .harness-status.json，输出如下格式的进度表（不调用任何工具，只读文件和输出文本）：

🔄 Round {id} — {topic} (已运行 {elapsed})

Stage    Agent         状态      耗时
─────────────────────────────────────
{每个 stage 一行}
```

---

## 防泄漏保障

1. Stage 8 开始时**无条件执行 CronDelete**，即使 cronJobId 丢失也列出所有 cron 并删除
2. `.harness-status.json` 在 `.gitignore` 中，不进版本控制
3. 状态文件中记录 `cronJobId`，确保精准删除
4. 如果 Round 异常中断（用户手动停止），下次启动时检测到残留的 `.harness-status.json` → 清理旧 cron + 删除文件
