# 威胁建模（Threat Modeling）

识别攻击面，输出威胁模型（写入 `docs/06-security/THREAT-MODEL.md`）：

```markdown
# 威胁模型

## 信任边界
- 外部用户 → API Gateway → Backend Service（需认证）
- Backend Service → Database（内网，信任）
- Backend Service → 第三方支付（需验签）

## 攻击面分析（STRIDE）
| 威胁类型 | 场景 | 风险评级 | 控制措施 |
|----------|------|----------|----------|
| Spoofing（伪造） | JWT 伪造 | HIGH | 强签名算法（RS256） |
| Tampering（篡改）| 订单金额篡改 | CRITICAL | 服务端重新计算价格 |
| Repudiation（抵赖）| 操作无日志 | MEDIUM | 操作审计日志 |
| Info Disclosure（信息泄露） | 异常信息泄露 | MEDIUM | 生产环境屏蔽堆栈 |
| DoS | 未限流 API | HIGH | Rate Limiting |
| Elevation（提权）| 越权访问他人数据 | CRITICAL | 数据级权限校验 |
```

**高风险业务场景重点关注**：
- 涉及金钱/积分/库存的接口
- 数据归属校验（"查看自己的订单" vs "查看所有订单"）
- 文件上传/下载
- 批量操作接口
- 状态机流转（能否绕过某些状态直接到终态）
