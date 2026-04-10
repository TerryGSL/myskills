# 持久化文件模板

## CLAUDE.md 必须包含的章节

用 AskUserQuestion 收集项目信息（名称、技术栈、部署目标、i18n、认证）后填充：

```markdown
# {ProjectName} — Project Rules

## Project Overview
- **Product**: {name} — {one-line description}
- **Repo**: {owner/repo}
- **Base**: {framework + version}

## Architecture Decisions (ADR)
### ADR-001: ...
- Reason: ...
- Tradeoff: ...

## Coding Standards
### {Language}
### File Organization
### Naming
### Styling
### Git
### Security

## Common gotchas (开发中发现的坑)

## Agent Team Workflow
（引用 harness-init skill 的 6-Stage 工作流）

## Persistent Files
| 文件 | 用途 | 更新时机 |
|------|------|---------|
| CLAUDE.md | 规则/ADR | 架构变更时 |
| docs/STATE.json | 进度追踪 | 每轮结束 |
| docs/DESIGN.md | VI 系统 | 新 UI pattern 时 |
| docs/WALKTHROUGH.md | 操作日志 | 每轮结束 |
| docs/superpowers/plans/ | 计划文件 | 每轮开始 |
```

---

## STATE.json 初始模板

```json
{
  "project": "{ProjectName}",
  "version": "0.1.0",
  "lastUpdated": "{ISO8601}",
  "currentRound": 0,
  "currentPhase": "initialization",
  "completedRounds": 0,
  "summary": {
    "totalCommits": 0, "totalPushes": 0,
    "testsWritten": 0, "testsPassing": 0
  },
  "architectureDecisions": { "count": 0, "location": "CLAUDE.md" },
  "rounds": [],
  "processDebt": { "missingPlanDocs": 0, "missingCodexReviews": 0 },
  "features": {},
  "knownIssues": [],
  "remainingWork": {}
}
```

每轮结束追加到 `rounds[]`：
```json
{ "round": N, "commit": "{hash}", "title": "{summary}", "hadPlanDoc": true, "hadCodexReview": true }
```

---

## WALKTHROUGH.md 模板

```markdown
# {ProjectName} — Operation Walkthrough

> Auto-appended by Coordinator at end of each round. Survives context compression.

## Log

### Round {N} — {date}
**Phase**: {phase}
**Agent**: {who}
**Changes**: {files touched}
**Tests**: {pass/fail count}
**Codex Review**: {pass/fail}
**Commit**: {hash}
---
```

---

## DESIGN.md 必须包含的章节（10 节）

1. **Color Tokens** — 禁止硬编码 hex/oklch，用 CSS 变量或 Tailwind token
2. **Typography** — 固定字号规模 + 字体栈
3. **Spacing & Layout** — 4px 基准网格
4. **Component Patterns** — Button / Card / Input / Nav 标准写法
5. **Glass Effects** — 如需要，定义毛玻璃层级（card / input / showcase）
6. **Animation Conventions** — CSS 环境动效 + framer-motion 交互动效
7. **Gradient Text Utilities** — 如需要，定义渐变文字工具类
8. **Responsive Breakpoints** — Mobile-first 断点
9. **i18n Display Rules** — useTranslations / RTL / 日期格式化
10. **Anti-Patterns (DO NOT)** — 至少 7 条禁止项

**关键**：DESIGN.md 必须在第一轮编码前完成。可用 `/design-systems` skill 按品牌风格生成。

---

## Plan Doc 模板

保存到 `docs/superpowers/plans/YYYY-MM-DD-roundN.md`：

```markdown
# Round N Plan — {date}

## 目标
- {本轮 1-3 个目标}

## 任务分解
| # | Task | Files | Agent | 依赖 |
|---|------|-------|-------|------|
| 1 | ... | ... | Implementer-A | none |

## 退出标准
- [ ] 所有任务完成
- [ ] 测试通过
- [ ] TypeScript 编译通过
- [ ] codex review 无 CRITICAL

## 风险
- {已知的坑}
```

---

## Playwright 配置

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: [['list'], ['html', { outputFolder: 'docs/test-reports/playwright', open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

安装：`pnpm add -D @playwright/test && npx playwright install chromium`
