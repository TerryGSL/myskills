# State Decision Table — Step 3

根据当前状态决策：

| 当前状态 | 动作 |
|----------|------|
| `waiting_for_requirements` | 提示用户描述需求，然后激活 PD Agent |
| `pd_in_progress` | 检查 PRD.md / DESIGN.md（或 API-SPEC.md）是否存在 |
| `pd_review_needed` | **暂停**，提示人工 Review PRD + 设计产物 |

> **autonomous_mode**：跳过此暂停点。使用合理默认值并记录决策。

| 当前状态 | 动作 |
|----------|------|
| `architect_in_progress` | 检查 ARCHITECTURE.md 是否存在 |
| `architect_review_needed` | **暂停**，提示人工 Review 架构方案 |

> **autonomous_mode**：跳过此暂停点。使用合理默认值并记录决策。

| 当前状态 | 动作 |
|----------|------|
| `implementation_in_progress` | 检查源码目录进展 |
| `testing_in_progress` | 检查测试报告 |
| `security_in_progress` | 检查安全报告 |
| `release_in_progress` | 检查发布产物（changelog / release notes / 部署脚本） |
| `retrospective_in_progress` | 检查复盘报告 |
| `completed` | 汇报完成，展示所有产物路径 |
| `blocked` | 显示阻塞原因，提示解决方向 |
