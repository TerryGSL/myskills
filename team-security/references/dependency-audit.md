# 依赖安全扫描与许可证合规

使用 `.harness-context.json` 中 `context.auditCommand` 指定的命令，自动适配 npm/pip/go/cargo 等包管理器：

```bash
# 从 context.auditCommand 读取实际命令，例如：
# npm/Node.js:  npm audit（或 yarn audit / pnpm audit）
# Python/pip:   pip-audit 或 safety check
# Go:           govulncheck ./...
# Rust/cargo:   cargo audit
# Java/Maven:   mvn org.owasp:dependency-check-maven:check
# Java/Gradle:  ./gradlew dependencyCheckAnalyze

# 查看许可证（按语言选择对应工具）：
# Node.js:  npx license-checker --summary
# Python:   pip-licenses
# Go:       go-licenses check ./...
# Java:     mvn license:aggregate-third-party-report
```

漏洞数据库：使用项目对应语言的漏洞数据库（npm advisory / OSV / NVD / CVE），不硬编码特定数据源。

**依赖安全判断标准**：
| 严重度 | 处理方式 |
|--------|----------|
| CRITICAL CVE | 必须修复，升级或替换依赖 |
| HIGH CVE，有利用代码（PoC） | 必须修复 |
| HIGH CVE，无 PoC，且代码路径不可达 | 评估后决定 |
| MEDIUM/LOW | 记录在报告中，不强制阻塞 |

**许可证合规**（商业项目需注意）：
- ✅ 允许：MIT, Apache 2.0, BSD, ISC
- ⚠️  需确认：LGPL（动态链接可用）
- ❌ 禁止：GPL（会污染整个项目），AGPL，Commons Clause
