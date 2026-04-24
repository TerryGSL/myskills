# Stage 7: Security Prompt (via strict-reviewer)

> 本文件是 Stage 7 Security coordinator 的**域上下文模板**。实际审稿由 `strict-reviewer` skill 执行。
>
> **不要直接用本文件作为 role prompt** — 内容作为 `review_target.claims_to_verify` 传给 strict-reviewer。

## 调用方式

```yaml
review_target:
  stage: "security"
  changed_files:     # from: git diff --name-only <baseSha>..HEAD
    - "<file>"
  diff_summary: |
    ...
  claims_to_verify:
    # OWASP-style 具体威胁陈述，不要泛泛"安全"
    - "<endpoint> 对未认证用户返回 401，不泄漏是否存在对应资源"
    - "<form> 的用户输入在写入 DB 前经过 parameterization，无 SQL 注入路径"
    - "session token 存储使用 httpOnly + Secure cookie，不可 JS 访问"
  memory_cases: [...]
  prior_verdict: null
```

## Security 特定的 claims 模板

- **注入类**：参数化/预编译/allow-list + 编码
- **认证/授权**：每个新 endpoint 的权限检查，避免 IDOR / BOLA
- **数据泄漏**：错误消息 / response / log 不含敏感字段
- **CSRF / CORS**：state-changing 操作有 token 或 same-site cookie
- **依赖链**：`{context.auditCommand}` 输出无新增 high/critical CVE
- **密钥**：无 hardcoded secret（hook 层也扫但 security claim 里重复强调）

## 合规 hook（如适用）

若 `.harness-context.json.complianceFrameworks` 非空（e.g., `["SOC2", "GDPR"]`），每个框架列表中自动追加对应 claims 模板。（模板在 `references/security-compliance-claims.md`，本 spec 未覆盖该文件，独立后续工作。）

## 失败处理

与 Stage 6 QA 一致：FAIL → 写 failing test + 修 + 再 invoke，最多 3 轮；BLOCKED → 上报用户。
