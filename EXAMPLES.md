# Harness 反面教材手册

> Karpathy 风格的 ❌/✅ 配对——比 SKILL.md 指令更易激活记忆。
> 每条都是**真实犯过的错**或**容易犯的错**。看到场景 → 立刻联想正确做法。

---

## 1. 路由 & Skill 调用

### ❌ 跳过 Skill(task-dispatcher) 直接派多个 Agent

```
用户："扫一下 skill 然后优化超长的几个"
我：[直接派 5 个 Agent 并行]    ← 跳层！违反铁律 ②
```

### ✅ 先 Skill(task-dispatcher) 加载派发协议

```
用户："扫一下 skill 然后优化超长的几个"
我：Skill(task-dispatcher)  ← 先加载完整派发模板（不重叠边界 / agent prompt 协议）
我：然后派 5 个 Agent 并行
```

---

### ❌ 业务代码 Edit 前没 Skill(harness-workflow)

```
用户："修一下登录 500 bug"
我：[直接 Edit src/auth.ts]    ← PreToolUse hook 会拦下，exit 2
```

### ✅ 先 Skill(harness-workflow) 走 leaf

```
用户："修一下登录 500 bug"
我：Skill(harness-workflow) → 内部识别 bug 关键词 → harness-bugfix
我：[harness-bugfix 5 步：investigate → reproduce → fix → regression → commit]
```

---

## 2. 工具使用纪律（最易犯）

### ❌ 用户问历史，直接 grep / Read 全文

```
用户："上次 careful skill 改 vendoring 是怎么做的？"
我：[grep -r "careful" + Read 多个文件]   ← 5K-50K token 浪费
```

### ✅ 先 mem-search 找历史 observation

```
用户："上次 careful skill 改 vendoring 是怎么做的？"
我：mcp__plugin_claude-mem_mcp-search__search "careful gstack vendor"
我：[直接命中 5 条 observation，每条 ~300 token，总 ~1.5K token]
```

---

### ❌ 探索代码用 grep 全仓 / Read 整个文件

```
用户："看看 router-enforcer.sh 是怎么实现的"
我：cat router-enforcer.sh  ← 200+ 行全注入
```

### ✅ 先 smart_outline 看结构，再 smart_unfold 展开关键函数

```
用户："看看 router-enforcer.sh 是怎么实现的"
我：smart_outline router-enforcer.sh   ← 函数签名 + 折叠 body，~30 token
我：[需要细节时] smart_unfold "specific_function"
```

---

### ❌ 派 codex audit 前不看以前 codex 反馈过什么

```
我：Agent(codex round 4 audit hook X)   ← 重新让 codex 看一遍可能已 audit 过的内容
```

### ✅ 先 mem-search 看 codex 之前怎么说

```
我：mem-search "codex audit hook router-enforcer"
我：[看到 round 1/2/3 已经审过的角度，避免重复]
我：Agent(codex round 4 audit ONLY remaining gaps)
```

---

## 3. Token 优化的认知陷阱

### ❌ 砍 hook 注入提醒省 token，结果 AI 忘记用工具

```
hook 注入: 9 行 → 3 行（砍掉"主动用工具"段）
结果: 整 session 0 次 mem-search / 0 次 smart_search
浪费 token: 多次直接 Read 全文 / grep 全仓 = 数十 K token
```

### ✅ 提醒分级，hard gate 兜底，soft 提醒留关键 trigger

```
hook 注入分级：
  代码任务 + 未路由 → 完整版（200 token）
  代码任务 + 已路由 → 轻量版（60 token）
  纯查询          → 精简版（80 token，只剩工具提醒）
+ PreToolUse 真技术拦截（业务代码 Edit/Write 必走 Skill）
```

---

### ❌ "我心里评估了"作为跳过 Skill() 显式调用的借口

```
我：[心里默想"这是单任务"]
我：[直接派 1 个 Agent]   ← 但用户期望看到 Skill() 路径，且 hook 也拦
```

### ✅ 显式调用即使"看起来浪费"

```
我：Skill(task-dispatcher)   ← 即使是单 Agent 派发也调，让规则可见可审计
我：Agent(...)
```

---

## 4. 多任务派发

### ❌ "先做 X，再做 Y"——其实独立但被串行了

```
用户："修个 typo + 调研免费额度 + 写文档"
我：[逐个串行做，等一个完才下一个]   ← 浪费时间
```

### ✅ 识别独立性 → 全部并行

```
用户："修个 typo + 调研免费额度 + 写文档"
我：Skill(task-dispatcher)
我：[同时派 3 个 Agent，互不依赖]
   - Agent 1: typo（Edit）
   - Agent 2: 调研免费额度（WebFetch）
   - Agent 3: 写文档（依赖 Agent 2 → 等结果）
```

---

### ❌ 让两个 Agent 改同一文件

```
我：Agent A: 改 src/index.ts 加功能 X
我：Agent B: 改 src/index.ts 加功能 Y   ← 冲突！
```

### ✅ 不重叠边界：要么串行，要么主 agent 自己做

```
我：Agent A: 改 src/index.ts 加功能 X（独占）
我：[等 A 完] Agent B 继续 → 或者主 agent 自己加 Y
```

---

## 5. 失败处理

### ❌ 失败后继续硬干 / 不回退

```
[Step 3 修复 FAIL]
我：[再改一点试试]
[再 FAIL]
我：[继续手忙脚乱改]   ← 越改越糟
```

### ✅ 3 次失败就走 rollback 闭环

```
[3 次 fail]
我：git diff --stat   ← 看本步改了什么
我：git checkout -- <files-this-step>   ← 回退
我：写 docs/memory/cases/<incident>.md   ← 落盘失败上下文
我：询问用户：spec 不准 / 改方案 / 放弃？
```

---

## 6. Codex 审稿

### ❌ 一次派 codex 包一大堆复杂问题

```
我：Agent(codex)，prompt 600 字 8 个问题
[codex hang 8 分钟]
我：TaskStop 重派
```

### ✅ 短 prompt 聚焦 4 问

```
我：Agent(codex)，prompt 300 字 4 问，每条 ≤30 字回答
[codex 2 分钟回，质量更好]
```

---

## 7. 文档同步

### ❌ 改了 hook / Skill 但忘改 SETUP.md / ARCHITECTURE.md

```
[改 PreToolUse matcher Edit|Write → Edit|Write|Agent]
[但 SETUP.md 仍写 "matcher: Edit|Write"]
用户读 SETUP.md → 误解
```

### ✅ 一次改完所有相关文档（顶层 README / SETUP / ARCHITECTURE）

```
[改 hook]
我：grep "matcher" docs/   ← 找所有相关文档
我：批量 Edit 同步
[一次 commit 包含 hook 改动 + 文档改动]
```

---

## 8. 文档语言跟用户主语

### ❌ 用户全程中文，AI 写英文 README / docs

```
用户："帮我接入 harness"  ← 中文交流
我：[写] # Project Setup Guide
        ## Installation
        cd into the directory and run npm install
[全英文 README，用户读起来要切语言模式]
```

### ✅ 跟随用户主语

```
用户："帮我接入 harness"  ← 中文交流
我：[写] # 接入指南
        ## 安装
        cd 进项目根目录后跑 npm install
[全中文，技术术语 npm install 保留]
```

---

### ❌ commit message 用英文（用户中文沟通）

```
git commit -m "feat(hooks): add router enforcer with fail-closed mode and bypass switch"
[用户读自己 git log 时切语言模式]
```

### ✅ commit message 跟用户主语

```
git commit -m "feat(hooks): 加 router enforcer，fail-closed 模式 + 旁路开关"
# 保留 conventional commit prefix（feat/fix/docs 等英文规范）
# body 用中文
```

---

### ❌ 把代码注释改成中文

```python
# 计算用户的总订单金额（这个注释项目里其他地方都用英文）
def calculate_order_total(orders: list[Order]) -> Decimal:
    ...
[违反原则：代码注释跟项目代码风格，不跟用户主语]
```

### ✅ 代码注释跟项目风格，给用户的报告跟用户主语

```python
# Calculate total order amount (project uses English comments throughout)
def calculate_order_total(orders: list[Order]) -> Decimal:
    ...

# 给用户的进度报告：「我加了一个 calculate_order_total 函数，处理订单总额计算」（中文）
```

---

### ❌ 用户给英文 spec 直接翻译/改写为中文

```
用户给的 spec.md 是英文 → AI"为了保持一致改成中文"重写
[原文件被破坏；用户原本可能要保留英文版]
```

### ✅ 引用英文 spec 时保留原文，自己的解释 / 评论跟用户主语

```
> "The router must validate all incoming requests"  ← 引用 spec 原文
我的理解：路由器**必须**验证所有进入请求（每个请求都要过验证，没有例外）
[原文保留，解释中文]
```

---

## 用法

新用户读：先看本文件 → 再读 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 系统全图。

AI 自己用：每次开始任务前 mental check"这场景跟哪个 ❌ 像？" 选对应 ✅。

发现新错？追加到本文件，让下次看到的人不再犯。
