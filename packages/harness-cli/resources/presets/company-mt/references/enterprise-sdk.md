# Enterprise SDK Seed（for docs/harness/knowledge/integrations-and-sdk-usage/ init）

---

## Rule: MQ 发送走统一 SDK wrapper

**Rule ID**: integrations-and-sdk-usage/rule-1
**规则**: RocketMQ / Kafka 发送消息必须通过企业 `MessageSender` wrapper（封装重试 / trace id / 企业 tag），禁止直接调原生 Producer
**适用**: `src/main/java/**/*.java`
**Evidence**: evidence.md#rule-1
**Confidence**: high
**Status**: active
**violation_test**: must_call_component
**component**: `com.enterprise.infra.mq.MessageSender`

## Rule: HTTP 调用走 HttpClientWrapper

**Rule ID**: integrations-and-sdk-usage/rule-2
**规则**: 外部 HTTP 调用通过 `HttpClientWrapper`（自动注入认证头 / 超时 / 熔断），禁止直接用 RestTemplate / OkHttpClient
**适用**: `src/main/java/**/*.java`
**Evidence**: evidence.md#rule-2
**Confidence**: high
**Status**: active
**violation_test**: must_call_component
**component**: `com.enterprise.infra.http.HttpClientWrapper`

## Rule: Redis 操作走 RedisTemplate + key 命名规范

**Rule ID**: integrations-and-sdk-usage/rule-3
**规则**: Redis key 必须 `{biz}:{module}:{id}` 格式；TTL 必须显式设（`SET EX` 或 `setex`），不允许永久 key
**适用**: `src/main/java/**/*Redis*.java` + `src/main/java/**/*Cache*.java`
**Evidence**: evidence.md#rule-3
**Confidence**: high
**Status**: active
**violation_test**: free_form_review
**manual_review_reason**: key 格式需 LLM 识别语义
**expiry_after_days**: 90

---

**Notes**: 运行 `harness scan --domain integrations-and-sdk-usage` 会追加仓库内其他 SDK 使用模式。
