# Exit Conditions — 什么情况退回 feature path

harness-quick 是无仪式快速路径。以下条件任一触发 → **不走 quick**，退回 profile-entry 重新路由到 harness-feature（或 bugfix / refactor 按用户意图）。

## Diff-based（Step 1 前检测）

- Diff > 10 行（`git diff -U0 --shortstat` insertions + deletions）
- 修改 > 1 文件
- 新建文件（哪怕内容只有 1 行）
- 删除文件
- `git mv` rename（本质结构变化）

## 文件-based（扩展名 / 路径匹配）

**绝对禁止 quick**（Category C，`profile-entry/references/fast-path.md`）：

- `package.json` / `go.mod` / `pyproject.toml` / `Cargo.toml`（依赖段改动）
- `pom.xml` / `build.gradle*` / `mvnw`
- `migrations/` 下任何文件
- `**/*.schema.*`（API schema 定义）
- `Dockerfile` / `docker-compose.yml`
- `.github/workflows/*.yml`（CI 流水线）

## 内容-based（grep 检测，源码文件）

源码文件（.ts/.js/.py/.java/.go/.rs 等）的 diff 出现以下模式 → 退回：

- `^\+.*export (function|class|const|type|interface)` — 新增 exported 符号
- `^\-.*export` — 删除 exported 符号
- 函数/方法签名变化（检测 `^[+-].*\b(public|private|function|def|fn)\b.*\(.*\)`）
- Type / Interface 定义变化
- 关键装饰器增删：`@Transactional` / `@RequestMapping` / `@Override` / `@Entity` 等
- SQL schema（`CREATE TABLE` / `ALTER TABLE` / `DROP`）

## Knowledge rule 冲突

Step 1 读 `docs/harness/knowledge/*/manifest.md`。若 diff 违反任一 rule：

- 若是简单文案 typo 修复但违反 i18n rule → 退回 feature（需要走完整 i18n workflow）
- 若 rule 是 advisory（user_override / expired） → 可继续 quick，但在 learnings 记一条

## 退回处理

检测到任一 exit 条件：

```
1. echo "quick 路径不适用：<具体原因>，退回 profile-entry 重新路由"
2. 不 commit, 不 write learnings
3. return control to profile-entry with hint "task-type: feature"
4. profile-entry 走 feature path（或按用户原 flag 意图）
```

**不静默降级** —— 用户看到"为什么没走 quick"的原因。

## 与 profile-entry/references/fast-path.md 的关系

- `profile-entry/fast-path.md`：**入口**侧路由规则（用户请求进来时判断走不走 quick）
- 本文档：**叶子** skill 内部的退出条件（已经在 quick 里但发现不该）

两者 allowlist 一致，但视角不同：前者决定"进不进"，后者决定"进了后发现不对要退回"。
