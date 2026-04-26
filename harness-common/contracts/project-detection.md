# Project Detection — 技术栈自动探测契约

> **Source of truth**: `packages/harness-cli/src/utils/project-detection.ts`（如不存在以本文档为准；CLI 实现需对齐本表）。本契约迁自 A 套 `harness-workflow/references/project-detection.md`。
>
> 相关 contracts：[phase-init.md](phase-init.md)（init / adopt 阶段调用本探测）、[maintenance.md](maintenance.md) Item 6（`harness_project_stack.md` 漂移与本契约对齐）。

在 `harness init` / `harness adopt` 或首次 Round 开始前，自动检测项目技术栈，结果缓存到 `.harness-context.json`。所有 Stage 的命令调用（test / build / lint / audit）都从此文件读取，**不硬编码**。

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

### 命令推断

#### testCommand

| 标志 | testCommand |
|------|------------|
| `package.json` scripts 含 `vitest` | `npx vitest run` |
| `package.json` scripts 含 `jest` | `npx jest --passWithNoTests` |
| `package.json` scripts 含 `mocha` | `npx mocha` |
| `pyproject.toml` 含 `pytest` | `pytest` |
| `go.mod` 存在 | `go test ./...` |
| `Cargo.toml` 存在 | `cargo test` |
| 无法探测 | `null`（init/adopt 阶段提示用户补填） |

#### buildCommand

| 标志 | buildCommand |
|------|-------------|
| `package.json` scripts 含 `build` | `npm run build`（或 `pnpm run build` / `yarn build`，取决于 packageManager） |
| `pyproject.toml` 含 `[build-system]` | `python -m build` |
| `go.mod` 存在 | `go build ./...` |
| `Cargo.toml` 存在 | `cargo build --release` |
| 无法探测 | `null` |

#### lintCommand

| 标志 | lintCommand |
|------|------------|
| `package.json` scripts 含 `lint` | `npm run lint` |
| `.eslintrc.*` 或 `eslint.config.*` 存在 | `npx eslint .` |
| `pyproject.toml` 含 `ruff` 或 `flake8` | `ruff check .` / `flake8 .` |
| `golangci-lint` 在 PATH | `golangci-lint run` |
| 无法探测 | `null` |

#### auditCommand

| 标志 | auditCommand |
|------|-------------|
| `package.json` + npm | `npm audit` |
| `package.json` + pnpm | `pnpm audit` |
| `package.json` + yarn | `yarn audit` |
| `pyproject.toml` / `requirements.txt` | `pip-audit` |
| 无法探测 | `null` |

#### packageManager

| 标志 | packageManager |
|------|---------------|
| `pnpm-lock.yaml` 存在 | `pnpm` |
| `yarn.lock` 存在 | `yarn` |
| `bun.lockb` 存在 | `bun` |
| `package-lock.json` 存在 | `npm` |
| 默认 | `npm` |

## .harness-context.json 结构

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

## projectType 映射

| 特征 | projectType | DESIGN.md 类型 |
|------|------------|----------------|
| 有 UI 框架 | `web-app` / `desktop-app` | VI 设计系统 |
| 只有 API | `api-server` | API 设计规范 |
| 有 bin + 无 UI | `cli-tool` | CLI 交互规范 |
| 只导出模块 | `library` | 公共 API 设计 |

## 缓存与失效

- `.harness-context.json` 跨 Round 复用
- `harness maintain` 模式（[maintenance.md](maintenance.md) Item 6）检查 `harness_project_stack.md` 与 `.harness-context.json` + 实际依赖文件三方一致性
- 不一致时重新探测
- 在 `.gitignore` 中（每个项目本地）

## 实现位置

- 探测代码：`packages/harness-cli/src/utils/project-detection.ts`（计划中）
- 调用方：[phase-init.md](phase-init.md) §init / §adopt 流程
- 与 maintenance 的接口：[maintenance.md](maintenance.md) Item 6 `harness_project_stack.md` 漂移
