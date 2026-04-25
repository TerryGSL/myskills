# harness setup 零问卷化设计

**日期**：2026-04-25
**作者**：Claude（Opus 4.7）+ codex（strict reviewer）协作
**目标范围**：`harness/` 文件夹（新一代 skill pack，旧版 `harness-workflow/.legacy-backup-2026-04/` 不动）

## 1. 背景与动机

### 1.1 用户反馈

来自 `~/.claude/projects/-Users-twelve-Music-myskills/memory/feedback_minimize_setup_wizards.md`：

> harness setup 不要 upfront 问大量配置题。能靠对话推断、靠规则推导、靠当前环境读取的，都不要问。

具体指令：

| 项 | 现状（setup-harness.sh） | 期望 |
|---|---|---|
| 公司 vs 个人项目 | 上来问 1/2/3 | 不问，对话里第一次明确说时记下来 |
| push 策略 | 上来问 conservative/standard/aggressive | 不问，规则化判断（公司=不自动；个人=按 risk） |
| 公司路径 / git remote | 进入公司分支后问两题 | 不问，从 cwd + git remote 自动派生 |
| 是否启用 Stop Hook | 上来 yes/no | 不问，hook 自身按 task_type 动态决定 |

### 1.2 codex 反驳（必须收敛的关键约束）

经 codex strict reviewer 审稿后，**否决了几个原始草案**：

1. **`profile-entry` 不能监听对话信号 / 不能自动落盘**
   - 现行契约（`harness/profile-entry/SKILL.md:3, 8, 72, 182-184`）明文禁止"LLM 语义分类 / 跨 turn 持久化 / 改文件"
   - 收敛：派生+落盘的活拆给独立的 `harness/profile-bootstrap/` skill，profile-entry 保持纯只读
2. **path_glob 派生不能爬到父目录**
   - 派生 `~/work/**` 这种宽匹配会让同 workspace 下个人项目误命中公司 profile
   - 收敛：path_glob 仅派生当前 canonical repo root（`git rev-parse --show-toplevel | realpath`）
3. **git_remote_regex 派生必须扫所有 remotes 并精确到 host/org/repo**
   - 仅看 `origin` 对 fork / upstream / mirror 场景失稳
   - 收敛：`git remote -v` 扫全部，host[:/]org/repo 精确锚定，origin/upstream 不一致 → 拒绝派生
4. **现有 setup-harness.sh 已有 4 个 bug 必须一并修**
   - 写出的 `harness.yml` 缺 `detection` / `entry_skill` / `hard_floor` 字段（schema 残缺）
   - 公司模板占位符为 `REPLACE_ME`，但 fallback 分支用 `__COMPANY_NAME__` 等 `sed` 替换 → 永远替换不到
   - fallback 分支写非法 matcher 类型 `type: repo_path` / `type: git_remote`（schema 只允许 `always|path_glob|git_remote_regex`）
   - 写入直接 `cat >` 覆盖，无 dry-run / 无原子写
5. **push 策略 user feedback 与 autonomy.md 冲突**
   - `harness/harness-workflow/references/autonomy.md:11` 写"绝不静默自动 push"
   - user feedback 写"低 risk 个人项目可自动 push"
   - **本 spec 决定按 user feedback 走**（risk-based），同步修改 autonomy.md 第 4 项 → "公司=人工；个人=按 risk 分级（low 自动 / medium 询问 / high 拒绝）"

## 2. 设计概览

### 2.1 责任分离

```
┌──────────────────┐
│ setup-harness.sh │  ← 一次性安装：校验 + 写默认 profile（无问题，dry-run 默认）
└─────────┬────────┘
          │
          ↓
┌──────────────────────┐
│ harness/             │  ← 新 skill：派生 path/remote + 写 .harness-profile + 写 company-*.yml
│  profile-bootstrap/  │     触发：显式 /profile-bootstrap [name]
└─────────┬────────────┘
          │
          ↓
┌──────────────────┐
│ profile-entry/   │  ← 保持薄 router 契约不变，新增：path_glob 用 realpath 规范化
└─────────┬────────┘
          │
          ↓
┌────────────────────────────────────┐
│ harness-quick / bugfix /           │
│ feature / refactor                 │  ← 调用 harness-common/references/push-decision.md
│   (commit 后做 risk 评估 → push)   │     评估改动 risk，决定 auto / ask / refuse
└────────────────────────────────────┘
          │
          ↓
┌─────────────────────┐
│ context-monitor.sh  │  ← 阈值改为按 task_type 自适应（quick=80/90 / bugfix=70/85 / feature=60/80）
└─────────────────────┘
```

### 2.2 核心设计原则

1. **零 upfront 问题**：setup-harness.sh 不再问"个人/公司"、"push mode"、"路径"、"hook 启停"
2. **派生而非询问**：能从 `git rev-parse` / `git remote -v` / `realpath` / `cwd` 推出来的全部派生
3. **路由层只读**：profile-entry 仍然是确定性、薄路由器，**不**承担派生 / 写文件 / 监听对话信号
4. **派生有单独命令**：profile-bootstrap 是独立 skill，由用户对话里明确说"这是 X 公司项目"后由 Claude 主动调用，或显式 `/profile-bootstrap` 触发
5. **严格 schema 校验**：所有写入文件前后都做 schema 校验，拒绝占位符残留 / 非法 matcher 类型
6. **原子写入**：所有落盘走 `mktemp + mv`（同分区原子 rename），失败可回滚
7. **risk-based push**：保留 user feedback 的 risk-based 模型，规则化（不靠 LLM 当场推理）

## 3. 详细设计

### 3.1 setup-harness.sh 改造

**职责简化为 4 件事**：
1. 确保 `~/.claude/profiles/` 存在
2. 确保 `default.yml` / `harness.yml` / `company.yml.template` 存在（缺则写默认）
3. 检查 `~/.claude/settings.json` 是否已注册 context-monitor.sh hook，输出 active / inactive 状态 + 注册 snippet
4. 输出"接入完成"+ 后续步骤指引

**调用方式**：
```bash
~/Music/myskills/harness/setup/setup-harness.sh           # dry-run 默认，仅检查 + 输出建议
~/Music/myskills/harness/setup/setup-harness.sh --apply   # 真正写入缺失的文件
```

**dry-run 输出示例**：
```
== harness setup（dry-run）==
✓ ~/.claude/profiles/         存在
✓ default.yml                  存在
✓ harness.yml                  存在
✓ company.yml.template         存在
✗ Stop Hook 未注册到 ~/.claude/settings.json

如需 apply 缺失项，运行：
  ~/Music/myskills/harness/setup/setup-harness.sh --apply

如需注册 Stop Hook，把以下 snippet 合并到 ~/.claude/settings.json：
  <snippet>

按 task_type 自适应：
  quick    → warn 80% / crit 90%
  bugfix   → warn 70% / crit 85%
  feature/refactor → warn 60% / crit 80%
  无 task_type → 静默退出
```

**bug 修复**：
- 写 `harness.yml` 时输出完整 schema（含 detection / entry_skill / hard_floor）
- 删除 setup 里所有"问题分支"代码（dev_scenario / push_mode / company_name / enable_hook 全删）
- 不再生成 `company-<name>.yml`（这是 profile-bootstrap 的活，不是 setup 的）

### 3.2 新增 `harness/profile-bootstrap/` skill

**目录结构**：
```
harness/profile-bootstrap/
├── SKILL.md
└── lib/
    └── derive.sh    # 派生逻辑（可独立 unit test）
```

**触发条件**：
1. 用户显式 `/profile-bootstrap` 或 `/profile-bootstrap <name>`
2. profile-entry Step 1 fallback 完全无匹配 + 用户对话里明确说"这是 X 公司项目"时，主对话 Claude 应主动调用（**不**由 profile-entry 自己调）

**派生算法**（`derive.sh`）：
```
1. 取 canonical repo root：
   REPO_ROOT=$(realpath "$(git rev-parse --show-toplevel)")
   若不在 git repo：abort，输出 "Not in a git repo, cannot derive."

2. 派生 path_glob：
   PATH_GLOB="${REPO_ROOT}/**"
   （注意：用 ${HOME} 替换前缀让 path 可移植，再写入 yml；
    profile-entry 匹配时 expand 回来）

3. 扫所有 remotes：
   REMOTES=$(git remote -v | awk '{print $2}' | sort -u)
   若 remote 数量 = 0：保留 path_glob-only matcher，git_remote_regex 留空（用户事后可加）

4. 提取每个 remote 的 (host, org, repo)：
   git@github.com:acme/api.git    → host=github.com, org=acme, repo=api
   https://gitlab.com/foo/bar.git → host=gitlab.com, org=foo,  repo=bar

5. 检查一致性：
   - 所有 remotes 的 (host, org) 是否一致？
     一致 → 派生 git_remote_regex = "<host>[:/]<org>/<repo>(\\.git)?$"
     不一致（如 origin = personal fork, upstream = company）→ abort，
       要求用户显式选 `/profile-bootstrap <name> --remote origin|upstream`

6. schema 校验：
   - matcher 类型必须是 path_glob 或 git_remote_regex
   - pattern 不能包含 "REPLACE_ME" / "__"
   - hard_floor 在 [auto_push, force_push, destructive_ops, auto_merge] 子集

7. 原子写入：
   tmp=$(mktemp ~/.claude/profiles/.tmp.XXXXXX)
   echo "<derived yaml>" > "$tmp"
   mv "$tmp" "~/.claude/profiles/company-${slug}.yml"

8. 写 .harness-profile：
   echo "${slug}" > "${REPO_ROOT}/.harness-profile.tmp"
   mv "${REPO_ROOT}/.harness-profile.tmp" "${REPO_ROOT}/.harness-profile"

9. 自动加 .gitignore：
   grep -qxF ".harness-profile" "${REPO_ROOT}/.gitignore" \
     || echo ".harness-profile" >> "${REPO_ROOT}/.gitignore"
   （理由：profile 选择是机器/账户级别决策，不应跟 repo 走）

10. 输出公告：
    Derived: profile=company-acme
      path_glob:        ~/work/acme-api/**
      git_remote_regex: github\.com[:/]acme/api(\.git)?$
      hard_floor:       [auto_push, force_push, destructive_ops, auto_merge]
    Wrote:
      ~/.claude/profiles/company-acme.yml
      ~/work/acme-api/.harness-profile  (added to .gitignore)
```

**slug 派生规则**：
- 优先使用用户传的 `<name>` 参数
- 若无传 → 用 git remote 推出的 `org` 作为 slug
- 若无 remote → fallback 到 repo basename
- slug 必须 `[a-z0-9-]+`，否则 abort 要求用户显式传

**默认 hard_floor**：
- 名字含 "company" / "work" / "corp" / 用户传 `--workspace company` → `[auto_push, force_push, destructive_ops, auto_merge]`
- 否则（个人）→ `[]`
- **永远不替用户决定个人项目要 hard_floor**——bootstrap 不预设个人项目的 push 限制

### 3.3 profile-entry 单点 patch：realpath 规范化

**问题**：现 path_glob 匹配对象是"当前 CWD 路径字面量"，不规范化 symlink。
**修复**：Step 1 跑 fallback matchers 时，把 CWD 先 `realpath` 一次再去对比 path_glob pattern。

修改位置：`harness/profile-entry/SKILL.md:46-50` + `harness/profile-entry/references/profiles.md:46-50`。

**唯一改动**，不引入任何"对话信号识别 / 自动落盘"逻辑。

### 3.4 push decision 规则化

**新增文件**：`harness/harness-common/references/push-decision.md`

**规则**（确定性，不调 LLM）：

```
INPUT:
  - profile_hard_floor: 列表
  - git diff --stat HEAD（commit 之后的 diff）
  - 测试结果（feature/bugfix 的 Stage 6 输出）

STEP 1: 公司硬底
  if "auto_push" in profile_hard_floor:
    return REFUSE  # 公司项目永不自动 push

STEP 2: 改动 risk 评估（个人项目）
  files_changed = `git diff --stat HEAD~1 | wc -l - 1`  # commit 后 vs HEAD~1
  exts = file extensions in diff

  HIGH（强制人工 push）:
    - 任何 .env / .secrets / *credentials*
    - 改 package.json / pyproject.toml / go.mod 的 dependencies 段
    - 改 db schema / migrations
    - 改 ci / .github/workflows / Dockerfile
    - files_changed > 3
    - 测试结果显示有 fail
    - diff 中含 "BREAKING" / "DROP TABLE" / "rm -rf"
    - 改公共 export（lib 入口 / 公共 api 路由文件）

  LOW（自动 push）:
    - 仅改 *.md / *.txt / 注释 / docstring
    - 仅改 i18n / locale 文件
    - 仅添加新文件且新文件不被任何现有 import 引用
    - files_changed = 1 且 diff 行数 < 10 且全是 string literal 改动

  MEDIUM（询问一次 push）:
    - 其他所有情况

STEP 3: 用户确认
  HIGH:
    print "Push 被阻拦：原因 [X]。请人工 push。"
    return REFUSE
  LOW:
    print "Risk: low（仅文档/i18n）。自动 push。"
    git push
  MEDIUM:
    print "Risk: medium。是否 push？[y/N]"
    if input == "y": git push
```

**leaf skill 的修改**：
- `harness/harness-feature/SKILL.md:278-280` 现"git commit（仅 commit，不自动 push）"
  → 改为"git commit + 调用 push-decision 规则"
- `harness/harness-bugfix/SKILL.md:178` 同上
- `harness/harness-quick/SKILL.md` 同上
- `harness/harness-refactor/SKILL.md` 同上

**autonomy.md 调整**（`harness/harness-workflow/references/autonomy.md:11-14`）：

```diff
- | 4 | Git 推送 | Stage 8 收尾 commit 后 | 最终报告输出后可询问一次，用户同意才 push，绝不静默自动 push |
- **其余一切自治**，包括 S/M 级全流程、架构判断、规划、审查、测试、收尾。git commit 自治，git push 需用户确认。
+ | 4 | Git 推送（高 risk） | commit 后 push-decision 评估为 high | 输出原因，拒绝 push，要求人工 |
+ | 5 | Git 推送（中 risk） | commit 后 push-decision 评估为 medium | 单次询问，用户 y 才 push |
+ **其余一切自治**。git commit 自治；git push 由 push-decision 规则决定（low 自动 / medium 询问 / high 拒绝），公司 profile（hard_floor 含 auto_push）永远走 high 分支。
```

### 3.5 context-monitor.sh 自适应阈值

修改 `harness/hooks/context-monitor.sh:22-23`：

```diff
- readonly THRESHOLD_WARN=70
- readonly THRESHOLD_CRIT=85
+ # 阈值按 task_type 自适应（在主体逻辑里读取）
```

主体逻辑（line 99-135 替换）：

```bash
# 按 task_type 选阈值
case "${effective_task_type:-}" in
  quick)
    threshold_warn=80; threshold_crit=90 ;;
  bugfix)
    threshold_warn=70; threshold_crit=85 ;;
  feature|refactor)
    threshold_warn=60; threshold_crit=80 ;;
  *)
    # 无 task_type：保守默认（与 bugfix 同）
    threshold_warn=70; threshold_crit=85 ;;
esac

if (( pct >= threshold_crit )); then
  ... (现有 crit 输出逻辑)
elif (( pct >= threshold_warn )); then
  ... (现有 warn 输出逻辑)
fi
```

**移除 setup-harness.sh 里的"是否启用 Stop Hook"问题**——hook 启停由用户决定要不要把 snippet 加进 settings.json，setup 不再做"yes/no"问询，仅检查并打印 active/inactive。

## 4. 文件改动清单

| 文件 | 动作 | 类型 |
|------|------|------|
| `harness/setup/setup-harness.sh` | 大幅重写（删 4 个问题分支 + 修 4 bug + 加 dry-run/--apply） | 改 |
| `harness/profile-bootstrap/SKILL.md` | 新建 | 新 |
| `harness/profile-bootstrap/lib/derive.sh` | 新建（派生算法） | 新 |
| `harness/profile-entry/SKILL.md` | Step 1 加 realpath 规范化（一行） | 改 |
| `harness/profile-entry/references/profiles.md` | matcher 文档加 realpath 说明 | 改 |
| `harness/harness-common/references/push-decision.md` | 新建（规则） | 新 |
| `harness/harness-feature/SKILL.md` | line 278-280 改用 push-decision | 改 |
| `harness/harness-bugfix/SKILL.md` | line 178 同上 | 改 |
| `harness/harness-quick/SKILL.md` | commit 段同上 | 改 |
| `harness/harness-refactor/SKILL.md` | commit 段同上 | 改 |
| `harness/harness-workflow/references/autonomy.md` | line 11-14 改 risk-based 描述 | 改 |
| `harness/hooks/context-monitor.sh` | 阈值改 task_type 维度 | 改 |
| `harness/README.md` | 4.2 节去掉 setup 多步问题；加 profile-bootstrap 介绍 | 改 |
| `harness/tools/harness-pack-test` | 新增 path_glob/git_remote_regex 的合法性 check + 占位符残留 check | 改 |

## 5. 验收标准

### 5.1 自动化测试

`harness/tools/harness-pack-test` 测试矩阵：
1. valid-pack.yml 通过
2. invalid-pack.yml 仍按现有 4 类违例失败
3. **新增 fixture**：占位符残留（含 `REPLACE_ME` / `__X__`） → 失败
4. **新增 fixture**：非法 matcher 类型（`type: repo_path`） → 失败
5. **新增 fixture**：缺 detection / entry_skill / hard_floor → 失败

`harness/profile-bootstrap/lib/derive.sh` 单元测试（bash + fixture repos）：
1. 个人项目 git@github.com:user/repo.git → 派生 host=github.com / org=user / repo=repo
2. 公司项目 + origin/upstream 不一致 → abort
3. 无 git remote → path_glob-only fallback
4. symlink 路径 → realpath 规范化后匹配

### 5.2 端到端流程验证

1. `setup-harness.sh`（无 --apply）→ 仅打印检查结果，不动文件
2. `setup-harness.sh --apply`（在干净环境）→ 写出完整 schema 的 harness.yml，schema 校验通过
3. 在 `~/work/acme-api`（公司项目）跑 `/profile-bootstrap acme`：
   - 写 `~/.claude/profiles/company-acme.yml`（含 path_glob、git_remote_regex 精确锚定）
   - 写 `~/work/acme-api/.harness-profile`（内容：`company-acme`）
   - `~/work/acme-api/.gitignore` 含 `.harness-profile`
4. 下次进入该 repo，`profile-entry` 通过 marker 直接命中 `company-acme`，hard_floor 含 auto_push
5. 在该 repo 内做改动 commit 后，`harness-feature` 调用 push-decision → 因 hard_floor 含 auto_push → 直接 REFUSE
6. 在 `~/Music/myskills`（个人项目）改 README 一行 → push-decision 评 low → 自动 push
7. 在 `~/Music/myskills` 改 src/* 业务逻辑 + 测试通过 → push-decision 评 medium → 单次询问

### 5.3 Bug 回归测试

verify codex 抓出的 4 个 bug 不会复现：
1. 写出的 harness.yml 含完整 detection/entry_skill/hard_floor 字段
2. 公司模板替换不留 REPLACE_ME / __X__ 残留
3. 不再写非法 matcher 类型
4. setup 不再"silent overwrite"——dry-run 默认，--apply 显式

## 6. Out of scope

- 不动 `harness-workflow.legacy-backup-2026-04/`（旧版备份）
- 不改 root 目录的 `harness-workflow/`（用户当前 symlink 指向的旧版）
- 不实现"对话信号自动识别项目类型"（codex 否决）
- 不改 task-dispatcher / strict-reviewer / team-* skill
- 不实现多 profile 并存的 `/profile <name>` 切换（已有 fallback 机制覆盖）

## 7. 风险与缓解

| 风险 | 缓解 |
|------|------|
| profile-bootstrap 派生的 path_glob 太窄（仅 repo root），用户在 worktree 里不命中 | 输出公告时提示用户可手动加 path_glob 二级 matcher |
| push-decision 的 risk 规则误判（如某 .md 改动其实是关键文档但规则评 low） | 提供 `/no-push` flag 强制阻断；commit message 含 "wip" 自动 medium |
| autonomy.md 改了之后老用户预期被破坏 | 在 autonomy.md 顶部加 "2026-04-25 改动" 短说明 + push-decision.md 链接 |
| `.harness-profile` 自动加 .gitignore 可能被用户既有 .gitignore 风格冲突 | grep 检查唯一一行后再 append；不动既有规则 |
| Stop Hook 阈值在 quick 任务下太高（90% 已濒临崩溃） | 90% 已经留 10% 缓冲；用户可通过 env var `HARNESS_QUICK_CRIT_THRESHOLD` 覆盖 |
| codex 否决了"个人项目可自动 push"但 spec 还是采纳了 user feedback | 在 push-decision.md 顶部加 codex 异议 + 决策理由的简短记录；用户随时可加 hard_floor `[auto_push]` 关掉自动 |

## 8. Codex review session

session-id: `019dc34e-0a5e-7d80-97ef-bbf97e4d7e03`
保存路径: `.context/codex-session-id-setup-redesign`

主要反驳收敛进 §1.2、§3.2、§3.3。剩余 1 个未采纳：codex 建议"统一禁止个人项目自动 push"——本 spec 选择按 user feedback 走 risk-based，详 §3.4 末尾 + §7 风险表。
