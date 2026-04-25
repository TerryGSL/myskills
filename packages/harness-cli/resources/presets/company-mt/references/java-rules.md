# Java Rules Seed（for docs/harness/knowledge/style-and-structure/ init）

这是 `harness init --preset company-mt` 投放到 target repo 的
`docs/harness/knowledge/style-and-structure/manifest.md` 首发内容。后续 `harness scan`
会在此基础上追加实际代码扫描出的 high-confidence 规则。

---

## Rule: Service 返回 Result<T>

**Rule ID**: style-and-structure/rule-1
**规则**: Service 层方法返回 `Result<T>` / `BaseResult<T>` 包装类型，不抛受检异常；不抛 `RuntimeException` 裸类型
**适用**: `src/main/java/**/service/**/*.java`
**Evidence**: evidence.md#rule-1
**Confidence**: high
**Status**: active
**violation_test**: must_use_wrapper
**wrapper_type**: `Result`

## Rule: Controller 统一异常处理

**Rule ID**: style-and-structure/rule-2
**规则**: Controller 方法不直接 `try/catch` 业务异常，由 `@RestControllerAdvice` 全局拦截
**适用**: `src/main/java/**/controller/**/*.java`
**Evidence**: evidence.md#rule-2
**Confidence**: high
**Status**: active
**violation_test**: must_not_use_pattern
**pattern**: `catch\\s*\\(\\s*BusinessException`

## Rule: Mapper XML 与接口方法名一致

**Rule ID**: style-and-structure/rule-3
**规则**: MyBatis Mapper `.java` 接口方法名必须与同名 `.xml` 的 `<select id="...">` / `<update id="...">` 严格对齐
**适用**: `src/main/resources/mapper/*.xml` + `src/main/java/**/*Mapper.java`
**Evidence**: evidence.md#rule-3
**Confidence**: high
**Status**: active
**violation_test**: free_form_review
**manual_review_reason**: 需 LLM 对比 xml + java 两文件的方法名
**expiry_after_days**: 90

## Rule: 事务边界在 Service 层

**Rule ID**: style-and-structure/rule-4
**规则**: `@Transactional` 只加在 Service 层 public 方法，Controller / Mapper 不能加
**适用**: `src/main/java/**/*.java`
**Evidence**: evidence.md#rule-4
**Confidence**: high
**Status**: active
**violation_test**: must_annotate_with
**annotation**: `org.springframework.transaction.annotation.Transactional`

## Rule: DTO vs Entity 禁止混用

**Rule ID**: style-and-structure/rule-5
**规则**: Controller 返回 DTO（`**/dto/*.java`），不直接返回 Entity（`**/entity/*.java`）；Service 之间不传 Entity
**适用**: `src/main/java/**/*.java`
**Evidence**: evidence.md#rule-5
**Confidence**: high
**Status**: active
**violation_test**: must_not_use_pattern
**pattern**: `return\\s+\\w+Entity\\b`

---

**Notes to scanner**: 运行 `harness scan --domain style-and-structure` 会追加本仓库实际代码扫出的规则（保留以上 seed 规则，除非 drift detection 把某条标 superseded）。
