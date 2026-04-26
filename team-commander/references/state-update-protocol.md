# 状态更新协议

完成检查后，更新 `docs/STATE.json`：
```json
{
  "current_phase": "<新阶段>",
  "active_agent": "<新 agent>",
  "status": "<新状态>",
  "pendingRounds": [],
  "scale": "medium",
  "history": [
    {
      "timestamp": "<ISO时间>",
      "agent": "commander",
      "action": "phase_transition",
      "from": "<上一阶段>",
      "to": "<新阶段>"
    }
  ]
}
```

同时追加一行到 `WALKTHROUGH.md`。
