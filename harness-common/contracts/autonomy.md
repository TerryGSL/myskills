# Autonomy — 自治决策树 + 人工介入触发

> **Source of truth**: `packages/harness-cli/src/types/constants.ts` (`AGGRESSION_MODES` / `HARD_FLOOR_FLAGS`)。如本文档与代码不一致，以代码为准。

定义 leaf skill 在何种情况下自治、何种情况下停下问用户。所有 leaf skill 共享本契约。

## 人工介入场景（仅 5 种）

其余一切自治。

| # | 场景 | 触发条件 | 介入方式 |
|---|------|---------|---------|
| 1 | 首次项目初始化 | `harness init` 模式 | 确定技术栈 / 架构方向 / 产品定位 |
| 2 | L/XL 级方向确认 | 规模分级为 L 或 XL | 一个选择题对齐方向，不做逐个问答 |
| 3 | 不可解决的阻塞 | 连续 N 次自动修复失败（N 视 mode 而定） | 附问题描述 + 已尝试方案，请用户决策 |
| 4 | Git 推送 high risk | commit 后 push-decision 评估 high | 输出原因，REFUSE，要求人工 push |
| 5 | Git 推送 medium risk | commit 后 push-decision 评估 medium | 单次询问，用户 y 才 push |

详细 push 评估见 [push-decision.md](push-decision.md)。

## 自治决策树

| 决策点 | AI 自治行为 |
|--------|-----------|
| 需求模糊 | S/M 级：补全合理默认值；L/XL 级：问用户一次（单个选择题） |
| 架构有争议 | 参考 CLAUDE.md ADR 历史 + 现有代码模式，选最一致的 |
| Plan 写完 | 直接执行，不等审批 |
| Spec 审查不通过 | 自动修复 + 重新提交审查（最多 2 轮） |
| Codex 发现 Critical | 自动修复 + 重新审查（最多 3 轮） |
| QA 发现 P0 Bug | 自动修复 + 重新测试（最多 2 轮） |
| Security 发现漏洞 | 自动修复 + 重新扫描（最多 2 轮） |
| 修了 N 次还没好 | Spec 2 轮 / Codex 3 轮 / QA/Security 2 轮 后升级给用户 |

aggression mode 倍数见 [aggression-mode.md](aggression-mode.md)。

## 任务规模分级（AI 自动判断，不问用户）

### S 级（< 30min）

- 涉及 1-3 个文件
- 无架构变更 / 无新 UI / 无安全敏感
- 典型：修 bug、调配置、改文案、小重构

### M 级（30min ~ 2h）

- 涉及 4-10 个文件
- 新增功能模块但不改架构
- 可能有新 UI
- 典型：新增功能、重构模块、新增 API

### L 级（2h+）

- 涉及 10+ 个文件或跨模块
- 需要新的架构决策
- 涉及安全敏感操作
- 典型：新子系统、跨模块改造、基础设施升级

### XL 级（多轮）

- 涉及多个独立子系统
- 需要拆分为多个 Round
- 典型：新平台、全栈功能、系统级改造

## Stage 跳过矩阵

| Stage | S | M | L | XL |
|-------|---|---|---|-----|
| 0 需求分析 | ⏭ | ✅ | ✅ | ✅ |
| 1 架构审查 | ⏭ | ⏭ | ✅ | ✅ |
| 2 规划 | ✅ | ✅ | ✅ | ✅ |
| 3 实现 | ✅ | ✅ | ✅ | ✅ |
| 4 Spec 审查 | ✅ | ✅ | ✅ | ✅ |
| 5 质量审查 | ✅ | ✅ | ✅ | ✅ |
| 6 QA 测试 | ⏭* | ✅ | ✅ | ✅ |
| 7 安全审查 | ⏭ | ⏭ | ✅** | ✅ |
| 8 收尾 | ✅ | ✅ | ✅ | ✅ |

*S 级且无逻辑变更时跳过
**L 级仅在涉及安全敏感操作时激活

Stage 详细语义见 [phase-init.md](phase-init.md) 和各 leaf skill 的 SKILL.md。

## XL 级拆轮规则

1. 每轮产出必须可独立运行和测试
2. 后轮可依赖前轮产出，但不修改前轮代码
3. 每轮不超过 10 个 Task
4. 拆轮结果写入 `STATE.json.pendingRounds`
5. 每轮结束后自动检查 pendingRounds，有则继续

## 升级给用户的报告格式

当 AI 无法自动解决问题时，向用户报告：

```
需要你的决策

**问题**：[具体描述]
**已尝试**：
  1. [第 1 次修复方案及结果]
  2. [第 2 次修复方案及结果]
  3. [第 3 次修复方案及结果]

**建议方案**：
  A. [方案 A 及影响]
  B. [方案 B 及影响]

请选择方案，或告诉我你的想法。
```

## Hard-floor 永远胜过 mode

无论 aggression mode 如何，hard_floor 都不可绕过：

- `auto_push` in hard_floor → 即使 `/yolo` 也 REFUSE auto-push
- `force_push` in hard_floor → 永远拒绝 force push
- `destructive_ops` in hard_floor → 拒绝所有 `rm -rf` / `DROP TABLE`
- ...

详见 [hard-floor-enforcement.md](hard-floor-enforcement.md)。

## 实现位置

- Mode 解析：见 [aggression-mode.md](aggression-mode.md)
- Hard-floor 执法：见 [hard-floor-enforcement.md](hard-floor-enforcement.md)
- Push 决策：见 [push-decision.md](push-decision.md)
- 各 leaf 调用：harness-{quick,bugfix,feature,refactor}/SKILL.md
