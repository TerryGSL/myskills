# Step Discipline — 每步 ≤50 行 + revert 策略

Phase 2 和 Phase 3 的执行纪律。

## 为什么要小步走

重构的风险在**中间状态**：一步改到一半，测试 FAIL，不知道哪里坏的。
小步 + 每步跑测试 = 定位精确，revert 代价低。

## 每步硬约束

- **Diff ≤ 50 行**：超过 → 拆分
- **原子性**：每步独立过测试（不能"先 break 一下，下一步修"）
- **可逆**：每步 `git reset --hard HEAD~1` 应该回到前一个健康状态

## 允许的步骤类型

### IDE-level 重构（推荐，用工具不用 sed）

- `Rename symbol`（变量 / 函数 / 类 / 方法）—— IDE 保证所有引用同步更新
- `Move file` —— IDE 更新 import
- `Extract method` —— IDE 处理参数捕获
- `Inline method` —— IDE 替换所有调用

**不用 sed**：sed 不懂 scope，会误伤字符串字面量、注释。

### 手工 refactor pattern

#### Pattern A：新旧并行 → 切换 → 清理

```
Step N:   建新实现（测试 + 覆盖率跟上）
Step N+1: 改一个 call site 用新实现（全量测试过）
Step N+2: 改下一个 call site（全量测试过）
...
Step N+k: 所有 call site 都切过去
Step N+k+1: 删旧实现
```

每步独立、可测试、可 revert。

#### Pattern B：抽象接口 → 拆实现 → 清理

```
Step N:   抽象出接口 / trait / abstract class
Step N+1: 让原实现成为 adapter（测试 + 覆盖）
Step N+2: 加新实现
Step N+3: 替换特定 call site 到新实现
...
```

## Revert 策略

### 每步后跑：

```bash
# 跑测试
npm test              # 或 ./mvnw test

# 比对 baseline
diff baseline/tests.json <(npm test -- --json)
diff baseline/api-fixtures.json <(replay api-fixtures.py)

# Company-mt：SQL fixture
diff baseline/sql-fixtures.json <(replay sql-fixtures.py)
```

### 任一 FAIL → 立即 revert

```bash
git reset --hard HEAD~1   # 回到前一步
```

**不要 "先 commit 再想办法修"**。revert 比 forward fix 安全得多。

### 连续 revert 3 次 → 升级

说明当前 plan 拆得不够小 / 策略不对 → 回 Phase 2 重新拆，或升级到 `harness-feature`（重构 scope 其实包含了行为变化）。

## 禁止的操作

- **跨 `@Configuration` / `@ComponentScan` 边界**（Spring） —— 风险太大，bean 图可能变
- **改 MyBatis SQL 语义**（company-mt）—— 属于行为变化，不是重构
- **sed -i 批量替换**（除了格式化 / 去 trailing whitespace 这类无风险动作）
- **同一步多文件大改**（超 50 行 / 超 3 文件）

## 重构中发现 bug

- **不在本 Round 修**（会污染 scope）
- 起 `harness-bugfix` 单独 Round
- 本 refactor Round 暂停，等 bugfix 合并后再继续（重新 baseline）

## Phase 4 最终对比

见 [references/baseline-contract.md](baseline-contract.md) 的"Phase 4 比对契约"。

任一退化 → 升级用户决策：
- 接受退化并继续
- 回滚到重构前
- 调整 plan 重新做
