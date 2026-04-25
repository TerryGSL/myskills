# 融合方案 V5 — 修复 Round 4 HOLD 留下的 2 处残留

> Round 4 verdict: HOLD（6/7 PASS；Item 5 fallback 披露还有 2 处残留旧文本）
> 进步轨迹：R1 全 FAIL → R2 大量 PARTIAL → R3 字句级 → R4 6/7 PASS HOLD
> Round 4 仅余 2 处 search-replace：
>   - PR 5 push-decision.md 加 §6 内容 → 改为单句指针
>   - PR 5 leaf skill skill.md commit 段落 → 改为复用单句指针
>
> V5 不引入任何新设计，仅完成这 2 处替换。

---

## A. 重写 PR 序列：8 个 PR，每个含 atomic 改动 + rollback 步骤

```
PR 0 (constants 单一来源 + CI 校验, 全局基础)
  改动:
    + packages/harness-cli/src/types/constants.ts
        export const MATCHER_TYPES = ['path_glob','git_remote_regex','file_exists'] as const
        export const HARD_FLOOR_FLAGS = ['auto_push','force_push','destructive_ops','auto_merge'] as const
        export const TASK_TYPES = ['quick','bugfix','feature','refactor'] as const
        export const PUSH_RISK_LEVELS = ['low','medium','high'] as const
    + packages/harness-cli/scripts/regen-schema.ts
        从 constants.ts 重新生成 profile.schema.json + push-decision.schema.json
        diff 校验：本地 git diff resources/schemas/ 必须为空，非空 → 提示用户 commit
    + .github/workflows/schema-drift.yml (CI 校验)
        run: npm run regen:schema && git diff --exit-code resources/schemas/
        失败：FAIL workflow，要求开发者本地跑 regen 后 commit
    +/- packages/harness-cli/src/utils/profile.ts
        switch 改用 import 的 MATCHER_TYPES 常量（删字面量）
    +/- profile-entry/references/profile-resolution.md
        顶部加 "Source of truth: packages/harness-cli/src/types/constants.ts"
        + "如本文档与 constants.ts 不一致，以代码为准"
    +/- harness/harness-common/references/push-decision.md
        同上 source-of-truth header
  Rollback:
    git revert <pr-0-sha>
    无外部依赖，纯新增 + 文档；revert 不破坏现有文件

PR 1 (contract drift cleanup, 必须先合 — 已在 V2 §A.4 描述, 增加 always 全删执行)
  改动:
    +/- harness/setup/setup-harness.sh
        write_default_yml: type: always pattern: "*" → type: path_glob pattern: "**"
    +/- harness/profile-bootstrap/SKILL.md
        Step 4 schema 校验白名单: 删 "always"
    +/- harness/profile-bootstrap/lib/derive.sh
        无引用 always (已确认), 无改动
    +/- packages/harness-cli/resources/schemas/profile.schema.json
        无改动 (已禁 always)
    +/- harness/hooks/context-monitor.sh
        顶部 comment: # requires: bash >= 3.2, python3, realpath
    +/- harness/hooks/context-monitor.sh
        修文档级误述: "无 task_type 静默退出" 段（如有）→ "无 task_type → default 70/85"
    +/- harness/setup/setup-harness.sh:185-190
        print_hook_snippet 末段 "无 task_type → 静默退出" → "无 task_type → default 70/85"
  Rollback:
    git revert <pr-1-sha>；不允许把用户 profile 改回 type: always；
    若需修复已生成文件，仅允许保持 type: path_glob 且 pattern: "**"

PR 2 (harness install 命令 + Tier 3 工具探测披露)
  改动:
    + packages/harness-cli/src/commands/install.ts
        默认行为 = "check + auto-fix"（不是 dry-run）
        --doctor 子模式 = "check only"
        --json 输出机器可读
        步骤:
          1. 校验 ~/.claude/profiles/ 存在；缺则 mkdir
          2. 检查 default.yml/harness.yml/company.yml.template 是否存在
             缺失项 atomic 写入 (mktemp + mv)
          3. 检查 ~/.claude/settings.json 是否注册固定路径 "$REPO_ROOT/hooks/context-monitor.sh"；
             文件不存在 → 写入最小合法 JSON（mktemp + mv）；
             文件存在但不是合法 JSON → 备份为 settings.json.bak.invalid 并 exit 1；
             文件存在且合法 → JSON.parse 后 merge hooks.Stop[]，写 mktemp + mv 原子替换；
             备份原文件到 settings.json.bak
          4. 检查 ~/.claude/skills/ symlink 是否就位
             未就位 → ln -sf（覆盖坏链）
          5. Tier 3 工具探测 (B.6 §3):
             which bash python3 realpath → 缺失则 warn (不 fail)
        flag 矩阵:
          | flag         | profile 写入 | settings.json 写入 | symlink 修复 | Tier 3 探测 |
          | (none)       | yes          | yes                | yes          | warn-only   |
          | --doctor     | no           | no                 | no           | warn-only   |
          | --json       | (与上述同)   | (与上述同)         | (与上述同)   | (与上述同)  |
    + packages/harness-cli/tests/commands/install.test.ts
        jest 覆盖 4 步 + 4 flag 矩阵
    +/- packages/harness-cli/src/commands/doctor.ts
        无改动 (project-scoped)
    +/- harness-init/SKILL.md
        第二步 Tier 3 章节加 B.6 工具披露文本
        第七步 symlink 改为 "harness install --doctor 校验" 替代手动 ln -sf 教程
    +/- harness/setup/setup-harness.sh
        改造为 thin wrapper (V2 §A.7 已写):
          if command -v harness >/dev/null 2>&1; then
            harness install "$@"; exit $?
          fi
          # else 走 bash fallback，且语义必须与 harness install 一致：
          # 默认 check + auto-fix；--doctor = check only；不支持 --json 时显式报错并 exit 2
  Rollback:
    git revert <pr-2-sha>
    settings.json.bak 用于恢复
    install.test.ts: 删除 jest test 不影响其他 PR

PR 3 (matcher 词汇校验增强 + placeholder residue check)
  改动:
    +/- packages/harness-cli/src/utils/profile.ts
        validateProfile(): 加 placeholder residue check
          if (yamlText.match(/REPLACE_ME|__[A-Z_]+__/)) throw...
    + packages/harness-cli/tests/fixtures/{placeholder-residue,illegal-matcher,missing-fields}-pack.yml
    + packages/harness-cli/tests/utils/profile.test.ts
        3 fixture-based jest test
  Rollback:
    git revert <pr-3-sha>; 无外部副作用

PR 4 (profile-bootstrap 显式命令 + 跨 tier 双轨)
  改动:
    + packages/harness-cli/src/commands/profile-bootstrap.ts
        硬约束:
          - require git rev-parse --is-inside-work-tree
          - require user explicit invocation (无 piggy-back from init/adopt/maintain)
          - 不自动派生 file_exists matcher
          - 公告: "Detected git toplevel: <path>; About to derive matcher
                   for the WHOLE REPO (not packages/foo); Continue? [y/N]"
    + packages/harness-cli/src/utils/derive.ts (移植 derive.sh + 用 constants 类型)
    + packages/harness-cli/tests/utils/derive.test.ts (jest 9 个测试)
    +/- harness-init/SKILL.md
        第五步决策树加 "建公司 profile → harness profile-bootstrap company-mt --slug acme"
    +/- harness/profile-bootstrap/SKILL.md
        Step 1 加引用: "运行时优先调 harness profile-bootstrap CLI；
                       Tier 3 才 source lib/derive.sh"
        Step 4 白名单: path_glob | git_remote_regex | file_exists（已对齐 PR 0/1）
    +/- harness/profile-bootstrap/lib/derive.sh
        保留不删（Tier 3 fallback + 测试 oracle）
    + harness/profile-bootstrap/lib/test-derive.bats (转 bats; 现有 test-derive.sh 保留)
    + harness-init/SKILL.md
        第二步 Tier 3 章节明确写: "无 node 时调 lib/derive.sh，需 bash + realpath"
  Rollback:
    git revert <pr-4-sha>
    derive.sh / test-derive.sh 保留不变，bats 仅是新增测试
    decision tree change 可独立 revert

PR 5 (push-check 命令 + 跨 tier 双轨契约)
  改动:
    + packages/harness-cli/src/commands/push-check.ts
        完整复刻 HIGH/MEDIUM/LOW 三档 (REFUSE / 单次询问 / 自动 push)
        --json 输出 { level, reasons[], action: 'refuse'|'ask'|'auto', exit_code: 0|1|2 }
    + packages/harness-cli/src/utils/push-decision.ts
        移植 push-decision.md 规则到 TS, 用 constants.PUSH_RISK_LEVELS
    + packages/harness-cli/resources/schemas/push-decision.schema.json
        生成自 PR 0 constants
    + packages/harness-cli/tests/commands/push-check.test.ts
    +/- harness/harness-common/references/push-decision.md
        移到顶层 harness-common/references/push-decision.md
        Source of truth header (PR 0)
        加 §6: "Tier 3 fallback rules: see harness-init/SKILL.md#第二步"
    +/- harness/harness-workflow/references/autonomy.md
        第 4 项改 risk-based + 链接到顶层 push-decision.md
    +/- harness-{quick,bugfix,feature,refactor}/skill.md
        commit 段落改为: "调 harness push-check；Tier 3 fallback rules: see harness-init/SKILL.md#第二步"
  Rollback:
    git revert <pr-5-sha>
    push-decision.md 顶层版备份在 PR 5 commit history
    leaf skill skill.md 改动可独立 revert

PR 6 (context-monitor 自适应迁顶层 hooks/ + 用户已注册迁移)
  改动:
    +/- hooks/context-monitor.sh (顶层位置)
        替换为 harness/hooks/context-monitor.sh 自适应版本
        SCRIPT_PATH 固定为 "$REPO_ROOT/hooks/context-monitor.sh"
        （用户 settings.json 已注册同一个绝对路径，无需迁移）
    +/- harness-workflow/references/hooks.md
        模板段同步到自适应版本
    + 用户迁移:
        发布 note: "PR 2 后已用 harness install 注册的用户，PR 6 后无需重新注册
                    （hook 脚本路径稳定）；只需 git pull 让脚本内容生效"
    +/- harness/hooks/context-monitor.sh
        变成 symlink → ../../hooks/context-monitor.sh；不允许 "或 stub 文件" 二选一
        防止旧 setup-harness.sh wrapper 引用断链
  Rollback:
    git revert <pr-6-sha>
    顶层 hooks/context-monitor.sh 回退到原内容
    用户已注册的 hook 路径仍稳定，不需要回滚 settings.json

PR 7 (清理嵌套 harness/)
  改动:
    + 校验脚本 scripts/check-nested-harness-refs.sh
        grep -rl "harness/setup\|harness/hooks\|harness/profile-bootstrap" 排除 .legacy-backup
        必须 0 hit 才能继续
    -/+ rm -rf harness/setup/  (setup-harness.sh wrapper 已被 PR 2 install 替代)
    -/+ rm -rf harness/hooks/  (PR 6 已迁顶层 + symlink)
    -/+ rm -rf harness/profile-bootstrap/  (PR 4 已迁 CLI; bash 版迁 packages/harness-cli/scripts/legacy/)
    -/+ rm -rf harness/harness-common/references/push-decision.md  (PR 5 已迁顶层)
    -/+ rm -rf harness/harness-workflow/references/autonomy.md  (PR 5 已迁顶层)
    -/+ rm -rf harness/harness-{quick,bugfix,feature,refactor}/SKILL.md  (顶层已有 skill.md)
    -/+ 保留 harness/docs/superpowers/specs/, plans/  作为历史档案
  Rollback:
    git revert <pr-7-sha>
    所有删除文件可恢复 (git history 完整保留)
    若 revert 后引用断链，跑 scripts/check-nested-harness-refs.sh 验证
```

---

## B. 修复 Round 2 8 个具体缺项

| # | Round 2 抓出问题 | V5 哪里修了 |
|---|----|----|
| 1 | constants.ts 没进 PR 序列 | PR 0（新增），含 schema 自动生成 + CI workflow |
| 2 | Tier 3 披露没进 PR 序列 | PR 2 install.ts step 5 + harness-init/SKILL.md 第二步；PR 4 derive 部分；PR 5 push-decision.md §6 fallback 披露 |
| 3 | harness install 默认行为模糊 | PR 2 flag 矩阵明确：default=check+auto-fix / --doctor=check only / --json=机器可读 |
| 4 | settings.json 修复不闭环 | PR 2 step 3：atomic merge JSON 注册段 + .bak 备份 |
| 5 | constants.ts 缺 CI 校验 | PR 0 含 .github/workflows/schema-drift.yml |
| 6 | PR 2 vs PR 6 hook 迁移错位 | PR 6 显式声明 SCRIPT_PATH 稳定 + 用户 note + harness/hooks/ 改 symlink |
| 7 | fallback 披露规则零散 | 唯一权威源 = harness-init/SKILL.md 第二步 Tier 3 章节；wrapper / CLI help / leaf skill 只复用同一句指针文案 "Tier 3 fallback rules: see harness-init/SKILL.md#第二步" |
| 8 | 回滚机制 FAIL | 每个 PR 都加 Rollback 段（见 §A）；§E 总规则 |

---

## C. 行为闭环表（Round 2 标 PARTIAL 的，V5 全部转 PASS）

### C.1 收敛要点 ① constants.ts 单一来源
- 对应 PR：**PR 0**（新增）
- 强制同步：`scripts/regen-schema.ts` + CI workflow `git diff --exit-code`
- 消费者：`utils/profile.ts` switch / `derive.ts` / `push-decision.ts` / `install.ts` / `push-check.ts` 全部 import constants（所有顶层 leaf skill 引用 markdown 中的常量也用 source-of-truth header）
- markdown 通过 source-of-truth header 约束，不在本轮新增 grep CI

### C.2 收敛要点 ② harness install 流程
- 默认行为：**check + auto-fix**（不是 dry-run，dry-run 只在 --doctor 子模式）
- 4 步全闭环：profile dir mkdir / yml 缺失原子写 / settings.json hook 原子 merge / symlink 修复
- atomic write 保证：所有写文件用 mktemp + mv；settings.json 修改前自动 .bak

### C.3 收敛要点 ④ Tier 3 披露规则统一（唯一规范）
- **唯一规范文本**：`harness-init/SKILL.md` 第二步 Tier 3 章节
- **wrapper / CLI help / leaf skill 只允许复用同一句指针文案**：
  `Tier 3 fallback rules: see harness-init/SKILL.md#第二步`
- 不允许各处自定义披露文本；不允许通过 `[fallback-disclosure]` commit tag 关联（已撤回）
- 探测点：`harness install --doctor` 检查 bash + python3 + realpath，三缺一就 warn

### C.4 edge case 2 constants 单一来源 → 现已是 PR 0 主体（参 §A）

### C.5 edge case 3 shell fallback 不便携 → 现已写进 PR 2 step 5 + harness-init Tier 3 章节（参 §A）

### C.6 收敛要点 ⑥ 回滚机制 → 见 §E

---

## D. 实施顺序最终硬约束

```
PR 0 (constants + CI)              ─┐
PR 1 (contract drift cleanup)       │  必须按顺序合并；
PR 2 (harness install)              │  跨 PR 不允许并行；
PR 3 (matcher validation)           │  每个 PR 必须 jest test 全绿
PR 4 (profile-bootstrap CLI)        │  + bash test 全绿
PR 5 (push-check CLI)               │
PR 6 (context-monitor 迁移)         │  才能合下一个
PR 7 (嵌套 harness/ 清理)         ─┘  最后
```

每个 PR 在 commit message 体加 `[depends on: PR N-1]` tag（除 PR 0）。

---

## E. 回滚机制（Round 2 FAIL → V5 PASS 必须）

### E.1 每个 PR 的回滚步骤已写在 §A 的"Rollback:"段

### E.2 失败恢复路径

| 失败场景 | 触发 | 恢复 |
|---|---|---|
| PR 0 schema CI 报 drift | 开发者本地未跑 `npm run regen:schema` | CI 输出 diff，开发者本地重跑 + commit |
| PR 1 setup-harness.sh 输出过 always 类型 default.yml 给老用户 | 用户已用旧 setup 跑过 | PR 1 commit body 含一行升级脚本：`grep -l "type: always" ~/.claude/profiles/*.yml \| xargs sed -i'.bak' 's/type: always.*$/type: path_glob\n      pattern: "**"/'` |
| PR 2 install 写 settings.json 失败（权限/磁盘满） | atomic mv 失败 | 输出 .bak 路径 + 退出码 1；用户手动 `cp settings.json.bak settings.json` |
| PR 4 profile-bootstrap 派生公告"Continue? [y/N]"用户拒绝 | n 输入 | 输出"取消，未写任何文件"；exit 0 |
| PR 5 push-check 检测 hard_floor 含 auto_push → REFUSE | 公司 profile | 输出"Push: REFUSED (公司 profile hard_floor)"；exit 2 |
| PR 6 用户的旧 settings.json 注册了 harness/hooks/context-monitor.sh 路径，迁移后断链 | PR 6 把脚本迁到顶层 hooks/ | PR 6 在 harness/hooks/context-monitor.sh 留 symlink → ../../hooks/context-monitor.sh，老路径仍可用 |
| PR 7 嵌套 harness/ 删除后用户 `git pull` 找不到老引用 | 用户 fork 维护了某些老引用 | scripts/check-nested-harness-refs.sh 在 PR 7 之前 0 hit 才合；PR 7 commit body 写"如需恢复，git revert <sha>" |

### E.3 总则
- 所有 PR 必须 atomic：一个 commit 完成一个完整功能（含 test）
- 所有写文件用 mktemp + mv（user-global 文件 + project 文件都遵守）
- 所有破坏性改动（rm / 改 ~/.claude/）必须有 .bak 备份或 git history
- CI workflow 必须 cover schema drift / shell test / jest test 三项

---

## F. V5 修正声明（Round 5 verdict 申请）

V5 仅做 2 处 search-replace，照抄 codex Round 4 HOLD 修正：

1. `/tmp/fusion-v4.md:152-153` 多行旧文本 → `加 §6: "Tier 3 fallback rules: see harness-init/SKILL.md#第二步"` ✓
2. `/tmp/fusion-v4.md:157` → `commit 段落改为: "调 harness push-check；Tier 3 fallback rules: see harness-init/SKILL.md#第二步"` ✓

无任何其他改动。本轮申请 PASS / approved for implementation。

---

## F-archive. V4 修正声明（保留供审查溯源）

V4 字句修正全部直接照抄 codex Round 3 给的 6 处具体修正：

1. **settings.json 三态分支**：missing → 写最小合法 JSON；malformed → 备份 .bak.invalid + exit 1；valid → atomic merge（PR 2 步骤 3）
2. **wrapper bash fallback 语义对齐**：明示与 `harness install` 一致（默认 check+auto-fix / --doctor=check only / --json 不支持时 exit 2）（PR 2 改造段）
3. **hook 路径定死**："$REPO_ROOT/hooks/context-monitor.sh"（PR 2 步骤 3 + PR 6 SCRIPT_PATH）
4. **PR 6 symlink 唯一**：删除"或 stub 文件"二选一，只允许 symlink（PR 6 改动段）
5. **fallback 披露唯一规范源**：harness-init/SKILL.md 第二步；wrapper/CLI help/leaf skill 仅复用同一句指针文案（§B 表第 7 行 + §C.3 重写）；删除 `[fallback-disclosure]` commit tag
6. **PR 1 rollback 不矛盾**：不允许改回 type: always，仅允许保持 type: path_glob pattern: "**"（PR 1 Rollback 段）
7. **grep CI 承诺归宿**：删除（§C.1 改为 "不在本轮新增 grep CI"；PR 5 实施顺序段删除 "+ 文档 grep CI 通过"）

V4 不引入任何新设计，仅字句级。

请 Round 4 重审。本轮申请 PASS。如还有 issue，请明示 file:line + 字句修正。
