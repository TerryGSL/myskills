# Structural Fast-Path — Deterministic Quick-Route Check

Single source of truth for the fast-path decision logic that auto-routes trivial diffs
to `harness-quick` without asking the user.

## 核心原则

**确定性（Deterministic）**：基于 `git diff --stat` + 文件路径 pattern，**不是 LLM 猜测**。
相同 diff 每次判定一致。

## 判定流程（Yes/No 的连续与门）

走 fast-path 必须**全部**满足：

1. **无 explicit task-type flag**
   - 用户没传 `--quick` / `--fix` / `--refactor` / `--feature` 任一

2. **`git diff --stat` 1 文件**
   - 修改 >1 文件 → NO
   - 新建文件 → NO（新文件属于 feature）
   - 删除文件 → NO

3. **diff 行数 < 10**
   - `git diff -U0 --shortstat` 的 insertions + deletions < 10

4. **目标文件匹配 allowlist**（见下）

全过 → silent route to `harness-quick`（不提示，不问用户）。
任一不过 → 退回到 profile config default（一般是 `harness-feature`）或显式 flag 意图。

## Allowlist：什么文件算"结构无害"

### Category A：纯文本 / 配置文件（无论 diff 内容）

扩展名 ∈ `{.md, .txt, .json, .yml, .yaml}` → 直接过（除非触发下面 B/C 的 exclusion）

**Exception**：即使扩展名对，若文件名匹配以下 → 不过：
- `package.json` / `go.mod` / `pyproject.toml` / `Cargo.toml`（依赖管理文件，下面单独处理）
- `*migration*.sql` / `V*__*.sql`（Flyway migration，属于 schema 变更）
- `schema.sql` / `*.schema.json`

### Category B：源码文件（需扫 diff 内容）

扩展名 ∈ `{.ts, .js, .tsx, .jsx, .py, .java, .go, .rs, .kt, .scala}` → 需要 diff **不包含**以下模式：

- **Exported 符号变化**：`export (function|class|const|type|interface)` 的新增 / 删除 / 签名变化
- **函数签名变化**：任何方法/函数的参数列表、返回类型修改
- **Type 定义变化**：`type X = ...` / `interface X {}` / `class X {}` 增删改
- **装饰器变化**：`@Transactional` / `@Override` / `@RequestMapping` 等关键注解新增/删除

### Category C：禁止 fast-path（永远不过）

无论扩展名和 diff 大小：

- `package.json` / `go.mod` / `pyproject.toml` / `Cargo.toml`（依赖段）
- `pom.xml` / `build.gradle*`（Java 构建文件）
- `migrations/` 目录下任何文件
- `**/*.schema.*`（API schema 定义）
- `Dockerfile` / `docker-compose.yml`
- `.github/workflows/*.yml`（CI 流水线改动要严审）

## 检测机制

使用 `git diff -U0` 生成 unified diff（0 行上下文），再按语言规则 grep：

```bash
DIFF=$(git diff -U0 -- "$TARGET_FILE")
# Example per-language checks:
#   TS/JS:   echo "$DIFF" | grep -qE '^\+.*export (function|class|const|type|interface)' && reject
#   Python:  echo "$DIFF" | grep -qE '^\+(def |class |[A-Z_]+ *=)' && reject
#   Java:    echo "$DIFF" | grep -qE '^\+.*(public|private|protected) .+\(.*\)' && reject
```

**不用 AST**：速度 + 跨语言一致性。Regex 足够排除"签名变化"这种粗粒度信号。
false negatives（把 fast-path-eligible 当不合格）可接受，降级到 feature-path；
false positives（把结构变化放进 quick）是风险，所以 regex 宁可偏严。

## 合规 vs 不合规样例

### ✅ 走 fast-path

- 修 README.md 里的 typo → Category A 纯文本
- 改 log.info 消息措辞（<10 行，不动签名）→ Category B 文件内纯字符串
- 更新 `.github/CODEOWNERS` 加一行 → Category A

### ❌ 退回 feature-path

- 改 `package.json` 加依赖 → Category C 绝对禁止
- 源码里加新方法（即使 <10 行）→ Category B 检测到 `export function`
- 删除某个 API 路由（即使 diff 短）→ Category B 检测到装饰器 `@RequestMapping` 删除
- migration SQL → Category C

## False-Positive / Negative 平衡

- **FN（应该 quick 但走了 feature）**：用户感觉慢，但不会坏事
- **FP（结构变化走了 quick）**：**严重** —— quick 不过 strict-reviewer，坏改动直接 commit

**原则**：allowlist 宁严勿松。遇到模棱两可情况 → 退回 feature-path 让 strict-reviewer 把关。

## 参考

- 本规则来源：`docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md:91-111`
- Category C 列表详细：`packages/harness-cli/src/types/profile.ts` `FastPathRule.forbidden_files`
