# Project Detection — 技术栈自动探测

> **迁移说明**：本文档从 `harness-workflow/references/project-detection.md` 迁入（harness-v2 架构重构），所有 harness-* task-type sub-skill 共享本探测规范。

## 概述

在 Phase 2 或首次 Round 开始前，自动检测项目技术栈，结果缓存到 `.harness-context.json`。所有 Stage 的命令调用都从此文件读取，不硬编码。

---

## 探测规则

### 语言检测

| 文件 | 语言 |
|------|------|
| `package.json` | Node.js / TypeScript |
| `pyproject.toml` 或 `requirements.txt` | Python |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `pom.xml` 或 `build.gradle` | Java |

### 框架检测

| 文件/依赖 | 框架 |
|-----------|------|
| `next.config.*` | Next.js |
| `electron-vite` 在 devDependencies | Electron |
| `vite.config.*` + `react` | React + Vite |
| `angular.json` | Angular |
| `vue` 在 dependencies | Vue.js |
| `django` 在依赖 | Django |
| `flask` 在依赖 | Flask |
| `fastapi` 在依赖 | FastAPI |
| `gin` 在 go.mod | Gin |

### 测试/构建/规范/审计命令检测

从项目文件自动推断，写入 `.harness-context.json` 的对应字段。

#### testCommand 推断规则

| 标志 | testCommand |
|------|------------|
| `package.json` scripts 含 `vitest` | `npx vitest run` |
| `package.json` scripts 含 `jest` | `npx jest --passWithNoTests` |
| `package.json` scripts 含 `mocha` | `npx mocha` |
| `pyproject.toml` 含 `pytest` | `pytest` |
| `go.mod` 存在 | `go test ./...` |
| `Cargo.toml` 存在 | `cargo test` |
| 无法探测 | `null`（Phase 2 提示用户补填） |

#### buildCommand 推断规则

| 标志 | buildCommand |
|------|-------------|
| `package.json` scripts 含 `build` | `npm run build`（或 `pnpm run build` / `yarn build`，取决于 packageManager） |
| `pyproject.toml` 含 `[build-system]` | `python -m build` |
| `go.mod` 存在 | `go build ./...` |
| `Cargo.toml` 存在 | `cargo build --release` |
| 无法探测 | `null` |

#### lintCommand 推断规则

| 标志 | lintCommand |
|------|------------|
| `package.json` scripts 含 `lint` | `npm run lint` |
| `.eslintrc.*` 或 `eslint.config.*` 存在 | `npx eslint .` |
| `pyproject.toml` 含 `ruff` 或 `flake8` | `ruff check .` / `flake8 .` |
| `golangci-lint` 在 PATH | `golangci-lint run` |
| 无法探测 | `null` |

#### auditCommand 推断规则

| 标志 | auditCommand |
|------|-------------|
| `package.json` + npm | `npm audit` |
| `package.json` + pnpm | `pnpm audit` |
| `package.json` + yarn | `yarn audit` |
| `pyproject.toml` / `requirements.txt` | `pip-audit` |
| 无法探测 | `null` |

#### packageManager 推断规则

| 标志 | packageManager |
|------|---------------|
| `pnpm-lock.yaml` 存在 | `pnpm` |
| `yarn.lock` 存在 | `yarn` |
| `bun.lockb` 存在 | `bun` |
| `package-lock.json` 存在 | `npm` |
| 默认 | `npm` |

### .harness-context.json 结构

```json
{
  "detectedAt": "2026-04-11T10:00:00Z",
  "language": "typescript",
  "framework": "electron",
  "packageManager": "npm",
  "hasUI": true,
  "testCommand": "npx vitest run",
  "buildCommand": "npm run build",
  "lintCommand": null,
  "auditCommand": "npm audit",
  "srcDir": "src/",
  "testDir": "tests/",
  "projectType": "desktop-app"
}
```

### projectType 映射

| 特征 | projectType | DESIGN.md 类型 |
|------|------------|----------------|
| 有 UI 框架 | `web-app` / `desktop-app` | VI 设计系统 |
| 只有 API | `api-server` | API 设计规范 |
| 有 bin + 无 UI | `cli-tool` | CLI 交互规范 |
| 只导出模块 | `library` | 公共 API 设计 |

### 缓存与失效

- 跨 Round 复用，`--maintain` 模式检查一致性
- 不一致时重新探测
- 在 `.gitignore` 中
