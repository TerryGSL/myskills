# OWASP Top 10 检查

## A01 — 访问控制失效（最重要，逻辑漏洞）

```
检查项:
□ 水平越权：查询/修改时是否校验资源归属于当前用户？
  示例漏洞: GET /api/orders/{id} 未校验 order.userId == currentUser.id
  正确做法: orderRepository.findByIdAndUserId(id, currentUserId)

□ 垂直越权：普通用户是否能访问管理员接口？
  示例漏洞: 仅前端隐藏按钮，后端接口无权限注解
  正确做法: @PreAuthorize("hasRole('ADMIN')") 在 Controller 方法上

□ 功能级访问控制：接口是否按角色控制？
□ IDOR（不安全直接对象引用）：敏感 ID 是否可枚举？
  建议：主键用 UUID 或 ULID，不用自增 ID 暴露给外部
```

## A02 — 加密失败

```
□ 密码是否用 BCrypt/Argon2 存储（禁止 MD5/SHA1）？
□ 敏感数据传输是否强制 HTTPS？
□ 日志中是否有明文密码/Token 输出？
□ JWT 密钥是否够长（≥256 bit），是否从环境变量读取？
□ 敏感字段（手机号、身份证）是否加密存储或脱敏展示？
```

## A03 — 注入

```
□ SQL 注入：是否全部使用参数化查询（ORM/PreparedStatement）？
  漏洞模式: 字符串拼接构造 SQL，如 "WHERE name = '" + userInput + "'"
  正确做法: 使用占位符参数，如 repository.findByName(userInput)

□ NoSQL 注入：MongoDB/Redis 等查询条件是否对用户输入进行校验？
  关注点: $where 操作符、filter 条件直接透传用户 JSON 等危险模式

□ ORM 注入：ORM 框架的原生查询（raw query）是否也使用了参数绑定？

□ 命令注入：是否有将用户输入拼接进 shell 命令字符串？
  漏洞模式: 以字符串形式将 userInput 直接传给 shell 执行
  正确做法: 使用参数数组方式调用子进程（如 execFile([cmd, arg])），避免 shell 解析

□ SSTI（模板注入）：模板渲染是否传入了用户数据？
```

## A07 — 认证失败

```
□ 项目选用的认证方案（JWT / Session / OAuth Token 等）是否完整验证了签名、时效、颁发者？
□ 若使用 JWT：signature + expiry + issuer 是否全部校验？
□ refresh_token / 续期凭证是否有一次性使用保护？
□ 登录失败是否有限速（防止暴力破解）？
□ 密码重置流程是否有 token 时效限制？
□ 会话固定攻击：登录后是否重新生成 session/token？
```

## A08 — 软件和数据完整性失败

```
□ 反序列化：是否有不可信数据的反序列化？
□ 支付回调：金额/状态是否从支付网关验签后的数据中取，而不是请求参数？
□ 幂等性：重复提交是否会造成重复扣款/重复操作？
```
