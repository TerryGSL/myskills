# Session Health Check — Step 6

> Split into two concerns (spec §team-commander Step 6 重命名):
> - **6.1 Context pressure** — preserved from previous version
> - **6.2 Persistent memory drift** — new, reads `.harness-memory.yml`

## 6.1 Context pressure

每次被激活时，检查上下文使用情况并提醒：
- 如果当前 session 已经有大量对话历史（估算），提示：
```
⚠️  上下文使用量较高，建议：
   1. 确保当前阶段产物已写入文件
   2. 更新 docs/STATE.json 和 WALKTHROUGH.md
   3. 考虑开启新 Session 继续下一阶段
```

## 6.2 Persistent memory drift（仅 harness-workflow 模式）

**触发条件**：项目根存在 `docs/STATE.json` **且** `.harness-context.json`（= 处于 harness-workflow 自治模式）。独立模式下跳过本节。

在每次 round 开始前，检查目标项目的 `docs/memory/.harness-memory.yml` 的漂移信号：

**A. 契约有效性（Contract validity）**
- `.harness-memory.yml` 是否存在？
- 解析不抛异常？
- `forbidden_paths` 非空？
- `owned_paths` 无 broad 且未限定范围的路径？
- 任一失败 → 警告用户，禁止自动启动新 round

**B. Suspect 状态积压（Suspect state backlog）**
- 扫描 `docs/memory/cases/harness_*.md` 中 `freshness.state: suspect` 的条目
- 若 > 3 个 case 处于 suspect 状态超过 14 天 → 发出 "suspect backlog" 警告
- 用户可以：
  - 逐条审核（将 suspect → active 并更新 `last_verified`，或 → archived）
  - 忽略（下一轮 round 再提示）

**C. 审计时间戳漂移（Audit timestamps drift）**
- 检查 `.harness-memory.yml.audits.last_full_audit`
- 若为 null 或超过 90 天 → 建议执行 `/harness-workflow --maintain`

**D. 评分卡健康度（Scorecard health）**
- 读取 `docs/memory/harness_reviewer_scorecard.yml`
- `false_pass_incidents` 计数 / `totals.pass_count` > 5%？→ 警告 "PASS 误放行率偏高"
- 最近 10 条 review 内 BLOCKED > 3？→ 警告 "审查器基础设施不稳定"

完整规则 → `harness-workflow/references/memory.md` §5.3 + `harness-workflow/references/maintenance.md` §`--maintain` memory audit。
