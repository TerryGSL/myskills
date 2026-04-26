# Status Panel — Step 2

每次启动都先展示完整的状态面板（阶段编号与 harness-workflow 的 Stage 1–8 对齐）：

> **注意**：以下面板为独立模式（standalone）的 Stage 编号。在 harness-workflow 自治模式下，使用 Stage 0-8 编号体系（见 `stage-mapping.md` 的兼容映射表）。独立模式使用 Stage 1-8。

```
╔══════════════════════════════════════════════════════╗
║  AGENT TEAM — <项目名>                                ║
╠══════════════════════════════════════════════════════╣
║  当前阶段: <current_phase>                            ║
║  当前 Agent: <active_agent>                           ║
║  状态: <status>                                       ║
║  技术栈: {context.language} / {context.framework}     ║
╠══════════════════════════════════════════════════════╣
║  阶段进度:                                            ║
║  ✅ Stage 1: Requirements   [completed]               ║
║  🔄 Stage 2: Product Design [in_progress]             ║
║  ⏳ Stage 3: Architecture   [pending]                 ║
║  ⏳ Stage 4: Implementation [pending]                 ║
║  ⏳ Stage 5: Testing        [pending]                 ║
║  ⏳ Stage 6: Security       [pending]                 ║
║  ⏳ Stage 7: Release        [pending]                 ║
║  ⏳ Stage 8: Retrospective  [pending]                 ║
╚══════════════════════════════════════════════════════╝
```

图例：✅ 完成 | 🔄 进行中 | ⏳ 等待中 | ❌ 阻塞 | ⏭️ 已跳过
