# 迭代 Addendum — 2026-04-25 补丁轮

> 本文是 `docs/harness-iteration-2026-04-24.md`（主迭代总结）的补丁轮记录。
> 上一轮基于 Codex 5 轮审稿的 GO verdict 完成 12 Round 实施；本轮针对用户最终审核
> 发现的命名 / 降级 / 实际投放 / hook 模板缺失问题做 P0-P4 修复。

---

## 起因

上轮迭代完成后，用户和 Codex 二次审查发现几处"宣称大于交付"：

1. **命名不统一**：初始化入口叫 `team-init`（历史名），其他新 skill 都是 `harness-*` 前缀
2. **关键 bug**：`harness-workflow/skill.md` 给 profile-entry 硬塞 `forced_profile: harness` → **company-mt 永远进不去**
3. **投放实际不完整**：`harness init` 只产 15 文件（15 knowledge templates 没投 / 4 company overlay 没投 / 4 reference seed 没投）
4. **Hook 模板缺失**：`harness-workflow/references/hooks.md` 只有 hook 名字，7 个脚本正文没写
5. **第三层触发保障**（空项目自动 adopt 引导）从运行态文档消失
6. **小瑕疵**：`strict-reviewer:30` 残留"原 v0 字段"

---

## 修复 5 项（Codex P0-P4）

### P0 — forced_profile bug

**位置**：`harness-workflow/skill.md`

**问题**：代码任务转发到 profile-entry 时硬塞 `forced_profile: harness`，导致即使项目
是 company-mt（含 pom.xml + company matcher）也会被强行用 personal profile 跑，
公司 hard_floor 完全失效。

**修复**：改成 `forced_profile: null` + 明确注释只在测试钩子才传；让 profile-entry 正常
做 marker → matcher → default 解析。

### P1 — init.ts 投放扩展

**位置**：`packages/harness-cli/src/commands/init.ts`

**问题**：planFiles 函数只产 14 条通用 spec；5 domain knowledge templates（已有 15 模板文件）没投放；
company-mt preset 的 4 overlay skill SKILL.md + 4 reference seed 没投放。

**修复**：
- 新增 `knowledgeDomainSpecs(vars)` 函数 → 15 specs（5 domain × 3 file）
- 新增 `companyMtPresetSpecs(vars)` 函数 → 8 specs（preset='company-mt' 时追加）：
  - 4 overlay skill：`.claude/skills/company-{quick,bugfix,feature,refactor}/SKILL.md`
  - 2 knowledge seed：`java-rules.md` → `docs/harness/knowledge/style-and-structure/manifest.md`；`enterprise-sdk.md` → `integrations-and-sdk-usage/manifest.md`
  - 2 memory constraint seed：`approval-flow.md` → `docs/memory/constraints/harness_approval_flow.md`；`i18n.md` → `docs/memory/constraints/harness_i18n_boundaries.md`

**Smoke 结果**：
- personal：**33 files 产出** (之前 14)
- company-mt：**41 files 产出** (之前 14，+5 domain × 3 + 4 overlay + 4 seeds = +27？实际去重后 +27 - 8（overlap）= +19)

### P2 — hooks.md 7 脚本模板

**位置**：`harness-workflow/references/hooks.md`

**问题**：只列 hook 名 + settings.json 片段，7 个 hook 脚本的 bash 源码没写，用户按文档装
hook 会得到 "file not found" 错误。

**修复**：补齐 7 个脚本正文（每个可 copy-paste）：
1. `harness-workflow-reminder.sh`（UserPromptSubmit + SessionStart 注入 reminder）
2. `session-checklist.sh`（新会话就绪确认）
3. `check-dangerous.sh`（拦 `rm -rf` / `DROP TABLE` / `force push` / `reset --hard`）
4. `check-secrets.sh`（拦硬编码 API key / password / token）
5. `post-edit-reminder.sh`（inline style / 硬编码色值软 warning）
6. `pre-compact-reminder.sh`（PreCompact 提示保存状态）
7. `heartbeat-check.sh`（`.harness-status.json` 无 cronJobId → 警告 CronCreate）

### P3 — harness-init 命名统一

**位置**：新建 `harness-init/`，`team-init/` 改 alias

**问题**：`harness-*` 前缀只覆盖新叶子 skill / profile-entry / harness-common；初始化入口
仍叫 `team-init` 命名不一致。

**修复**：
- **新 skill** `harness-init/SKILL.md`（150 行）：8 步流程 = 全局依赖预检 / CLI 三级降级 / CLI 握手 / schema 双向 / 决策树 / preset 检测 / skill symlink 脚本 / 交棒
- **`team-init/SKILL.md`** 改为 31 行 **alias**：description 说明"`harness-init` 的历史名兼容"，body 透传 `Skill(harness-init)`
- `~/.claude/skills/harness-init` symlink 已装
- `harness-workflow-reminder.sh` 的 reminder 同时提两个名字

### P4 — 三层触发保障文档恢复 + 小瑕疵

**位置**：`harness-workflow/references/hooks.md` 末尾 + `strict-reviewer/SKILL.md:30`

**三层保障**（hooks.md 末尾新增章节）：
- Layer 1：SessionStart hook（`harness-workflow-reminder.sh SessionStart`）
- Layer 2：CLAUDE.md managed block（`<!-- harness-knowledge:start -->` / `<!-- harness-profile:start -->`）
- Layer 3：`harness doctor` 检 `.harness-profile` 不存在 → warn `no-profile-marker` → 引导 `harness-init`

**strict-reviewer:30**：`"原 v0 字段"` → `"审稿目标核心字段"`

---

## 连带改进（不在 Codex 必修但一起做了）

- `.harness-context.json` 生成（`detect.ts` + `init.ts:writeContext()`）缓存 buildCommand / testCommand / lintCommand
- `STATE.json` / `WALKTHROUGH.md` / `DESIGN.md` 模板（原 v0 提到但 R3-R4 没投）
- `resources/templates/root/*.template` 3 新模板 + `init.ts:planFiles` 追加对应 spec + `bundled-manifest.json` 登记

---

## 命名一致性最终状态

| 名字 | 角色 |
|------|------|
| **`harness-workflow`** | 公开工作流入口触发词（代码任务） |
| **`harness-init`** | 初始化入口（对外唯一要装的 skill） |
| **`harness-common`** | 叶子 skill 共享基础设施 |
| **`harness-{quick,bugfix,feature,refactor}`** | 4 个代码任务叶子 |
| **`harness-workflow-cli`** | npm 包名 |
| **`company-{quick,bugfix,feature,refactor}`** | company-mt profile 下的 overlay skill |
| **`profile-entry`** | 内部路由器（不对外公开触发词） |
| **`strict-reviewer`** | 审稿（含 Step 5 知识合规） |
| **`team-init`** | 历史兼容别名 → harness-init 透传 |
| **`team-{pd,architect,senior-dev,junior-dev,qa,security,commander}`** | 7 角色 skill（由 harness-feature 按需 invoke，名字历史沿用） |

决策：**新 harness 体系相关 skill 全部 `harness-*` 前缀**；**历史 `team-*` skill（pd / architect / senior-dev 等）保留原名**（它们不是 harness 特有，是通用 agent team 角色，被 harness-feature 调用而已）。`team-init` 是唯一特例（因为升级成 harness 专属入口），所以改为 alias。

---

## 四层任务分发判断

用户提的"第一层判断"问题，v1 答案：有，**四层**。

```
用户消息
  ↓
Layer 1: task-dispatcher             ← 识别多独立子任务 → 并行派发
  ↓ 每代码子任务
Layer 2: harness-workflow            ← 公开触发词，/harness-workflow（用户肌肉记忆）
  ↓ 转发
Layer 3: profile-entry               ← marker → matcher → fast-path → 优先级
  ↓ 加载 exactly ONE
Layer 4: harness-{quick|bugfix|feature|refactor} 或 company-*
           ↓ 内部 Stage
         team-pd / team-architect / strict-reviewer / team-qa / team-security / ...
```

每层职责清晰，可独立替换：
- Layer 1 task-dispatcher 可换成别的 splitter
- Layer 2 harness-workflow 是 lifecycle passthrough 层，几乎不变
- Layer 3 profile-entry 是真正的决策逻辑，未来 company / team 可以插自己的 profile
- Layer 4 叶子 skill 是实际执行者

---

## 本轮数据

- commits：6+（015073a 为 final batch commit，含 6 文件 +515/-250 行）
- 测试：87 PASS（未 regress）
- npm pack：44.9+ kB / 113+ files
- harness-init 150 行 + team-init alias 31 行
- harness-workflow/references/hooks.md 163 行（7 脚本 + settings.json + 三层保障）
- smoke: personal 33 files / company-mt 41 files（投放实证）

---

## 参考

- 主迭代总结：`docs/harness-iteration-2026-04-24.md`
- 向新用户分享文档：`docs/harness-workflow-sharing.md`（v0 深度介绍）+ `docs/harness-workflow-v1-addendum.md`（v1 升级）
- Spec：`harness-workflow/specs/2026-04-24-harness-cli-integration-design.md`
