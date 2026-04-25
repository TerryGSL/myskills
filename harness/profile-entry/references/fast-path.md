# 结构性 Fast-Path — 确定性路由规则

**角色**：定义 fast-path 触发条件、allowlist 判定逻辑、按语言的正则检测规则，以及误判策略。

**被引用自**：[../SKILL.md](../SKILL.md) Step 2

---

## Fast-Path 定义

**结构性 fast-path** 是一组完全确定性的规则，用于在用户忘记传 flag 时，自动将"显然是小修改"的任务路由到 `harness-quick`，跳过 8-Stage ceremony。

**核心原则**：用确定性规则替代 LLM 猜，永不调用语言模型做任务类型判断。

---

## 触发条件

**全部 5 个条件同时满足，才进入 fast-path**（任一不满足则走常规路径）：

### 条件 1：无显式任务类型 flag
用户消息中不含 `/quick`、`/fix`、`/refactor`。
若含 flag，直接按 flag 解析，跳过 fast-path。

### 条件 2：仅 1 个文件改动
```bash
git diff --stat HEAD | tail -1
# 输出形如 "1 file changed, 3 insertions(+), 1 deletion(-)"
# 必须 "1 file changed"，超过 1 个文件则不满足
```

也接受 staged-only 或 unstaged-only 的单文件改动：
```bash
git diff --stat          # unstaged
git diff --stat --cached # staged
```
任一结果显示 1 file changed 即可（但两者都有改动时，合并计数必须仍为 1 file）。

### 条件 3：diff 行数 < 10
```bash
git diff --stat HEAD | grep "changed"
# insertion + deletion 总行数 < 10
```

### 条件 4：无新文件创建
```bash
git status --short | grep -c "^??"
# 输出必须为 0
```

### 条件 5：目标文件命中 allowlist
见下方 Allowlist 章节。

---

## Allowlist

### 自动通过（扩展名白名单）

以下扩展名的文件**无需检查 diff 内容**，直接通过：

```
.md   .txt   .json   .yml   .yaml   .toml
```

这些文件不含可执行代码，结构变更风险极低。

### 源码文件的额外检查

扩展名不在白名单的源码文件，需通过 diff 内容检查，确认 diff **不触碰**以下任何一类：

| 类别 | 说明 |
|------|------|
| exported 符号 | 公开的函数名、变量名、常量名（各语言大写 / pub / export） |
| 函数签名 | 参数列表或返回类型有变化 |
| 类型定义 | struct / interface / type alias / class 定义行 |
| SQL schema | CREATE TABLE / ALTER TABLE / ADD COLUMN 等 DDL |
| migration 文件 | 路径含 `migration` / `migrate` / `schema` 的文件 |
| 依赖段 | `package.json` 的 `dependencies` / `devDependencies`；`go.mod` 的 `require`；`pyproject.toml` 的 `[tool.poetry.dependencies]`；`Cargo.toml` 的 `[dependencies]` |

**只要 diff 内任一行命中以上类别，fast-path 条件不满足，自动降级到常规路径。**

---

## 检测方法

使用 `git diff -U0`（零上下文行）配合按语言的简单正则。**不做 AST 解析**，正则只检测 diff 的 `+` / `-` 行（新增 / 删除行）。

```bash
git diff -U0 HEAD -- <file>
# 只看以 + 或 - 开头的行（排除 --- / +++ 文件头行）
```

---

## 按语言的 Fast-Path 识别正则

以下正则匹配**风险行**（命中则拒绝 fast-path）。

### Go

```regex
# exported 函数或类型定义
^[+-]func [A-Z]
^[+-]type [A-Z]
^[+-]var [A-Z]
^[+-]const [A-Z]

# 函数签名变化（参数行或返回类型行）
^[+-]\s*func .+\(
^[+-]\s*) [A-Z(]

# go.mod require 段
^[+-]\s+[a-z].+\sv\d
```

**示例（安全，通过 fast-path）**：
```diff
-       log.Printf("starting server on %s", addr)
+       log.Printf("server listening on %s", addr)
```

**示例（风险，拒绝）**：
```diff
-func HandleRequest(ctx context.Context, req *Request) error {
+func HandleRequest(ctx context.Context, req *Request, opts ...Option) error {
```

### Python

```regex
# 公开函数 / 类定义
^[+-]def [a-zA-Z]
^[+-]class [A-Z]
^[+-]async def [a-zA-Z]

# 类型注解签名变化
^[+-]def .+\) ->

# pyproject.toml 依赖
^[+-][a-zA-Z\-_]+ ?[>=<~^]
```

### TypeScript / JavaScript

```regex
# export 声明
^[+-]export (default |const |function |class |type |interface )

# 函数签名（含类型参数）
^[+-](async )?function [a-zA-Z].*\(
^[+-](public|private|protected|static) .*\(

# 类型 / interface 定义
^[+-](type|interface) [A-Z]

# package.json 依赖
^[+-]\s+"[a-z@].+": "[\^~]?\d
```

### Java

```regex
# public / protected 方法或类定义
^[+-]\s*(public|protected) .*(class|interface|enum|record|void|[A-Z]\w+\[\]?) [A-Z]

# 方法签名变化
^[+-]\s*(public|protected|private) \w+[\w<>\[\]]* \w+\(

# 注解接口
^[+-]@interface [A-Z]
```

---

## 误判策略

### 漏判（该 fast-path 没 fast-path）

**风险等级**：低。

漏判会将小修改降级到 `feature` 路径，执行更多 ceremony。结果是工作量略增，但行为完全安全。

**缓解**：用户可显式传 `/quick` flag 覆盖，强制走 quick 路径。

### 误判（结构变更漏进 quick-path）

**风险等级**：中。

误判会导致影响范围大的改动跳过架构检查。

**缓解**：
1. **Allowlist 保守**：扩展名白名单只含配置文件 / 文档，源码文件需额外检查。
2. **正则宁严勿松**：正则命中即拒绝（false positive 可接受，false negative 是风险）。
3. **diff 行数限制严格**：< 10 行阈值低，大多数真实结构变更超过此阈值。
4. **文档化缓解**：本文件明确列出已知盲点（如同一函数体内的副作用变更），便于后续调整 allowlist。

### 已知盲点

- 函数体内改变全局状态或副作用，但签名未变 → 通过 fast-path（可接受，行为变更语义无法静态检测）
- 测试文件修改 mock 接口 → 通过（mock 通常是本地副本，风险低）
- YAML 配置新增 key → 通过（视为文档类变更；若需结构校验应显式传 `/fix`）

---

## Fast-Path 公告格式

自动降级到 quick 时，输出一行（不附加解释）：

```
Fast-path: 单文件 <N 行>改动，路由到 harness-quick（/fix 覆盖）
```

用户可在下次调用时传 `/fix` 或 `/refactor` 覆盖。
