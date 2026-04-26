# 各阶段产物验收标准

> **harness-workflow 自治模式**：在自治工作流中，产物路径以 harness-workflow 为准（`docs/superpowers/plans/`、`docs/STATE.json`、`docs/DESIGN.md`、`docs/WALKTHROUGH.md`）。以下编号目录仅在独立模式下使用。

## Stage 1+2: PD 完成条件
- [ ] `docs/01-requirements/PRD.md` 存在且包含：用户故事、验收标准、Corner Case
- [ ] UI 项目：`docs/02-design/DESIGN.md` 存在且包含交互流程图（ASCII 可接受）、数据流向、VI 规范
- [ ] 纯后端/CLI 项目：`docs/02-design/API-SPEC.md` 存在且包含接口列表、请求/响应格式、错误码

## Stage 3: Architect 完成条件
- [ ] `docs/03-architecture/ARCHITECTURE.md` 存在且包含：技术栈（{context.language}/{context.framework}）、目录结构、核心依赖说明
- [ ] `src/core/`（或等效的核心目录，取决于 {context.language} 约定）已存在，核心基础设施代码已写入

## Stage 4: Implementation 完成条件
- [ ] `docs/04-implementation/IMPL-PLAN.md` 存在
- [ ] 所有 PRD 中的功能点均已实现
- [ ] 使用 `{context.buildCommand}` 构建无报错

## Stage 5: Testing 完成条件
- [ ] `docs/05-testing/TEST-REPORT.md` 存在
- [ ] 使用 `{context.testCommand}` 运行全量测试通过
- [ ] 单元测试覆盖率 ≥ 60%

## Stage 6: Security 完成条件
- [ ] `docs/06-security/SECURITY-REVIEW.md` 存在
- [ ] 无 CRITICAL 级别安全问题未解决

## Stage 7: Release 完成条件
- [ ] `docs/07-release/CHANGELOG.md` 或 `RELEASE-NOTES.md` 存在
- [ ] 部署/发布脚本已就绪（如适用）

## Stage 8: Retrospective 完成条件
- [ ] `docs/08-retrospective/RETRO.md` 存在，包含：完成情况、遗留问题、改进建议

## STATE.json 兼容

当检测到 `STATE.json` 中有 `currentRound` 字段时，使用 统一 schema：
- `currentRound`: 当前轮次号
- `pendingRounds`: 待执行轮次数组
- `completedRounds`: 已完成轮次数组
- `features`: 功能状态 map
- `knownIssues`: 已知问题数组

当检测到 `current_phase` 字段时，使用旧版 schema（向后兼容）。
