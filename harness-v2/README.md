# harness-v2 — 个人 Skill 体系 v2

## 1. 项目概览

**harness-v2** 是 myskills 仓库的下一代工程 skill 体系。它把原来单体的 `harness-workflow` 拆分为一套分层派发框架，用更少的 context 占用支持更多样的任务场景。

**设计目标**：

- 个人项目和公司项目用同一套框架，但由不同 profile 控制行为差异
- 任务类型（quick / bugfix / feature / refactor）结构性派发，不靠 LLM 猜测
- 小任务走 fast-path，零仪式直接完成；复杂任务走完整 8-Stage

**关键特性**：

| 特性 | 说明 |
|------|------|
| Profile 派发 | 按项目标记（`.harness-profile`）或路径 / git remote 自动探测 profile |
| 4 种 task-type | `quick` / `bugfix` / `feature` / `refactor`，各有独立 sub-skill |
| Knowledge Scanner | 5-domain 项目知识库，Stage -0.5 按需注入 |
| Stop Hook | 监控 context 占用，高占用时提示重注入 |
| Setup 脚本 | 一次性交互式配置，写 `~/.claude/profiles/` YAML |

---

## 2. 为什么需要 v2

### v1 的三个问题

**问题 1：Context 注意力分散**
原 `harness-workflow` 是一个 363 行的单体 skill，每次 SessionStart 全量注入。对于"改一个 typo"这样的任务，Claude 也要先消化完整的 8-Stage 规程，导致注意力稀释。

**问题 2：场景无法区分**
v1 内部用 if/else 判断 S/M/L/XL 规模，没有 profile 概念。个人项目和公司项目用同一套规则，公司合规要求（禁止 auto-push、强制 code review）无法从框架层面保证。

**问题 3：小任务过度工程**
修一个注释或调整一个配置值，v1 也会走 Stage 0 需求分析 → Stage 1 架构审查 → … 的完整流程。用户为了避免这个开销，开始绕过 skill 手动改，导致 skill 形同虚设。

### v2 如何解决

**2 层派发**：`task-dispatcher`（外层并行/串行分解）→ `profile-entry`（入口路由，单次 Skill load 内完成）→ leaf sub-skill（只加载该场景需要的内容）。

**三维正交**：Profile × task_type × aggression mode 三个维度各自独立解析，互不耦合。公司 profile 的 `hard_floor` 约束在框架层面强制执行，任何 flag 都无法绕过。

**确定性 fast-path**：结构性检查（`git diff --stat`），完全确定性，不依赖 LLM 语义判断。1 文件 < 10 行改动直接走 `harness-quick`，commit 完成，全程不走 Stage 规程。

---

## 3. 架构一图

```
用户消息
  ↓
task-dispatcher              （不变，外层并行/串行分解）
  ↓ 每个代码子任务
profile-entry                （新入口，~80 行路由，单次 Skill load 内完成）
  │
  │ Step 0: 读 .harness-profile marker
  │ Step 1: 无 marker → fallback matchers（公开匹配结果）
  │ Step 2: 结构性 fast-path 检查（确定性，基于 git diff）
  │ Step 3: 解析 precedence (hard-floor > flag > profile default > conservative)
  │ Step 4: Skill(<leaf sub-skill>) 加载恰好一个
  ↓
leaf sub-skill
  │   harness-quick     → 1 文件 < 10 行改动，无 ceremony
  │   harness-bugfix    → investigate → reproduce → fix → regression test
  │   harness-feature   → 当前 8-Stage 主体 + Stage -0.5 + knowledge gate
  │   harness-refactor  → baseline → incremental → verify
  ↓ 所有重路径 sub-skill 都引用
harness-common           （共享基础设施：memory / project-detection / phase-init / knowledge scanner / Stage -0.5）
  ↓ 审稿统一调
strict-reviewer          （4 硬门：grounding / reproduction / coverage / knowledge-compliance）
```

---

## 4. 安装使用

### 4.1 前置依赖

- [Claude Code](https://docs.claude.com/claude-code) 已安装
- 三个必装插件（在 Claude Code 内安装）：
  - `claude-mem@thedotmack` — 跨会话记忆
  - `codex@openai-codex` — 跨模型 Code Review
  - `superpowers@claude-plugins-official` — Anthropic 官方 superpowers
- macOS 自带 ruby + yaml stdlib（setup 脚本依赖）

### 4.2 首次激活（3 步）

#### Step 1：Clone + symlink

```bash
# 克隆仓库（含 gstack submodule）
git clone --recurse-submodules git@github.com:TerryGSL/myskills.git ~/Music/myskills

mkdir -p ~/.claude/skills

# 把 harness-v2 的所有 skill 链到 ~/.claude/skills/
for skill in \
  profile-entry \
  harness-common \
  harness-quick \
  harness-bugfix \
  harness-feature \
  harness-refactor \
  harness-workflow \
  task-dispatcher \
  strict-reviewer \
  team-pd team-architect team-senior-dev team-junior-dev team-qa team-security \
  investigate office-hours; do
  ln -sf ~/Music/myskills/harness-v2/${skill} ~/.claude/skills/${skill}
done

# 链接 gstack 基础 skill
ln -sf ~/Music/myskills/gstack/skills/* ~/.claude/skills/
```

> 使用 `ln -sf` 而非复制，后续 `git pull` 后 skill 内容自动更新，无需重新链接。

#### Step 2：跑 setup 脚本

```bash
~/Music/myskills/harness-v2/setup/setup-harness.sh
```

脚本会交互式询问：

1. **主力开发场景**：个人项目 / 公司项目 / 两者都有
2. **默认 push 策略**：conservative（手动）/ standard（询问）/ aggressive（自动）
3. **公司项目参数**：本地路径 glob、git remote 正则（用于自动探测）
4. **可选功能**：knowledge scanner、Stop Hook context monitor

配置写入 `~/.claude/profiles/harness.yml`（以及可选的 `company-<name>.yml`）。

#### Step 3：（可选）启用 Stop Hook

若 setup 时选择启用 Stop Hook，脚本末尾会输出以下 snippet，手动合并到 `~/.claude/settings.json`：

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/Users/twelve/Music/myskills/harness-v2/hooks/context-monitor.sh"
          }
        ]
      }
    ]
  }
}
```

Stop Hook 在每次 Claude 停止输出时检查 context 占用比例，高占用时提示"建议重新注入 profile-entry"。

### 4.3 回退到 v1

若需要临时使用原 `harness-workflow` 单体 skill，把 symlink 指回原位即可：

```bash
# 回退到 v1 单体
ln -sf ~/Music/myskills/harness-workflow ~/.claude/skills/harness-workflow

# 恢复到 v2
ln -sf ~/Music/myskills/harness-v2/harness-workflow ~/.claude/skills/harness-workflow
```

其他 skill（`task-dispatcher`、`team-*` 等）v1/v2 兼容，无需切换。

---

## 5. 日常使用

### 5.1 最简流程

正常情况下，用户只需直接说需求，框架自动完成路由：

```
你：帮我加个用户登录接口

→ task-dispatcher   外层分解，识别为代码任务
→ profile-entry     探测当前项目 profile + task_type + mode
                    git diff 无改动，无 /fix /refactor flag → task_type = feature
→ harness-feature   加载 8-Stage 主体
→ Stage -0.5        读 knowledge INDEX，注入 Binding Rules
→ Stage 0~8         完整走通
```

`profile-entry` 首次进入时会输出一行探测公告：

```
Detected profile: harness (matched: path_glob ~/Music/myskills/**, priority 10)
Override: /profile <name>
```

后续 turn 保持沉默，不重复输出。

### 5.2 显式 flags

所有 flags 在任何消息中加入即可，`profile-entry` 优先识别：

| Flag | 效果 |
|------|------|
| `/quick` | 强制走 `harness-quick` fast-path（跳过 Stage 规程） |
| `/fix` | 走 `harness-bugfix`（investigate → reproduce → fix） |
| `/refactor` | 走 `harness-refactor`（baseline → 增量 → verify） |
| `/yolo` | aggressive mode（受 profile `hard_floor` 约束） |
| `/safe` | conservative mode（强制手动确认每步） |

**Precedence 铁律**：`profile hard_floor > 调用 flag > profile default > conservative`。

公司 profile 里设置了 `hard_floor: [auto_merge]`，则即使加 `/yolo` 也不会自动 push，框架会输出公告：

```
Requested: /yolo
Effective: company-safe (profile policy: auto_push=false, destructive_ops=false)
Reason: company profile hard-floor
```

### 5.3 老命令兼容

原 v1 的所有命令都可继续使用，`harness-workflow` stub 负责 passthrough：

| 命令 | 效果 |
|------|------|
| `/harness-workflow --init` | 新项目初始化（Phase 1-4） |
| `/harness-workflow --adopt` | 现有项目接入 |
| `/harness-workflow --maintain` | 12 项周期性健康审计 |
| `/harness-workflow --next` | 手动启动下一轮 |
| `/harness-workflow --scan-project` | 触发 5-phase knowledge scan |

### 5.4 显式覆盖 profile

若自动探测有误，可手动指定：

```bash
# 在项目根目录创建 marker 文件
echo "harness" > .harness-profile

# 或指定公司 profile
echo "company-acme" > .harness-profile
```

也可在消息中加 `/profile <name>` 临时覆盖本次会话。

---

## 6. 各 Skill 职责速查

| Skill | 角色 | 何时触发 |
|-------|------|---------|
| `task-dispatcher` | 外层任务分解（并行/串行编排） | 每条用户消息 |
| `profile-entry` | 入口路由（profile / task_type / mode 解析） | task-dispatcher 派发代码任务时 |
| `harness-quick` | 1 文件 / < 10 行 fast-path | fast-path 命中 / `/quick` flag |
| `harness-bugfix` | investigate → reproduce → fix → 回归测试 | `/fix` flag / task-dispatcher 判定 bug 类型 |
| `harness-feature` | 完整 8-Stage 主体 | profile 默认路由 / 复杂功能需求 |
| `harness-refactor` | baseline capture → 增量 commit → verify | `/refactor` flag / 明确重构意图 |
| `harness-common` | 共享基础设施（memory / 探测 / knowledge / Phase Init） | 各 sub-skill 内部引用，不独立使用 |
| `strict-reviewer` | 4 硬门审稿（grounding / repro / coverage / knowledge） | Stage 4/5/6/7 自动调用 |
| `harness-workflow` | profile 声明 + 老命令 passthrough | 用户使用老命令时 |
| `team-pd` | 产品设计师 subagent（PRD / DESIGN 输出） | Stage 0 |
| `team-architect` | 系统架构师 subagent（Torvalds 风格） | Stage 1 |
| `team-senior-dev` | 资深开发 subagent（核心模块） | Stage 3 |
| `team-junior-dev` | 初级开发 subagent（CRUD 业务） | Stage 3 |
| `team-qa` | QA 测试工程师 subagent | Stage 6 |
| `team-security` | SDL 安全工程师 subagent | Stage 7 |
| `investigate` | 四阶段结构化调试方法论 | `harness-bugfix` Step 1 |
| `office-hours` | 需求诊断教练（结构化提问验证需求真实性） | Stage 0 前置（可选） |

---

## 7. 常见场景示例

### 场景 1：个人项目快速修个 typo

```
cd ~/Music/myskills

你：README 里 "harness-v2" 写成了 "harness-V2"，帮我改一下

→ profile-entry: 路径匹配 ~/Music/myskills/**，探测为 harness profile
→ fast-path 检查: git diff --stat 仅 README.md，1 行改动
→ 输出: "Fast-path: 单文件 1 行改动，路由到 harness-quick（/fix 覆盖）"
→ harness-quick: 直接改 → lint → commit
→ commit: "fix: typo in README.md (harness-V2 → harness-v2)"
→ 写轻量 memory observation，完成
```

无 Stage 规程，无 PRD，无 plan doc，30 秒内完成。

---

### 场景 2：公司项目修 bug

```
cd ~/work/acme-corp/svc-x   # git remote 含 github.com/acme

你：这个登录接口偶尔 500，能帮我查一下吗

→ profile-entry: git remote 匹配 company-acme profile
   Detected profile: company-acme (matched: git_remote github.com/acme, priority 10)
→ 无 /fix flag，但 task-dispatcher 判定 "偶尔 500" 为 bug 类型 → harness-bugfix
→ Step 1: Skill(investigate) 四阶段调试，定位根因
→ Step 2: 写 failing test 证明 bug 可复现
→ Step 3: Stage -0.5 读 exception-and-error-contracts knowledge
→ Step 4: 按 knowledge rules 写修复代码，调 strict-reviewer 4 硬门
→ Step 5: 回归测试全绿 → commit（不自动 push，hard_floor 保证）
→ 等用户确认是否 push
```

---

### 场景 3：给老 Java 项目接入 harness

```
cd ~/work/legacy-java-project

# 第一步：基础初始化（生成 docs/ STATE.json CLAUDE.md 等脚手架）
/harness-workflow --adopt

# 第二步：5-phase knowledge scan
/harness-workflow --scan-project
# 扫描 5 个 domain：style-and-structure / internal-components /
# exception-and-error-contracts / integrations-and-sdk-usage / i18n-and-text-boundaries
# 输出：docs/harness/knowledge/INDEX.md + 各 domain 的 manifest.md + TODO.md

# 第三步：用户填 TODO.md，回答 scanner 发现的 8 个开放问题
# 编辑 docs/harness/knowledge/TODO.md，补充团队规范和例外情况

# 第四步：同步答案到 knowledge corpus
/harness-workflow --apply-knowledge-answers

# 完成后，新的 feature/bugfix/refactor 任务会自动走 Stage -0.5 读取该项目的 knowledge
```

---

### 场景 4：重构旧模块

```
cd ~/work/acme-corp/svc-x

你：auth 模块这个 token 刷新逻辑太乱了，帮我重构一下，不要改接口行为

→ profile-entry: 探测 company-acme profile，识别 /refactor 语义
→ harness-refactor 触发
→ 硬前置: 确认 mvn test 全部 PASS（无测试则停止，先补 characterization test）
→ Step 1: baseline 捕获（测试快照 + git tag baseline/<timestamp>）
→ Step 2: Stage -0.5 读 style-and-structure + internal-components manifests
           （Binding Rules：token 操作必须走 InternalTokenService wrapper）
→ Step 3: 生成增量重构计划（每步 < 100 行改动，小 commit）
→ Step 4~N: 逐步执行，每步跑回归测试
→ 每步调 strict-reviewer（重点验证：行为不变 + knowledge compliance）
→ 最终对比 baseline，全绿后汇报完成
```

---

## 8. 和 v1（原 harness-workflow）的对比

| 维度 | v1 单体 | v2 分层 |
|------|---------|---------|
| 入口 skill 规模 | 单体 `harness-workflow` 363 行，全量注入 | `profile-entry` ~80 行，按需加载 leaf sub-skill |
| 场景分档 | 内部 if 判断 S/M/L/XL | profile × task_type × mode 三维正交 |
| 小任务处理 | 走完整 Stage 规程 | 结构性 fast-path，`harness-quick` 4 步完成 |
| 公司合规 | 无框架层面保证 | `hard_floor` 强制，flag 无法绕过 |
| 知识库支持 | 无 | `docs/harness/knowledge/` + Stage -0.5 按需注入 |
| Context 加载 | 每次全量注入 | 按场景 Skill load，只加载需要的 sub-skill |
| 老命令支持 | 原生 | `harness-workflow` stub passthrough，完全兼容 |
| 多项目 profile | 无 | `~/.claude/profiles/*.yml` 每项目独立配置 |

---

## 9. 目录结构速查

```
harness-v2/
├── profile-entry/           入口路由 skill（~80 行，薄路由器）
│   ├── SKILL.md
│   └── references/
│       ├── profiles.md      profile registry schema + matcher 规则
│       ├── precedence.md    precedence 契约示例
│       ├── fast-path.md     fast-path allowlist + 触发条件
│       └── task-type-contract.md   跨 pack 契约
│
├── harness-common/          共享基础设施层（不独立使用）
│   ├── SKILL.md
│   ├── references/
│   │   ├── memory-contract.md      memory 完整 schema
│   │   ├── project-detection.md    技术栈自动探测
│   │   ├── phase-init.md           Phase 1-4 初始化流程
│   │   ├── knowledge-retrieval.md  Stage -0.5 完整规范
│   │   ├── reviewer-integration.md strict-reviewer 调用协议
│   │   └── maintenance.md          --maintain 12 项审计
│   └── templates/project-knowledge/   knowledge scanner 脚手架模板
│       ├── INDEX.md.template
│       ├── TODO.md.template
│       └── <5 domain 目录>/        manifest / evidence / gaps 模板
│
├── harness-quick/           fast-path sub-skill（4 步）
├── harness-bugfix/          bugfix sub-skill（5 步）
├── harness-feature/         8-Stage 主体 sub-skill
│   └── prompts/             各角色 + scanner subagent prompts
├── harness-refactor/        重构 sub-skill
│
├── harness-workflow/        profile stub + 老命令 passthrough
├── strict-reviewer/         4 硬门审稿 skill（含 knowledge gate）
│
├── task-dispatcher/         外层任务分解编排
├── team-pd/ team-architect/ team-senior-dev/ team-junior-dev/
├── team-qa/ team-security/  各角色 subagent
├── investigate/             四阶段调试方法论
├── office-hours/            需求诊断教练
│
├── hooks/
│   └── context-monitor.sh   Stop Hook（context 占用监控）
├── setup/
│   └── setup-harness.sh     一次性交互配置脚本
├── tools/
│   └── harness-pack-test    skill pack 契约校验脚本
│
├── README.md                本文档（使用指南）
└── DESIGN.md                设计思路（演化历史 / 架构决策）
```

---

## 10. 故障排除

### Skill 不加载

检查 symlink 是否存在且指向正确目标：

```bash
ls -la ~/.claude/skills/profile-entry
ls -la ~/.claude/skills/harness-feature
```

若是死链（指向不存在路径），重新执行 Step 1 的 `ln -sf` 命令。

### Profile 探测不对

查看当前 turn 首行输出的探测公告。若探测结果不是期望的 profile：

1. 在项目根目录手动创建 marker：`echo "harness" > .harness-profile`
2. 检查 `~/.claude/profiles/` 下的 YAML 文件是否存在：`ls ~/.claude/profiles/`
3. 检查 YAML 中 `detection.matchers` 是否覆盖当前项目路径

### Setup 脚本失败

手动创建最小 profile YAML：

```bash
mkdir -p ~/.claude/profiles

cat > ~/.claude/profiles/harness.yml << 'EOF'
name: harness
description: "harness-v2 default profile"
default_mode: standard

task_types:
  quick:    harness-quick
  bugfix:   harness-bugfix
  feature:  harness-feature
  refactor: harness-refactor
EOF
```

### Knowledge 不生效

按以下顺序排查：

1. 确认 `docs/harness/knowledge/INDEX.md` 存在（不存在表示项目未接入 knowledge）
2. 检查项目 `CLAUDE.md` 中无 `harness-knowledge: disabled` 标记
3. 若 INDEX.md 存在但 Stage -0.5 跳过，检查 `.harness-status.json` 里 `knowledgeCheck.effective_index_status` 字段值

### harness-pack-test 校验失败

```bash
~/Music/myskills/harness-v2/tools/harness-pack-test ~/.claude/profiles/harness.yml
```

常见原因：YAML 格式错误、`task_types` 字段缺少某个 key、skill 名称拼写不符合 registry。根据脚本输出逐项修复。

---

## 11. 贡献新 Skill Pack

如果需要为特定公司或项目类型创建专属 skill pack：

**第一步**：创建 profile YAML（参照 `~/.claude/profiles/harness.yml` 格式）：

```yaml
name: my-company
description: "My company workspace profile"
default_mode: standard

detection:
  priority: 10
  matchers:
    - type: git_remote_regex
      pattern: "github\\.com/my-company"

hard_floor:
  - auto_merge    # 禁止自动 merge

task_types:
  quick:    harness-quick       # 可指向通用 harness-* 作为兜底
  bugfix:   harness-bugfix
  feature:  my-company-feature  # 自定义 sub-skill
  refactor: harness-refactor
```

**第二步**：实现自定义 sub-skill（4 个 task_type，或复用 `harness-*` 兜底）。

**第三步**：运行契约校验：

```bash
~/Music/myskills/harness-v2/tools/harness-pack-test ~/.claude/profiles/my-company.yml
```

校验通过（零退出码）后，新 profile 即生效。

---

## 12. 参考文档

| 文档 | 说明 |
|------|------|
| `harness-v2/DESIGN.md` | 设计思路（演化历史、架构决策、权衡分析） |
| `harness-v2/IMPLEMENTATION-PLAN.md` | 实施计划（24 tasks / 8 phases 全览） |
| `docs/superpowers/specs/2026-04-24-profile-based-dispatch-redesign-design.md` | Profile-based dispatch 架构 spec |
| `harness-workflow/specs/2026-04-23-project-knowledge-scanner-design.md` | Knowledge scanner 设计 spec |
| `harness-v2/profile-entry/references/` | Profile schema / precedence / fast-path 契约 |
| `harness-v2/harness-common/references/` | Memory 契约 / Phase Init / Knowledge Retrieval 规范 |

---

*harness-v2 是 myskills 的活跃开发分支。如遇行为与文档不符，以各 skill 的 `SKILL.md` 为准。*
