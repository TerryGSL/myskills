# ARCHITECTURE.md 模板

写入 `docs/03-architecture/ARCHITECTURE.md`，使用以下完整模板：

````markdown
# System Architecture & Technical Blueprint

> **冻结**：文档进入 Phase 4（实现阶段）后，Section 4（API 契约）未经架构师批准不得修改。

## 1. Core Technology Stack

> 基于 `.harness-context.json` 探测结果选择。Rationale 列说明为何拒绝了其他替代方案。

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Backend Framework | <detected framework, e.g. NestJS / FastAPI / Gin / Spring Boot> | <version> | <why not alternatives> |
| Database | <e.g., PostgreSQL> | <15+> | <why> |
| Cache | <e.g., Redis> | <7.x> | <why> |
| ORM / Data Access | <detected ORM, e.g. Prisma / SQLAlchemy / GORM / Hibernate> | <version> | <why> |
| Frontend Framework | <detected frontend framework if applicable, else N/A> | <version> | <why> |
| Build Tool | <e.g., Vite / webpack / Gradle / Poetry> | <version> | <why> |
| Container | Docker | — | <why> |

**明确拒绝的替代方案**（及原因）：
- <替代方案 A>：拒绝原因 <reason>

---

## 2. Directory Structure & Access Control

> 目录布局根据 `.harness-context.json` 探测到的语言/框架自动适配。

**Node.js 项目**使用 `src/core/`：
```text
project-root/
├── src/
│   ├── core/          # 🔒 仅架构师 + 老登可修改
│   │   ├── config/
│   │   ├── security/
│   │   ├── database/
│   │   ├── exception/
│   │   └── middleware/
│   ├── modules/       # 🟡 小登实现，老登审查
│   └── shared/        # 🟢 所有 Agent 可用
```

**Python 项目**使用 `src/core/` 或 `app/core/`（遵循已有项目约定）：
```text
project-root/
├── src/               # or: app/
│   ├── core/          # 🔒 仅架构师 + 老登可修改
│   │   ├── config/
│   │   ├── security/
│   │   ├── database/
│   │   └── middleware/
│   ├── modules/       # 🟡 小登实现，老登审查
│   └── shared/        # 🟢 所有 Agent 可用
```

**Go 项目**使用 `internal/core/`：
```text
project-root/
├── internal/
│   ├── core/          # 🔒 仅架构师 + 老登可修改
│   │   ├── config/
│   │   ├── auth/
│   │   ├── db/
│   │   └── middleware/
│   ├── modules/       # 🟡 小登实现，老登审查
│   └── shared/        # 🟢 所有 Agent 可用
├── cmd/               # 入口
└── pkg/               # 导出库
```

**Java 项目**遵循标准 Maven/Gradle 布局：
```text
project-root/
└── src/main/java/<base-package>/
    ├── core/          # 🔒 仅架构师 + 老登可修改
    ├── modules/       # 🟡 小登实现，老登审查
    └── shared/        # 🟢 所有 Agent 可用
```

所有项目通用：
```text
├── docs/              # 🔒 实现阶段只读
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## 3. Database Schema (Single Source of Truth)

### Table: `<table_name>`
```sql
CREATE TABLE <table_name> (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    -- or: id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    <field>     <TYPE> NOT NULL,

    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP WITH TIME ZONE,         -- soft delete
    created_by  BIGINT REFERENCES users(id),
    version     INTEGER NOT NULL DEFAULT 0         -- optimistic lock
);

-- Indexes
CREATE INDEX idx_<table>_<field> ON <table_name>(<field>);
CREATE UNIQUE INDEX uq_<table>_<field> ON <table_name>(<field>) WHERE deleted_at IS NULL;
```

**ER Relationships:**
- `<table_A>` → `<table_B>`: 1:N via `<foreign_key>`
- `<table_B>` ↔ `<table_C>`: M:N via `<junction_table>`

---

## 4. API Contracts (FROZEN after Phase 4 starts)

### 4.1. <Feature Name>

#### `GET /api/v1/<resource>`
**Description**: <what it does>
**Auth**: Required (<project's chosen auth scheme, e.g. Bearer token / API Key / Session cookie>)
**Query Parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| page | integer | No | Default: 1 |
| pageSize | integer | No | Default: 20, Max: 100 |

**Response 200:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [{ "id": 1, "field": "value" }],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

**Error Responses:**
| Status | Code | Scenario |
|--------|------|----------|
| 401 | 10001 | Authentication failed / token expired |
| 403 | 10002 | Insufficient permission |
| 404 | 20001 | Resource not found |
| 409 | 20002 | Conflict (duplicate) |
| 500 | 99999 | Internal server error |

#### `POST /api/v1/<resource>`
**Idempotency**: `Idempotency-Key` header required for mutation operations
**Request Body:**
```json
{
  "field": "string",
  "amount": 0
}
```
**Validation Rules:**
- `field`: required, max_length=255
- `amount`: required, min=0.01, max=999999.99

---

## 5. Core Infrastructure Code (Written by Architect)

> Core directory path depends on detected language (see Section 2).

Files in the core directory are **OFF-LIMITS** to junior developers:

| File | Purpose |
|------|---------|
| `<core>/exception/GlobalExceptionHandler` | Unified error response |
| `<core>/security/AuthFilter` | Authentication middleware (using project's chosen auth scheme) |
| `<core>/database/TransactionManager` | Transaction boundaries |
| `<core>/config/CorsConfig` | CORS policy |
| `<core>/middleware/RequestLoggingFilter` | Audit log |

---

## 6. Security Architecture

- **Authentication**: <项目选用的认证方案，如 Bearer token (Access: 2h, Refresh: 7d) stored in HttpOnly cookie / API Key via header / Session-based>
- **Authorization**: RBAC — roles defined in `<core>/security/`
- **CSRF**: Double-submit cookie pattern for state-mutating requests (if applicable)
- **Rate Limiting**: 100 req/min per user, 1000 req/min per IP
- **SQL Injection**: ORM only, no string-concatenated queries
- **XSS**: CSP headers + output encoding in frontend (if applicable)

---

## 7. Architectural Decision Records (ADR)

| ID | Decision | Options Considered | Choice | Rationale |
|----|----------|--------------------|--------|-----------|
| ADR-001 | <decision> | <A, B, C> | <choice> | <why> |
````
