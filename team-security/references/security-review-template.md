# 安全审查报告模板与状态更新

## 生成安全审查报告

写入 `docs/06-security/SECURITY-REVIEW.md`：

````markdown
# 安全审查报告
日期：<日期> | 审查者：Security Agent

## 总览
总体安全评级：🔴 高风险 / 🟡 中等风险 / 🟢 低风险

## 发现问题汇总
| 编号 | 类型 | 严重级别 | 置信度 | 位置 | 变体数 | 状态 |
|------|------|----------|--------|------|--------|------|
| SEC-001 | 水平越权 | CRITICAL | 10/10 | OrderController.java:45 | 3 | 待修复 |
| SEC-002 | 密码 MD5 存储 | CRITICAL | 9/10 | UserService.java:67 | 1 | 待修复 |

## CRITICAL 问题详情（必须修复后才能上线）

### SEC-001: 水平越权漏洞
**位置**: `src/modules/order/OrderController.java:45`
**描述**:
GET /api/v1/orders/{id} 接口未校验订单归属，任何已登录用户可访问其他用户的订单。

**攻击场景**:
1. 攻击者登录账号 A
2. 遍历 GET /api/v1/orders/1, /2, /3...
3. 获取所有用户的订单数据，包含收货地址、商品信息

**修复方案**:
```java
// 修复前
Order order = orderRepository.findById(id).orElseThrow();

// 修复后
Long currentUserId = userContextHolder.getCurrentUserId();
Order order = orderRepository.findByIdAndUserId(id, currentUserId)
    .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
```

## 依赖安全
| 依赖 | CVE | 严重度 | 当前版本 | 修复版本 |
|------|-----|--------|----------|----------|

## 许可证合规
✅ 所有依赖许可证合规 / ⚠️ 以下依赖需要法务确认:

## 上线建议
❌ 有 CRITICAL 问题，不建议上线 / ✅ 可以上线（有 MEDIUM 问题需在下个版本修复）
````

## 更新状态

```json
// 有 CRITICAL 未修复
{ "status": "security_blocked", "current_phase": "Phase 6: Security Review" }

// 全部通过
{ "status": "completed", "current_phase": "Phase 6: Security Review" }
```

```
✅ [Security Agent] 安全审查完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
审查范围: 威胁建模 / 代码审计 / 依赖扫描
发现问题:
  🔴 CRITICAL: <N> 个
  🟡 HIGH: <N> 个
  🔵 MEDIUM: <N> 个

📄 docs/06-security/SECURITY-REVIEW.md
上线建议: <❌阻塞 / ✅通过>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
