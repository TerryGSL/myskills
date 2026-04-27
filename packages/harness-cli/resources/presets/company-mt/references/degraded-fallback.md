# Degraded Fallback — 依赖 skill 缺失的降级处理

Shared reference for all `company-*` overlay skills. 当 overlay 依赖的独立 skill 不在本地时的降级协议。

## 原则

**不静默兜底**：任何 degraded 必须在 learnings + 用户输出里显式标记，不允许假装覆盖完整能力。

## 依赖 skill 清单

| 依赖 skill | 用途 | 用在哪个 overlay |
|-----------|------|----------------|
| `java-standards` | 通用 Java 编码规范审查 | company-feature Stage 1 / company-bugfix Step 4 |
| `meituan-java-standards` | 美团 Java 规范 28 条 | company-feature Stage 1（替代 java-standards 如存在） |
| `java-backend-i18n-refactor` | 后端 i18n 改造通用 | company-feature Stage 3（涉及新 i18n 文本时） |
| `costasset-i18n-phase2` | costasset 专属 i18n 阶段 2 | company-feature Stage 3（repo 命中 costasset matcher 时） |
| `investigate` | 系统调试方法论 | company-bugfix Step 1 |
| `gstack/browse` (submodule, 可选) | 浏览器自动化 QA | company-feature Stage 6 前端任务 |
| `gstack/canary` (submodule, 可选) | 部署后 canary 监控 | company-feature Stage 6/8 |
| `gstack/design-review` (submodule, 可选) | 设计师视角视觉审查 | company-feature Stage 6 前端 |

## Fallback 检测

invoke 前用：

```
Skill(<skill-name>) try → 成功 = 继续；失败（not found）= degraded 路径
```

## 三种 fallback 策略

### Strategy A：Sibling skill 替代

例：company-feature Stage 1 希望 invoke `meituan-java-standards`，不存在 → try `java-standards`。
都不存在 → Strategy B。

### Strategy B：本地 manifest 保底

读 `docs/harness/knowledge/style-and-structure/manifest.md` 作为最后手段。
manifest 内容由 `harness scan` 探测 java 模式后自动沉淀，或用户参考
`references/java-rules.md` 的格式手写。

```
[degraded] meituan-java-standards + java-standards 都不可用
→ 检查 docs/harness/knowledge/style-and-structure/manifest.md
   ├─ 存在 + 含规则 → 读其中规则审查（覆盖能力有限）
   └─ 缺失 / 无规则 → 进 Strategy C
→ 在 .harness/learnings/ERRORS.md 追加 entry "company-mt degraded: Java 深度约定不可用"
→ 显式输出给用户: "company-mt degraded: skipping deep Java convention check"
```

### Strategy C：跳过 + 记高优先级 learnings

对非关键 skill（如 `gstack/browse` / `gstack/canary` / `gstack/design-review`，
来自 gstack submodule）缺失，**逐项独立判断**——某一项缺失只跳过对应步骤，
不影响其他 gstack/* skill：

```
[degraded] gstack/browse 不可用 (gstack submodule 未拉取或该 skill 未链接)
→ 跳过浏览器自动化 E2E（手工 E2E）
→ .harness/learnings/FEATURE_REQUESTS.md 追加 "install gstack/browse for frontend E2E"
→ priority: medium

[degraded] gstack/canary 不可用
→ 跳过 post-deploy canary monitoring（人工盯）
→ priority: medium

[degraded] gstack/design-review 不可用
→ 跳过 designer's eye QA（手工对照 DESIGN.md）
→ priority: low
```

注意：4 个 vendored safety skill（`careful` / `guard` / `freeze` / `unfreeze`）
已在顶层目录，无 degraded 路径。

## 用户可见的 degraded 提示

每次 degraded 都在**回复第一段**明示：

```
⚠ company-mt degraded mode
missing skills: <list>
impact: <which stage is reduced>
fallback: <Strategy A/B/C>
to fix: <如何安装>
```

不允许静默。即使用户已看过一次，每次 Round 开始仍要提示（因为每 Round 独立）。

## `harness doctor` 标记

`company-*` overlay 跑时调 `harness doctor --json`，检查 `issues[]` 是否含：

```json
{
  "severity": "warn",
  "code": "java-standards-missing",
  "message": "..."
}
```

如有 → 本次 Round 整体标 degraded，Stage 8 收尾时在 case entry 的 frontmatter 记：

```yaml
degraded_dependencies:
  - java-standards
  - meituan-java-standards
```

供后续 reviewer 判断"这条 case 的修复有效性是否受 degraded 影响"。

## Non-degraded 保证

如果 degraded dependency 都装了（java-standards / meituan-java-standards / java-backend-i18n-refactor / costasset-i18n-phase2 / investigate / gstack/browse / gstack/canary / gstack/design-review）：

- 所有 overlay 按完整 spec 运行
- Stage 1 / Stage 3 / Stage 6 全流程
- 不显示 degraded 提示

**安装方式**：clone myskills + symlink 全部 skill 到 `~/.claude/skills/`（README.md 的 setup 步骤）。
