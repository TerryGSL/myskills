# Java 企业硬禁止清单

Shared reference for all `company-*` overlay skills. Lists files/patterns that
trigger extra-strict handling in the company-mt profile.

## Category 1：禁止 quick-path（company-quick 专用）

即使 diff 很小，这些路径下的改动一律**退回 company-feature**：

### 依赖 / 构建文件

- `pom.xml` / `mvnw` / `mvnw.cmd`
- `build.gradle` / `build.gradle.kts` / `settings.gradle`
- `.mvn/wrapper/*`
- `gradle/wrapper/*`

### Schema 变更

- `src/main/resources/db/migration/*.sql`（Flyway）
- `src/main/resources/db/changelog/*.xml`（Liquibase）
- `**/Mapper.xml` 里的 `<sql>` / `<resultMap>` / `<resultMap>` 结构性变化
- `**/entity/*.java` / `**/po/*.java` 字段增删

### 权限 / 鉴权

- `**/Permission*.java`
- `**/Auth*.java` / `**/Authorization*.java`
- `**/Security*.java` / `**/*SecurityConfig*.java`
- `**/*Filter*.java`（Spring Security filter）
- `**/*Interceptor*.java`

### 审批流

- `**/ApprovalFlow*.java`
- `**/*BpmNode*.java` / `**/bpm/*.java`
- 包含 `bpm_flow_node` 表的 SQL
- 审批流状态机代码（含 `@StateMachine` 或 enum 中 `APPROVED` / `REJECTED` 等状态）

### i18n 文本

- `src/main/resources/i18n/messages_*.properties`
- 任何含中文字符串字面量 `"[一-龥]+"` 的源文件 diff（新增或修改，不含测试文件）

### API 边界

- 任何含 `@RequestMapping` / `@GetMapping` / `@PostMapping` / `@PutMapping` / `@DeleteMapping` 的 Controller 方法 **签名变化**（参数 / 返回类型 / mapping URL）
- RPC 接口定义（`@DubboService` / `@RpcService`）

## Category 2：Stage 3 警戒（company-feature 实现时特别注意）

这些代码区域不禁止改，但实现时需额外小心 + reviewer Step 5 会重点查：

### 事务边界

- 新加 `@Transactional` → 检查 propagation 是否合适（默认 REQUIRED 在嵌套调用时可能出问题）
- 删除 `@Transactional` → 检查是否还有事务需求
- `@Transactional(rollbackFor=...)` 改动要看是否漏挂异常类型

### ThreadLocal / 线程上下文

- 新用 `ThreadLocal` → 必须在 finally 里 clear；否则线程池复用时泄漏
- MDC / RequestContextHolder / UserContextHolder → 同样要求

### 异步 / CompletableFuture

- `@Async` 跨线程不带 MDC → 上下文丢失
- `CompletableFuture.supplyAsync` 用默认 ForkJoinPool → 生产不能用（共享池阻塞风险）

## Category 3：Stage 7 安全审查额外查点

company-mt 的 `compliance_hooks.required_checks` 强制启用 security。额外关注：

- SQL 注入：`${}` 拼接（MyBatis 动态 SQL）
- XSS：Controller 返回 HTML 的字段未 escape
- SSRF：接受 URL 参数没校验域名白名单
- 反序列化：Jackson `@JsonTypeInfo` 用默认的 `USE_ALL` 有 RCE 风险

## 与 knowledge manifest 的关系

- Category 1 的禁止列表是**硬规则**（Status=active，一定 FAIL）
- Category 2 的警戒点可能在 `docs/harness/knowledge/exception-and-error-contracts/manifest.md` 里（扫描后补）
- Category 3 的安全点由 team-security skill 扫描 + 写 case 到 `docs/memory/cases/`

## 来源

这份清单基于：
- 用户原 `meituan-java-standards` skill 的 28 条规则（合并高 severity 项）
- `docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md` §company profile 定义
- 用户实际 Java 项目（alopex-costasset 等）的历史 bug pattern
