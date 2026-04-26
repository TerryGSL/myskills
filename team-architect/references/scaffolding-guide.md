# 搭建脚手架 + 编写核心代码

执行以下操作（亲自动手，不委托）：

## 1. 初始化项目脚手架

如果核心目录不存在，根据 `.harness-context.json` 检测到的技术栈选择对应方式：

```bash
# Node.js / TypeScript（根据 framework 选择）
# 例：npm create vite@latest . -- --template react-ts
# 例：npx @nestjs/cli new . --skip-git

# Python（根据 framework 选择）
# 例：poetry new . / fastapi new project

# Go
# 例：go mod init <module-name>

# Java
# 例：初始化 Maven/Gradle 项目结构

# 根据实际检测结果执行，不硬编码框架名
```

## 2. 配置 Linter/Formatter（强制最严格，根据语言选择）

- Java: Checkstyle + SpotBugs + PMD
- TypeScript: ESLint (strict) + Prettier
- Python: Ruff + Black
- Go: golangci-lint + gofmt

## 3. 亲自编写核心基础设施代码

目录路径见 architecture-template.md Section 2：

- 全局异常处理（统一 Result<T> 响应格式）
- 认证过滤器/中间件（使用项目选用的认证方案，不假定 JWT）
- 数据库连接池配置（含连接池参数说明注释；使用项目对应的 ORM/数据访问层）
- 请求日志中间件（含请求ID追踪）
- CORS 配置

## 4. 编写核心代码时必须包含

- 完整的类型定义（无 any，无裸 Object）
- 每个 public 方法的 Javadoc/TSDoc/docstring（根据语言）
- 异常处理（不允许吞掉异常）
- 常量用枚举/常量类，不硬编码
