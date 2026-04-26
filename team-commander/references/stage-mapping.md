# Stage Mapping & Harness-Workflow Integration

> **harness-workflow 集成说明**：本技能已作为 harness-workflow 的 Stage 编排器集成，同时仍可独立使用。在自治工作流中，本技能对应 Stage 0（调度与状态管理），并与其余 Stage 1–7 的产物路径保持一致。独立使用时行为不变。

> **harness-workflow 兼容**：本 skill 在自治工作流中作为 Stage 0（调度与状态管理）执行。
> 在 autonomous_mode 下，跳过所有人工暂停点，使用默认值决策。
> STATE.json 使用 统一 schema（currentRound + completedRounds[]）。
>
> **行为协议**：遵守 [protocols.md](../../harness-workflow/references/protocols.md)（反谄媚 + 完成状态 + 升级协议 + 经验沉淀）。

## Stage 映射表（旧 Phase → 新 Stage）

| 旧 Phase | 新 Stage | 负责 skill |
|----------|----------|------------|
| Phase 1+2: Requirements + Design | Stage 0: 需求分析 | team-pd |
| Phase 3: Architecture | Stage 1: 架构审查 | team-architect |
| Phase 3.5: Planning | Stage 2: 规划 | superpowers:writing-plans |
| Phase 4: Implementation | Stage 3: 实现 | team-senior-dev + team-junior-dev |
| Phase 4.5: Spec Review | Stage 4: Spec 审查 | — |
| Phase 5: Quality Review | Stage 5: 质量审查 | codex |
| Phase 5: Testing | Stage 6: QA 测试 | team-qa |
| Phase 6: Security | Stage 7: 安全审查 | team-security |
| Phase 7+8: Release + Retro | Stage 8: 收尾 | — |
