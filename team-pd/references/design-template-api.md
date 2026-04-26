# DESIGN.md 模板 — API 设计规范（api-server 项目）

适用条件：`.harness-context.json` 中 `context.projectType === "api-server"`。

输出 API 设计规范（命名规范、版本策略、错误码约定），写入 `docs/DESIGN.md`：

```markdown
# DESIGN — <功能名称>（API 设计规范）

> 本文件描述 API 接口交互规范，不涉及 UI 设计。

## 1. API 命名规范

- 资源路径使用复数名词，小写连字符：`/api/v1/user-profiles`
- 动作语义通过 HTTP Method 表达，不在路径中使用动词
- 查询过滤通过 Query String 传递：`?status=active&page=1`

## 2. 版本策略

- 版本号放在路径第一段：`/api/v1/`
- 破坏性变更必须升级大版本；向后兼容的扩展可在同版本内进行
- 旧版本下线需提前 <N> 个迭代通知调用方

## 3. 统一错误码约定

| HTTP 状态码 | 业务码范围 | 含义 |
|-------------|-----------|------|
| 400 | 4xxxx | 请求参数错误 |
| 401 | 10001 | 未认证 / Token 失效 |
| 403 | 10002 | 权限不足 |
| 404 | 2xxxx | 资源不存在 |
| 409 | 2xxxx | 资源冲突 |
| 500 | 99999 | 服务端内部错误 |

## 4. 幂等性约定

- 所有写操作（POST/PUT/PATCH/DELETE）需支持幂等键（`Idempotency-Key` Header 或请求体字段）
- 重复请求返回与首次请求相同的结果，不产生副作用

## 5. 请求/响应交互流程

```
调用方
    │  请求（含 Idempotency-Key）
    ▼
网关 / 鉴权层
    │ 通过
    ▼
业务服务 → 持久层
    │
    ▼
统一响应格式 { code, message, data }
```

## 6. 开放问题

| # | 问题 | Owner | 截止时间 | 状态 |
|---|------|-------|----------|------|
```
