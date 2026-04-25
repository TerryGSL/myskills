# `.harness-memory.yml` Schema 迁移

> 每次 major 版本升级对应的声明式迁移步骤。Harness 在 `--init/--adopt/--maintain`
> 时读取此文件，当检测到某个契约的 `schema_version` 早于当前发布版本时启用。
>
> 参考：`specs/2026-04-22-memory-reviewer-upgrade.md` §版本演化

## 格式

每个迁移是一个按 semver 区间分节的段落。步骤是声明式的（自然语言 + YAML diff），
不是可执行代码。Harness 的职责是读取、向用户解释变更，仅在显式确认后才应用。

## 当前版本

`1.0.0` —— 初始发布（本次提交）。

此前没有版本，因此尚未定义任何迁移步骤。

## 未来：1.0.0 → 2.0.0（下一次 major 升级的占位）

当 schema_version 2.0.0 发布时，会在此追加类似章节：

```
### 1.0.0 → 2.0.0

**Scope of change:**
- <describe what changed in ownership / field names / behavior>

**Breaking:**
- <list breaking changes>

**Migration steps:**
1. Back up current `.harness-memory.yml` to `archive/harness-memory-v1.yml`
2. Rename fields: <old> → <new>
3. Re-validate with new schema
4. Update schema_version to "2.0.0"

**User action required:**
- Confirm YES/NO after harness shows diff preview
```

## 规则

- **Patch（x.y.z 升级）**：无需迁移
- **Minor（x.Y.z 升级）**：可选；harness 按默认值读取新字段
- **Major（X.y.z 升级）**：发布前必须在本文件中补充迁移章节
- **不支持降级迁移** —— harness 拒绝对更高 major 的契约进行非只读操作
