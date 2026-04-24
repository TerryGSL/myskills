# Profile Resolution Algorithm

How profile-entry decides which profile applies to the current project.

## 算法（按顺序，短路 return）

### Step 1：`forced_profile` 由调用方指定

调用方（`harness-workflow` 或 `team-init`）若传入 `forced_profile` 参数 → 直接用，跳 Step 2-4。

Example：`harness-workflow` 总是传 `forced_profile: harness`（它是 harness profile 的
公开入口，不代 company 决定）。

### Step 2：项目根 `.harness-profile` marker

读 `<cwd>/.harness-profile`（格式：yaml）：

```yaml
profile: harness | company-mt | <custom>
resolved_by: marker | matcher | user_override
updated_at: <ISO-8601>
```

存在且 `profile` 字段在 `~/.claude/profiles/` 有对应 yml → 用 `profile` 字段。

**不存在** → 走 Step 3。

### Step 3：Fallback matcher

读 `~/.claude/profiles/*.yml` 所有 profile，运行 matcher 打分：

```
score = (profile.detection.priority * 1_000_000) + specificity
```

matcher 类型：
- `path_glob`：`cwd.startsWith(pattern 去掉 /**) → match`；specificity = pattern 长度
- `git_remote_regex`：`new RegExp(pattern).test(gitRemote) → match`；specificity = pattern 长度
- `file_exists`：`exists(<cwd>/<pattern>) → match`；specificity = pattern 长度

所有 match 的 profile 按 score 排序，**最高分获胜**。

### Step 4：tie / 全 miss 处理

- **Tie**（两个 profile 分数一致）→ 取 matcher 数量多的 profile（更 specific 的定义）；再 tie → 数组第一个（alphabetical），但**必须 echo 警告**给用户
- **全 miss**（没任何 matcher 命中）→ 用 `default` profile（always-match, priority=0，built-in）

## Schema 校验

resolved profile 的 yml 必须通过 `packages/harness-cli/resources/schemas/profile.schema.json` 校验：

- `name` / `description` / `detection` / `entry_skill` / `task_types` / `default_mode` / `hard_floor` 全部必填
- `entry_skill` 必须是 `"profile-entry"`（const）
- `hard_floor[]` 每项必须在 6 个合法枚举内

校验失败 → **硬 abort**：
```
profile schema violation at ~/.claude/profiles/<name>.yml: <detail>
请修复 yml 或跑 harness doctor 查看完整 issues
```

## Auto-match Disclosure

当走 Step 3 fallback matcher（没有 marker），必须在回复的**第一行**声明：

```
Detected profile: <name> (matched: <matcher-type> <pattern>, priority <N>)
Override: create .harness-profile with `profile: <other>` or pass --profile flag
```

这是对用户的"我替你选了 profile"透明化 —— 如果选错，用户能立即纠正。

有 marker（Step 2）走时**不需要 disclose**（用户自己设的，不用重复告知）。

## 实现伪代码

```typescript
function resolveProfile(cwd: string, forced?: string): Profile {
  if (forced) return loadProfile(forced);  // Step 1

  const marker = readMarker(cwd);
  if (marker) return loadProfile(marker.profile);  // Step 2

  const all = listProfiles(defaultProfilesDir());
  const hits = all
    .map(p => ({ p, score: scoreProfile(p, cwd) }))
    .filter(x => x.score !== null);

  if (hits.length === 0) return loadDefault();  // Step 4 miss

  hits.sort((a, b) => b.score - a.score);
  return hits[0].p;  // Step 3 winner（含 tie-break by array order after priority/specificity）
}
```

参见实际实现：`packages/harness-cli/src/utils/profile.ts` (`matchProfile`)。

## 错误处理

| 场景 | 动作 |
|------|------|
| marker 文件损坏 yaml | 回退到 Step 3 matcher + warn |
| resolved profile 在 ~/.claude/profiles/ 不存在 | 硬 abort + 提示安装该 profile yml |
| profile schema 校验失败 | 硬 abort + 列 schema 错误详情 |
| 全部 profile 都没 match + 无 default yml | 硬 abort（罕见；default 应该总是存在） |
