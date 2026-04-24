# Baseline Capture Contract

Phase 1 of harness-refactor. 重构前必须捕获的基线数据。

## 为什么要 baseline

重构的定义：**不改 behavior**。只有 baseline 才能证明重构前后行为一致。

无 baseline 重构 = flying blind，**硬 abort**。

## Baseline 四件套

### 1. 测试通过集合

```bash
# 跑全量测试并记录
npm test -- --json > .harness/refactor-baseline-<timestamp>/tests.json
# 或 Java:
./mvnw test | tee .harness/refactor-baseline-<timestamp>/tests.txt
```

**要求**：
- 全量 PASS（任何 FAIL → 先修 bug，不是重构时机）
- 记录通过数 + 覆盖率快照

### 2. 覆盖率 ≥ 70%

```bash
npm test -- --coverage          # 或 ./mvnw jacoco:report
```

**规则**：
- `personal` profile：覆盖率 ≥ 70%
- `company-mt` profile：覆盖率 ≥ 70% + JaCoCo/Cobertura 报告存档

覆盖率 < 70% → **硬 abort**：
```
重构前覆盖率不足（当前 <X>%）。请先补测试到 ≥ 70% 再重构。
补测试期间若发现 bug → 起 harness-bugfix Round。
```

### 3. API Fixture（输入/输出对）

对关键对外接口（REST API / RPC / public library function）：

```
对每个接口：
  准备若干典型输入
  跑当前实现，记录输出（含错误码、响应格式、side effect）
  存到 .harness/refactor-baseline-<timestamp>/api-fixtures.json
```

重构完成时回放同样输入，输出必须**完全一致**。

### 4. （company-mt 额外）MyBatis SQL Fixture

Java 企业重构：

```
对 Mapper 的每个 <select> / <update> / <insert>：
  准备典型参数集
  执行并拦截生成的 SQL（mybatis.logs / p6spy）
  存到 sql-fixtures.json
```

重构完成时再跑同样参数，生成的 SQL 必须**完全一致**（参数位置、SQL 文本）。

SQL 语义变化 = 行为变化 = 不是重构，是功能改 → 起 harness-feature Round。

### 5. （可选）Performance fixture

如果性能敏感：

```
跑 benchmark 多次，取 P50 / P95 / P99
```

重构后允许的性能退化阈值：
- `personal`：< 5%
- `company-mt`：< 3%（企业 SLA 更严）

超阈值 → 升级用户决策（是否接受）。

## Baseline 存储

```
.harness/refactor-baseline-<timestamp>/
├── tests.json               # 测试通过清单 + 覆盖率
├── coverage-report/         # HTML / JaCoCo 报告
├── api-fixtures.json        # 接口输入输出对
├── sql-fixtures.json        # company-mt 专属
└── perf-baseline.json       # 可选
```

**gitignore**：`.harness/refactor-baseline-*/` 整个加入 gitignore（机器特定，不提交）。

## Phase 4 比对契约

重构完成后与 baseline 对比（见 [references/step-discipline.md](step-discipline.md)）：

| 对比项 | personal | company-mt |
|--------|---------|-----------|
| 测试通过数 | ≥ baseline | ≥ baseline |
| 覆盖率 | ≥ baseline | ≥ baseline |
| API fixture | 完全一致 | 完全一致 |
| SQL fixture | N/A | 完全一致 |
| P95 退化 | ≤ 5% | ≤ 3% |

任一退化 → 升级用户决策（继续 / 回滚 / 接受退化）。
