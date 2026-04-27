# 接入指南 — Claude Code + Codex CLI

> 本文档讲清两件事：
> 1. **怎么把 myskills 接到你的 Claude Code 和 Codex CLI**（一次配置，两边共享）
> 2. **怎么保证每次对话都自动触发** task-dispatcher → harness-workflow → leaf skill 三层路由（不需要每次手动 invoke）

---

## 0. 前提

```bash
# clone 仓库
git clone git@github.com:TerryGSL/myskills.git ~/Music/myskills

# 装 npm CLI（推荐）
cd ~/Music/myskills/packages/harness-cli
npm install && npm run build && npm link
which harness   # → /usr/local/bin/harness
```

无 npm 环境？走 [`docs/setup-without-cli.md`](setup-without-cli.md)（Tier-3 fallback，纯 bash）。

---

## 1. Claude Code 接入

### 1.1 一键 install（推荐）

```bash
harness install         # check + auto-fix（默认）
harness install --doctor  # 仅检查不改
```

会做 5 件事：

1. 创建 `~/.claude/profiles/` 目录
2. 写入 3 个 profile YAML（`default.yml` / `harness.yml` / `company.yml.template`）
3. 在 `~/.claude/settings.json` 注册 Stop hook（`context-monitor.sh`）
4. 把 myskills 顶层 22 个 skill symlink 到 `~/.claude/skills/<name>`
5. 验证 Tier-3 fallback 工具（bash / python3 / realpath）

跑完输出 `status: ok` 就行。

### 1.2 关键：让每次对话自动触发路由

`harness install` 默认只装 Stop hook。要让**每条用户消息**都触发 harness 路由提醒，需要手动加两个 hook 到 `~/.claude/settings.json`：

#### SessionStart hook（对话开始注入完整 [HARNESS] 三层架构提示）

```json
"SessionStart": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "cat ~/.claude/skills/harness-workflow/session-init-prompt.txt 2>/dev/null || true"
      }
    ]
  }
]
```

#### UserPromptSubmit hook（每条消息前注入精简 [HARNESS-ROUTER] 提醒）

```json
"UserPromptSubmit": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "/Users/twelve/Music/myskills/hooks/user-prompt-router-reminder.sh"
      }
    ]
  }
]
```

> **路径替换**：把 `/Users/twelve/Music/myskills/` 替换成你的 clone 路径。

### 1.3 完整的 settings.json hooks 段（参考样板）

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "cat ~/.claude/skills/harness-workflow/session-init-prompt.txt 2>/dev/null || true" }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "/Users/twelve/Music/myskills/hooks/user-prompt-router-reminder.sh" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "/Users/twelve/Music/myskills/hooks/context-monitor.sh" }
        ]
      }
    ]
  }
}
```

如果已有别的 hook（比如 superset notify.sh），保留并 **append** 即可（hooks 是数组，可以多个 command 共存）。

### 1.4 验证

```bash
harness doctor --json
```

期望输出 `"exitCode": 0` 或仅 warn 级别（无 error）。

然后**重启 Claude Code session**，看新会话开头是否注入 `[HARNESS] 本会话已接入 Harness 三层架构...` 那段（SessionStart hook 生效的标志）。

---

## 2. Codex CLI 接入

Codex CLI 与 Claude Code 共用同一套 skill / contracts / hook 脚本，只是配置位置不同。

### 2.1 Symlink 22 个 skill 到 `~/.codex/skills/`

```bash
for s in profile-entry harness-common harness-quick harness-bugfix harness-feature \
         harness-refactor harness-init task-dispatcher strict-reviewer harness-workflow \
         team-pd team-architect team-senior-dev team-junior-dev team-qa team-security \
         team-init team-commander investigate office-hours \
         careful freeze guard unfreeze; do
  ln -sfn "$HOME/Music/myskills/$s" "$HOME/.codex/skills/$s"
done
```

### 2.2 ⚠️ 关键限制：Codex 只读项目级 AGENTS.md

经 codex 实测验证：**`~/.codex/AGENTS.md`（user-global）不会被 Codex 自动加载**，Codex 只读 cwd 下的 `AGENTS.md`（项目级）。所以方案是：在**每个**你想用 harness 的项目根放一份 AGENTS.md。

**方案 A — symlink 到 myskills 顶层 AGENTS.md（推荐，跟随更新）：**

```bash
cd ~/your-project
ln -sfn ~/Music/myskills/AGENTS.md AGENTS.md
```

**方案 B — 复制（独立副本，不会被 myskills 更新覆盖）：**

```bash
cd ~/your-project
cp ~/Music/myskills/AGENTS.md AGENTS.md
# 之后可以按需要给当前项目加自定义规则
```

**方案 C — myskills 自己工作时**：myskills repo 根已有 `AGENTS.md`（86 行 7 kernel rules），cwd 在 myskills 时 codex 自动加载，无需额外操作。

> **不要**只写 `~/.codex/AGENTS.md` —— 它在 home-level 不会被 codex 读，等于死文件。
>
> `wrappers/codex/AGENTS.md` 在 myskills repo 里仅作为 source of truth 备份，不要直接靠它生效。

### 2.3 配置 `~/.codex/hooks.json`

格式与 Claude 的 settings.json hooks 段一样：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "cat /Users/twelve/Music/myskills/harness-workflow/session-init-prompt.txt 2>/dev/null || true" }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "/Users/twelve/Music/myskills/hooks/user-prompt-router-reminder.sh" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "/Users/twelve/Music/myskills/hooks/context-monitor.sh" }
        ]
      }
    ]
  }
}
```

### 2.4 验证（含 sentinel 实证测试）

#### 基础验证

启动 Codex CLI（在有 AGENTS.md 的项目 cwd 下），看 session 开头是否注入 `[HARNESS]` 提示。

#### Sentinel 实证测试（确认 hook stdout 真的进 model context）

如果不确定 SessionStart / UserPromptSubmit hook 的 stdout 是否真的注入到模型 context（而不是仅写日志），用 sentinel 字符串测一下：

```bash
# 临时改 hook 命令为 echo sentinel
# ~/.codex/hooks.json 的 UserPromptSubmit 改成：
#   "command": "echo 'SENTINEL_PROMPT_HOOK_FIRED_$(date +%s)'"
```

启动 Codex，发"今天几号？"。看 AI 输出里是否出现 `SENTINEL_PROMPT_HOOK_FIRED_*` 字串：
- 出现 → hook stdout 确实注入了 model context（路由方案 work）
- 不出现 → hook 只是侧边日志，路由方案需要换成项目级 AGENTS.md（方案 A 已经覆盖了这种 fallback）

> Claude Code 的 SessionStart hook 已经实证 work（你能在新 session 开头看到 `[HARNESS] 本会话已接入 Harness 三层架构` 那段）。Codex 的需要自己测一下。

---

## 3. 三层路由触发原理

### Hook 触发流程

```
用户启动 IDE
  ↓
SessionStart hook 触发
  ↓ stdout 被注入到 system context
[HARNESS] 完整三层架构提示（4.4K，56 行）

用户发第 1 条消息
  ↓
UserPromptSubmit hook 触发
  ↓ stdout 被注入到 user 消息前
[HARNESS-ROUTER] 5 行精简提醒
  ↓
AI 看到提醒 → 隐式 L0 评估子任务数（脑内）：
  ≥2 子任务 → 显式 Skill(task-dispatcher) 加载派发协议 → 派 sub-agent 并行
  单任务   → 跳过 task-dispatcher，进 L1：
              业务代码 → Skill(harness-workflow) → leaf skill
              生命周期 → harness <cmd>
              纯查询  → 直接答（不进 L1）

用户发第 2/3/N 条消息（同上）

每次 AI 回应结束（"心跳" hook）
  ↓
Stop hook 触发 → context-monitor.sh
  ↓ 读 .harness-status.json 的 effective_task_type 字段
  ↓ 按 task_type 用对应阈值
  ↓
当 context 占用 ≥ 阈值 → 输出 ⚠️ 警告 / ⛔ 临界提示
  阈值（warn / crit）：
    quick:           80% / 90%（小任务，提醒晚一点）
    bugfix:          70% / 85%
    feature/refactor: 60% / 80%（长任务，提醒早一点）
    其他/未知:        70% / 85%
  支持 HARNESS_QUICK_WARN_THRESHOLD 等 env var 覆盖默认值
```

### 为什么需要两个 hook（不能只用 SessionStart）

- **SessionStart 只触发一次**，session 长了或 auto-compact 后，那段提示在 context 里被稀释，AI 可能"忘记"走路由
- **UserPromptSubmit 每条消息都触发**，精简提醒确保铁律每轮被刷新（不重复完整内容，避免 token 浪费）
- **Stop hook（心跳）**每次 AI 回应结束触发，按 task-type 自适应阈值监控 context 压力——长任务（feature/refactor）提醒早，避免接近 cap 时还在干重活；小任务（quick）提醒晚，避免过度打扰
- **PreToolUse hook（router-enforcer）真技术强制**：业务代码 Edit/Write 之前若没调 Skill(harness-workflow) → exit 2 阻止工具调用。这是 hard gate，AI 跳不过
- 四层叠加保证：长 session 也不会失效，复杂代码任务（feature/refactor）有早期警告 + 业务代码强制走 harness-workflow

### PreToolUse Router Enforcer（hard gate）

soft 提醒（注入）有局限——AI 看了 N 次会麻木跳过。`router-enforcer.sh` 是**技术强制**：

```
AI 试图调 Edit / Write
  ↓
PreToolUse hook 自动触发（绕不过）
  ↓
检查文件路径是否在白名单（docs/ / hooks/ / *.md / 配置 / .harness* 等）
  ├─ 命中白名单 → exit 0 允许（运维 / 文档不强制）
  └─ 业务代码（src/*.ts、app/*.py 等）
       ↓
     检查 transcript 最近 200 行有没有 Skill(harness-workflow / harness-init / 4 个 leaf)
       ├─ 有 → exit 0 允许
       └─ 没有 → exit 2 + stderr 输出指引 → 工具被阻止
```

**白名单**：文档 (\*.md / docs/ / wrappers/) / hook 脚本 (hooks/) / 配置 (settings.json / hooks.json / config.toml) / 状态文件 (.harness*) / 包管理 (package.json / tsconfig*) 等运维路径不拦。

**临时旁路**：`HARNESS_ENFORCER=off` 环境变量关闭（开发者调试用）。

**配置**（已在 §1.3 / §2.3 hooks 段加入，参考样板）：

```json
"PreToolUse": [
  {
    "matcher": "Edit|Write",
    "hooks": [
      { "type": "command", "command": "/Users/twelve/Music/myskills/hooks/router-enforcer.sh" }
    ]
  }
]
```

**fail-open 设计**：JSON parse 失败 / transcript 不可读 → exit 0 放过（避免误锁正常工作）。这是 trade-off：宁可漏拦一次，也不锁死整个工作流。

**注意 task-dispatcher 没有 hard gate**：Agent tool 派 sub-agent 时机太晚（PreToolUse 时已经准备调用了），现实里靠注入 + feedback memory 两层 soft enforcement。所以 ≥2 子任务时**主动 Skill(task-dispatcher)** 仍是 AI 自觉行为。

### 复杂代码任务的三层监控机制

对于长 session、L/XL 级 feature 实施（多 Stage、>2 小时持续工作），harness 提供三层监控：

#### 第 1 层：每轮心跳（Stop hook，事件驱动）

每次 AI 完成回应触发 `context-monitor.sh`，按 task_type 给阈值化警告：

| task_type | warn / crit |
|-----------|-------------|
| quick | 80% / 90%（小任务，晚提醒）|
| bugfix | 70% / 85% |
| feature / refactor | 60% / 80%（长任务，早提醒）|

前提：项目有 `.harness-status.json`（跑过 `harness init` / `adopt`）。无该文件时 hook silent exit 0。

#### 第 2 层：CronCreate 实时心跳（wallclock 定时，Claude Code 内置）

L/XL Round 启动时自动创建 cron 任务，周期输出进度表，**用户无需主动询问就能看到当前状态**。完整契约见 [`harness-workflow/references/monitoring.md`](../harness-workflow/references/monitoring.md)。

```
Round 开始（Stage 2 前）
    → CronCreate（初始 5 min 频率）
    → 写 cronJobId 到 .harness-status.json
        ↓
进 Stage 3（多 Agent 并行，状态变化快）
    → CronDelete + CronCreate（2 min）
        ↓
离开 Stage 3
    → CronDelete + CronCreate（5 min）
        ↓
Stage 8 收尾
    → CronDelete（无条件执行，即使 cronJobId 丢失也列所有 cron 删）
    → 删除 .harness-status.json
```

每次心跳读 `.harness-status.json` 输出进度表（极简 prompt，~230 token / 次）：

```
🔄 Round 3 — 弹性层改进 (已运行 8 分钟)

Stage   Agent          状态        耗时
────────────────────────────────────────
0       team-pd        completed   90s
3       senior-dev     running     ...
4       strict-reviewer pending
```

**防泄漏保障**：
1. Stage 8 无条件 CronDelete（即使 cronJobId 丢失也列所有 cron 删）
2. `.harness-status.json` 在 `.gitignore`（不进 git）
3. 异常中断（用户手动停止）下次启动检测残留 → 清理旧 cron + 删除文件

> **CronCreate 是 Claude Code 内置工具**，session-only 默认（in-memory，session 结束自动清掉；可选 `durable: true` 持久到 `.claude/scheduled_tasks.json`）。不依赖 OS 级 cron / launchd。

#### 第 3 层：持久化状态（断点续接）

所有进展实时写入：
- `.harness-status.json` — Round 元数据 + Stage 状态 + cronJobId
- `docs/STATE.json` — 跨 session 的工作流状态
- `WALKTHROUGH.md` — 当前 session 决策日志
- `docs/memory/cases/*.md` — 提取出的可复用 lesson

session 触发 context cap 时，新开 session 后 AI 读这些文件就能续接上下文，**不丢工作**。

---

> **三层联动逻辑**：第 1 层（Stop hook）每轮检查 context 占用 → 接近 cap 时让 AI 主动 split session；第 2 层（CronCreate）周期输出进度让用户看见；第 3 层（持久化）保证 split session 后能续接。

---

## 4. 共享文件 vs 工具私有文件

| 文件 | 谁用 | 路径 | 来源 |
|------|------|------|------|
| 22 个 skill 目录 | Claude + Codex | `~/.claude/skills/` 和 `~/.codex/skills/` 都 symlink 到 `~/Music/myskills/<name>` | myskills repo |
| `session-init-prompt.txt` | Claude + Codex 都 cat | `~/Music/myskills/harness-workflow/session-init-prompt.txt` | myskills repo |
| `user-prompt-router-reminder.sh` | Claude + Codex 都跑 | `~/Music/myskills/hooks/user-prompt-router-reminder.sh` | myskills repo |
| `context-monitor.sh` | Claude + Codex 都跑 | `~/Music/myskills/hooks/context-monitor.sh` | myskills repo |
| `~/.claude/settings.json` | Claude 私有 | 用户全局 | 手写（参 §1.3 样板）|
| `~/.codex/hooks.json` | Codex 私有 | 用户全局 | 手写（参 §2.3 样板）|
| `~/.codex/AGENTS.md` | Codex 私有 | 用户全局 | 来自 `wrappers/codex/AGENTS.md`（cp 或 symlink）|

> 改 myskills repo 里的文件，两个工具同时生效（symlink 直接跟随；hooks 脚本 cat 时读取最新内容）。

---

## 5. 故障排除

### Q1: 重启 session 后没看到 [HARNESS] 提示

```bash
# 1. verify 文件存在
ls -l ~/Music/myskills/harness-workflow/session-init-prompt.txt

# 2. verify hook 配置
python3 -c "import json; print(json.dumps(json.load(open('~/.claude/settings.json'.replace('~',__import__('os').path.expanduser('~'))))['hooks']['SessionStart'], indent=2, ensure_ascii=False))"

# 3. 手动跑 hook 看输出
cat ~/Music/myskills/harness-workflow/session-init-prompt.txt
```

### Q2: 用户发消息没有 [HARNESS-ROUTER] 提醒

```bash
# 1. verify 脚本可执行
ls -l ~/Music/myskills/hooks/user-prompt-router-reminder.sh
test -x ~/Music/myskills/hooks/user-prompt-router-reminder.sh && echo OK

# 2. 手动跑看输出
~/Music/myskills/hooks/user-prompt-router-reminder.sh

# 3. verify hook 配置（同 Q1 但查 UserPromptSubmit）
```

### Q3: skill 不加载（说"修个 bug"没路由）

```bash
# 1. verify 22 个 skill 全部 symlink 到 myskills
for s in harness-workflow harness-bugfix task-dispatcher; do
  echo "$s -> $(readlink ~/.claude/skills/$s)"
done

# 2. 跑 doctor
harness doctor --json

# 3. 重新 install（auto-fix 修复死链）
harness install
```

### Q4: 公司项目 hard_floor 没生效

```bash
# 1. verify .harness-profile marker 存在
cat .harness-profile

# 2. 派生 company profile（首次接入）
harness profile-bootstrap <slug>

# 3. verify ~/.claude/profiles/company-<slug>.yml 包含 hard_floor 列表
cat ~/.claude/profiles/company-<slug>.yml | grep -A5 hard_floor
```

### Q5: hooks.json 改完不生效

- Claude Code：完全重启 session（`Cmd+Q` + 重开），配置不会热加载
- Codex CLI：退出当前 session 重新 `codex` 启动

---

## 6. 一键卸载（恢复默认）

```bash
# 删 Claude symlinks
for s in profile-entry harness-common harness-quick harness-bugfix harness-feature \
         harness-refactor harness-init task-dispatcher strict-reviewer harness-workflow \
         team-pd team-architect team-senior-dev team-junior-dev team-qa team-security \
         team-init team-commander investigate office-hours \
         careful freeze guard unfreeze; do
  unlink ~/.claude/skills/$s 2>/dev/null
  unlink ~/.codex/skills/$s 2>/dev/null
done

# 手动清 hooks 段（编辑 ~/.claude/settings.json + ~/.codex/hooks.json，删 harness 相关 entry）
# 删 ~/.codex/AGENTS.md（如不想用了）
```

---

## 7. 下一步

- 读 [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) 了解完整架构 + 每个 skill 干啥
- 读 [`harness-common/contracts/`](../harness-common/contracts/) 了解 17 份 narrative contract
- 跑 `harness scan --json` 让 AI 扫一遍项目知识

---

## 8. 设计要点

- **两个工具共用一份 source of truth**：myskills repo 里的 skill / hook 脚本 / session-init-prompt.txt 改一次，两个工具自动跟随
- **私有配置只放工具特定的入口**：`~/.claude/settings.json` 和 `~/.codex/hooks.json` 只引用 myskills 路径，不重复内容
- **hook 是强制提醒，不是路由器**：路由真正的逻辑在 `harness route` CLI 或 `profile-entry` markdown，hook 只是把规则刷进 AI 的 context
- **AGENTS.md 是 Codex 的主要保险**：因为 Codex 不读 home-level AGENTS.md，每个项目的 cwd 都要有 AGENTS.md（symlink 方案 A 最省事）。即使 hook stdout 不注入 model context，AGENTS.md 也保证规则被加载

## 9.8 Round 5 — Init 最小化 + Scanner 不假塞 placeholder（2026-04-28）

用户反馈："`harness init` 在公司项目里塞了一堆奇怪的目录（i18n / internal-components 等），都是我没说的内容。目录可以建、文件骨架可以建，但**别先塞硬规则、具体业务内容**。真规则要走 `harness scan` 扫描后沉淀"。

### 改动

**A. `harness init` 不再 seed 业务规则**（commit `ba3a3f8`）

- `init.ts knowledgeDomainSpecs()`：删 5 个硬编码 domain（i18n-and-text-boundaries / internal-components / etc）。改为 1 个通用 `_example/{manifest,evidence,gaps}.md.example` 骨架。
- `init.ts companyMtPresetSpecs()`：删 4 个 reference seeds（java-rules → manifest / approval-flow → constraints / 等）。仅保留 4 个 overlay skill SKILL.md（skill 骨架非业务规则）。
- 模板内容：`_example/*.md.template` 仅含 frontmatter + 注释 + Rules block placeholder，**无具体业务规则**。明示「真规则由 `harness scan` 自动沉淀」。

**B. `scanKnowledge` 默认不假塞空 placeholder**（commit `6925901`）

- empty project 跑 `harness scan --json` → `domains: []`（之前 5 个空 placeholder）
- detector 探测无证据 → 不 emit 该 domain
- 加 `includeEmpty: true` 选项保持向后兼容

**C. company-mt preset 文档同步**（commit `2426359`）

- `company-feature/SKILL.md` Strategy B：删"init 时 from java-rules.md seed"假设，改为"按需手动 enable（scan / 复制 / 改名 _example）"
- `degraded-fallback.md` Strategy B：标题改为"手动启用的本地 manifest 保底"，加分支"manifest 不存在 → 进 Strategy C"

### 实证

- jest 169/169 PASS（新增 includeEmpty 测试）
- 实测 `harness init` 仅生成通用骨架（docs/memory/{cases,decisions,constraints,archive}/.gitkeep + INDEX.md / TODO.md / `_example/` + 入口文件）
- 实测 `harness scan --json` 在空项目 → `{domains: []}`

### Codex 4 round audit 全部闭环

| Q | 验证 |
|---|------|
| Q1 init 行为正确 | ✅ |
| Q2 _example 不被误读 | ✅ status: example + 充分注释 |
| Q3 company-feature/SKILL.md 同步 | ✅ |
| Q4 scanner 不假塞 | ✅ default 0 / includeEmpty=true 兼容 |
| Q5 degraded-fallback.md 同步 | ✅ |

### Follow-up（spec 1 重写）

未改 — 待 `docs/superpowers/specs/2026-04-23-project-knowledge-scanner-design.md` 改写"动态 domain detection"语义后再同步：

- `harness-feature/prompts/scanner-prompts.md`（subagent prompt 仍按硬编码 5 domain 写）
- `harness-common/contracts/knowledge.md`（contract 表 L51-55 列 5 个 hardcoded domain 激活条件）
- `strict-reviewer/SKILL.md` 教学示例（仍引用 style-and-structure / internal-components）

> 这些是 scanner pipeline 内部 prompt + 教学示例，改了会破坏现有 Stage -0.5 subagent 流程，需 spec 1 v2 重写后系统性同步。

---

## 9.7 Round 4 — 智能注入 + Karpathy + Judge agent + Cost Budget（2026-04-26）

应用了 codex round 3 落地反馈 + Karpathy skill 仓库启发 + 用户对 token / 流程合理性的深度反思：

### A. UserPromptSubmit 智能判定（codex 方案 2）

`hooks/user-prompt-router-reminder.sh` 加判定逻辑：

| 条件 | 注入内容 | token cost |
|------|---------|-----------|
| 像代码任务 + 最近未路由 | **完整版**（路由 + hard gate + 主动用工具）| ~200 tokens |
| 像代码任务 + 最近已路由 | **轻量版**（只剩主动用工具提醒）| ~60 tokens |
| 纯查询 / 解释 | **精简版**（提醒主动用工具，不进 L1）| ~80 tokens |

判定规则：
- 关键词检测（中英 fix/修/加/改/重构/debug + 代码 fence + src/.ts 路径）
- transcript 最近 100 行查 Skill(harness-*) 调用

旁路：`HARNESS_REMINDER=off`

收益：长 session 50 turn 节省 30-50% UserPromptSubmit token。

### B. SKILL.md 稳定头 + 动态尾（codex 方案 1）

6 个核心 SKILL.md 重排：稳定头（触发 / 输入契约 / 硬边界 / 流程 outline）放前面 cache 友好；动态尾（详细步骤 / prompt 模板 / fallback / 引用）放后面按需。

完成清单：harness-{workflow,feature,init,common,bugfix,refactor}/SKILL.md 全部 frontmatter byte-equal、内容零增删。

### C. EXAMPLES.md ❌/✅ + AGENTS.md §0 价值层（Karpathy 启发）

新建 `myskills/EXAMPLES.md` — 7 类反面教材（路由 / 工具使用 / token 优化 / 多任务 / 失败处理 / codex 审稿 / 文档同步）。

`myskills/AGENTS.md` 加 §0 价值层（7 条姿态铁律：不假设先验证 / 手术刀式改动 / 该用工具就用工具 / 暴露不确定性 / 失败不掩盖 / 小步前进 / 看用户的话）—— 比每个 SKILL.md 重写一遍省 token。

### D. Judge agent + Cost Budget（codex 方案 3）

新建 `myskills/judge-agent/` skill：
- 只读（allowed-tools: Read, Grep, Glob）
- 触发：多 agent 结论冲突 / 文件边界重叠 / Stage verdict 分歧
- 输入：spec + owner map + 各 agent 摘要 + diff + test
- 输出：JSON `{verdict, reasoning, next_step}`

`harness-workflow/templates/project-memory/.harness-memory.yml.template` 加 budget 段（M 级默认 max_agents=2 / max_judge=1 / max_round_subagent_tokens=20%；XL 覆盖到 3/1/30%）。

### 实证亮点

**PreToolUse hard gate 在生产环境拦下 sub-agent**：sub-agent D 试图 Write `packages/harness-cli/resources/schemas/budget.schema.json`（非白名单业务代码路径），hook 真实拦截 → sub-agent 优雅降级写到 .harness-memory.yml.template。这是 hard gate 不靠 AI 自觉的真实证明。

## 9.5 Codex Round 3 简化反馈（2026-04-26）

经 codex round 3 综合审核（VERDICT: NEEDS_SIMPLIFICATION），已应用 3 个精简：

1. **`[HARNESS-ROUTER]` 注入精简**：从 9 行 / 480B / ~130 tokens → 3 行 / 304B / ~95 tokens（每条节省 ~30%；50 turn 长 session 节省 ~1.7K tokens）。理由：完整规则在 SessionStart 一次注入足够，PreToolUse 已是 hard gate，软注入只保留路由分流提醒
2. **心跳频率减半**：Stage 3 内 2 min → 5 min，单 Agent 5 min → 10 min；新增"仅 round > 15 min 才启心跳"条件，避免短任务被监控开销吃掉。30min round 累计从 2.3K → 1K tokens
3. **失败回退闭环**：harness-bugfix / harness-feature 显式补"git checkout 回退本 Step/Stage + 写 cases/ + 更新 STATE.json"协议（详见各自 SKILL.md "失败回退闭环"段）

详细 token 估算 + 设计 trade-off 见 docs/SETUP.md §9 Codex 历史审核备忘。

## 9. Codex 审核 + 实证结果备忘（2026-04-26）

经 codex 实证审核 + sentinel 测试（用 `codex exec` 跑了一次实测查询），当前接入方案 verdict：

### Claude Code（完全 work — 实证）
- ✓ SessionStart hook stdout 注入 model context（session 开头看得到 `[HARNESS]` 三层架构提示）
- ✓ UserPromptSubmit hook stdout 注入 model context（每条用户消息上方看得到 `[HARNESS-ROUTER]` 提醒）

### Codex CLI（hook stdout **不**注入 — 但有兜底）
**实证结果**（用 `codex exec "你的 context 是否包含 [HARNESS]/[HARNESS-ROUTER]/Harness Agent Instructions？"`）：
```
SESSION_START_HOOK: NO    ← hook 触发但 stdout 不进 model context
USER_PROMPT_HOOK:   NO    ← 同上
AGENTS_MD:          YES   ← 项目级 AGENTS.md 实际进入 model context ✓
```
Codex 日志显示 `hook: SessionStart Failed` / `UserPromptSubmit Failed` — Codex CLI 处理 hook 的方式与 Claude Code 不同，hook 只是 lifecycle 事件，stdout 不会被注入到模型 context。**只有 Stop hook 完整 work**（用于 context-monitor.sh 阈值警告）。

### 修复 / 兜底机制（已落实）

- ✓ **Codex 路由规则全靠项目级 AGENTS.md auto-load**（§2.2 方案 A symlink / B cp / C native）
- ✓ Codex 不读 `~/.codex/AGENTS.md`（home-level）→ 已删除该死文件
- ✓ `context-monitor.sh` 工具中立化（CLAUDE / CODEX / HARNESS 三层 env var fallback）

> **codex CLI model 配置**：如果 `codex exec` 报 `model requires a newer version` / `model deprecated` 错，把 `~/.codex/config.toml` 的 `model` 字段换成当前 codex 支持的版本（用 `codex --help` 或 `codex login` 后的 prompt 看可选项）。这是 codex CLI 内部配置，与 harness 工作流无关；模型名会随 codex 版本迭代变化，故不在本文档写死具体名字。

### 双保险设计已验证

| 工具 | 主要机制 | 兜底机制 | 实证状态 |
|------|---------|---------|---------|
| Claude Code | SessionStart + UserPromptSubmit hook stdout 注入 | — | ✅ 完全 work |
| Codex CLI | 项目级 AGENTS.md auto-load | hook 触发（stdout 不注入但 Stop hook work） | ✅ AGENTS.md 兜底 work |

**结论**：在 myskills repo 工作时，两个工具都 work；在其他项目工作时，**只要 cwd 下有 AGENTS.md 软链到 myskills 顶层**，Codex 也走 harness 工作流。Claude Code 不依赖项目级 AGENTS.md（因为 hook 注入足够），但有也 OK。
