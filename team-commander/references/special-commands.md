# 特殊命令

## `/team-commander rollback`
```
⏪ 回滚到上一阶段
当前: Stage 4: Implementation
回滚到: Stage 3: Architecture

原因? (请描述需要修改的内容)
> _

确认后，STATE.json 中该阶段 status → pending，active_agent 回退。
```

## `/team-commander status`
只显示进度面板，不触发任何动作。

## `/team-commander reset`
完全重置 STATE.json 到初始状态（会要求二次确认）。
