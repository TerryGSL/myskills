# 逻辑漏洞与前端安全

## 逻辑漏洞（比 OWASP 更难检测，更有杀伤力）

```
□ 竞态条件（Race Condition）：
  场景: 两个请求同时读到库存=1，都通过校验，都扣减
  检查: 库存/积分/余额扣减是否有锁（乐观锁/悲观锁/Redis SETNX）

□ 负数绕过：
  场景: 转账金额 -100 → 账户增加 100
  检查: 金额/数量字段是否校验 > 0

□ 时间窗口攻击：
  场景: 下单后取消再下单，利用库存锁定的时间窗口
  检查: 状态机流转是否有时间窗口可利用

□ 价格篡改：
  场景: 前端传入商品金额，后端直接使用
  检查: 后端是否重新从数据库查询商品价格，而不是信任客户端传值

□ 批量枚举：
  场景: 遍历 /api/users/1 到 /api/users/10000 获取所有用户信息
  检查: 敏感接口是否有 rate limiting + CAPTCHA
```

## 前端安全（如有）

```
□ XSS：用户输入是否转义？React 默认防 XSS，但注意 dangerouslySetInnerHTML
□ CSRF：非 GET 接口是否有 CSRF Token 或 SameSite Cookie？
□ 敏感信息：localStorage 是否存了 JWT？（建议用 HttpOnly Cookie）
□ CSP：是否配置了 Content-Security-Policy Header？
□ 第三方脚本：是否有不受控的第三方 JS（可能被 XSS 攻击）？
```
