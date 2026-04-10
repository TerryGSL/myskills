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
（引用 harness-init skill 的 8-Stage 工作流）

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
  "pendingRounds": [],
  "completedRounds": [],
  "features": {},
  "knownIssues": [],
  "summary": {
    "totalCommits": 0,
    "testsWritten": 0,
    "testsPassing": 0
  }
}
```

每轮结束追加到 `completedRounds[]`：
```json
{
  "id": 1,
  "topic": "{功能描述}",
  "scale": "S|M|L",
  "stages": [2, 3, 4, 5, 8],
  "commits": 3,
  "filesChanged": 5,
  "linesAdded": 120,
  "duration": "12min",
  "completedAt": "2026-04-11"
}
```

XL 级拆轮时写入 `pendingRounds[]`：
```json
{ "topic": "{子任务描述}", "scale": "M", "dependsOn": null }
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

## DESIGN.md 章节（按项目类型选择）

### 有 UI 的项目（web-app / desktop-app）

1. **Color Tokens** — 禁止硬编码色值，用设计 token
2. **Typography** — 字号规模 + 字体栈
3. **Spacing & Layout** — 基准网格
4. **Component Patterns** — 核心组件标准写法
5. **Effects** — 阴影/毛玻璃/渐变（如需要）
6. **Animation** — 动效规范
7. **Responsive** — 断点定义
8. **i18n** — 国际化规则（如需要）
9. **Anti-Patterns** — 禁止项

### 纯后端 API 项目（api-server）

1. **API 命名规范** — RESTful / GraphQL 约定
2. **版本策略** — URL 版本 / Header 版本
3. **错误码体系** — 错误格式、业务码定义
4. **分页规范** — 分页参数、响应格式
5. **认证规范** — Token 格式、刷新策略
6. **Anti-Patterns** — 禁止项

### CLI 工具（cli-tool）

1. **输出格式** — 表格/JSON/纯文本切换
2. **颜色规范** — 成功/警告/错误色
3. **进度展示** — 进度条/spinner 规范
4. **帮助文本** — --help 格式约定

### 库/SDK（library）

1. **公共 API 命名** — 导出函数/类/类型命名
2. **错误处理** — 自定义错误类型
3. **类型导出** — TypeScript/Python typing 规范

**关键**：DESIGN.md 必须在第一轮编码前完成。UI 项目可用 `/design-systems` skill 按品牌风格生成。

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
