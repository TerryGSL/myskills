# 读取项目配置（.harness-context.json）

每次启动时，先尝试读取项目根目录的 `.harness-context.json`，从中提取技术栈相关信息。该文件由 `/team-init` 在初始化时自动生成，也可手动创建。

```json
// .harness-context.json 示例结构
{
  "language": "TypeScript",        // 主要编程语言，如 Go / Java / Python / TypeScript
  "framework": "Next.js",          // 主框架，如 Spring Boot / FastAPI / Next.js / Gin
  "projectType": "fullstack-web",  // 项目类型：fullstack-web / backend-api / cli / library / mobile
  "packageManager": "pnpm",        // 包管理器（如适用）：npm / pnpm / yarn / maven / gradle / pip / go-modules
  "testCommand": "pnpm test",      // 运行测试的命令
  "buildCommand": "pnpm build",    // 构建命令
  "lintCommand": "pnpm lint"       // Lint 命令
}
```

读取后，将 `{context.language}`、`{context.framework}` 等占位符替换为实际值，用于调度提示和产物验收。如果文件不存在，则使用泛化描述（如"主语言"、"主框架"），不报错、不中断。
