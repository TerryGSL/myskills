# harness-workflow 记忆+审稿升级：迭代日志

**日期**: 2026-04-22（当日完成）
**主题**: 项目长期记忆机制 + strict-reviewer skill 设计
**最终产出**: `harness-workflow/specs/2026-04-22-memory-reviewer-upgrade.md` (726 行，codex Round 9 PASS)

---

## 为什么要记这份日志

这次设计迭代走了 **9 轮 codex 协作** + **3 个用户关键转折**，产出一份扎实的 spec。把过程记下来不是自恋，是因为中间涉及 2 个已经写入 auto memory 的行为规则（brainstorming 流程、迭代决策自主化），未来有人问"这两条规则怎么来的"，这份日志就是证据。

也给未来的自己留一份**方法论参考**：什么该问用户、什么该自己决定、codex 什么时候有用。

---

## 时间轴

### 阶段 0：起点 — 一个断链

**请求**：用户让拉下最新代码 → 问 harness 是否涉及 MEMORY.md 维护

**发现**：`harness-workflow/skill.md:145` 引用 `references/memory.md` — **该文件不存在**（断链 bug）

### 阶段 1：Plan V1（被 codex 否决）

初版 plan：
- 路径：写到 Claude auto memory 目录（`~/.claude/projects/{hash}/memory/`）
- 扩散：改 team-init / team-commander 的 SKILL.md
- 插入：Step 4.5 / Step 6.5 小数 step

**Codex Round 1 (HOLD, 7 findings)**：
1. memory 规则散落在 6 文件 → 建独立 memory.md 作唯一权威
2. Step 4.5 断点插入破坏可读性
3. Step 6.5 同问题 + 上下文压力 vs 持久化漂移两件事混淆
4. **team-init/team-commander 过度扩散**（核心反对点）— 这俩 skill 独立可用不该耦合 harness
5. `{hash}` 路径解析规则未定义 — **不可执行**
6. `--adopt` 语义冲突：未处理已有 MEMORY.md / 用户手写 memory
7. Stage 8 feedback 写入太宽松

4 个 Q&A 澄清：
- #4 被接受 → team-init 不扩散
- "Session Health Check" 重命名（替代 Step 6.5）
- 路径解析改运行时指令（macOS 公式只作诊断 hint）
- `harness_` 前缀命名空间 + append-only 合并

应用修复后 → **V2 plan**

### 阶段 2：用户转向（关键节点）

用户读 V2 后明确说：

> "我感觉变复杂了呢，然后我是希望项目里面能有一些长久的记忆维护的，所以是不是需要在项目里维护 memory.md 文档呢，你觉得呢，你是不是理解错了一点呢"

我确实理解错了：Auto Memory（Claude 账户级）**不等于**项目长期记忆（repo 级，跟随 git，跨设备/团队共享）。

用户同时抛出 3 条深度反馈：
1. **reviewer default FAIL + 客观指标**（死链率、事实密度等）
2. **ERRORS.md 案例库 vs 原则库**（一次真踩的坑胜过十条抽象原则）
3. **3 个月/1 年不腐烂的维护机制**

### 阶段 3：流程纠正（用户的第二次关键指正）

我的错误：直接手动脑暴 4 条主线 + 调 codex，**跳过了 `superpowers:brainstorming` skill**。

用户指正：

> "你有用 harness skill 里面的头脑风暴吗，没看到啊"

紧接着下一条：

> "这种脑暴规则你需要记下来啊"

→ **写入 auto memory**：`feedback_use_brainstorming_skill.md`（脑暴/设计任务必须先调 superpowers:brainstorming，不能手动脑暴）

### 阶段 4：正规 brainstorming 流程

走完 superpowers:brainstorming skill 的 checklist：

**澄清 3 个 MC 问题（一次一条）**：
- Scope: 升级 harness-workflow skill 自身（不是 myskills 试点）
- 主笔权: AI 主写，用户定期审核
- Consumer: AI 和人类均等，双层格式（metadata + narrative）

**3 骨架方案 + codex Round 2**：
- A: 全集成到 harness-workflow（会臃肿）
- B: reviewer + memory 都拆独立 skill（两个都要同步状态，drift 风险）
- C: reviewer 拆 skill，memory 留 harness（推荐）
- **Codex 提 Option D = C + `.harness-memory.yml` contract**（项目自描述，3 个月后新会话也能读懂）

**Codex Round 3：7 个具体 spec 细节** — 产出 schema / HTML markers / ERRORS runtime / strict-reviewer IO 等完整可实施规范

**4 个设计 section**：
1. 整体架构 + 产物边界
2. `.harness-memory.yml` contract
3. `docs/memory/` 物理形态
4. runtime 协议 + strict-reviewer IO

每节后用户确认 → 全部 pass → 写 spec

### 阶段 5：Spec 诞生 + 6 轮 dog-food 审稿

**Spec** commit `6a911be`（515 行）

Dog-food：用 spec 里定义的 strict-reviewer 规则（default FAIL + 三硬门 + adversarial search）审 spec 自己。

| Round | Verdict | Findings | 关键修复 |
|-------|---------|----------|---------|
| **4** | FAIL | 6 (2C/2H/2M) | errors/ vs cases/ 矛盾、Stage 3 无执法点、strict-reviewer 调用协议未定义、Open Questions 留给实施阶段偷懒、team-commander false grounding、negative_patterns 二义 |
| **5** | FAIL | 3 (2H/1M) | Stage 3 未预见文件漏查、strict-reviewer unavailable 降级拆了硬门、Post-check 未按 relevance 分级 |
| **6** | FAIL | 3 (2H/1M) | `<base-sha>` 未定义来源、archive/** 允许写用户文件、scorecard schema 未定义 |
| **7** | FAIL | 3 (2H/1M) | owned_paths 漏列 contract/scorecard 自身、scorecard 归档路径 yml vs 只允许 md、archive_after_days_unused 无使用时间记录 |
| **8** | FAIL | 2+1 | user case + last_used 读写冲突、broad 模式通过 forbidden 逃生门绕过、verification 没覆盖新机制 |
| **9** | **PASS** | 0 (3 handled adversarial) | — |

### 阶段 6：用户的第三次关键指正

在 Round 6 之后我又问用户"怎么走"：

> "你能不能完全跑通后啊，不要让我来决策"

→ **写入 auto memory**：`feedback_dont_ask_for_iterative_decisions.md`（迭代循环内低级决策自己定，跑到 PASS/stuck/分歧再找用户）

从此自主跑完 Round 7/8/9 → PASS。

---

## 产物清单

### Git commits（时间顺序）

| Commit | 内容 |
|--------|------|
| `6a911be` | Spec V1（515 行） |
| `550c41e` | Round 4 fixes（6 条） |
| `0213663` | Round 5 fixes（3 条） |
| `e31924a` | Round 6 fixes（3 条） |
| `a3021e8` | Round 7 fixes（3 条） |
| `6f123af` | Round 8 fixes（3 条） |
| （本 commit） | 迭代日志 |

### Auto Memory（用户指定要记的行为规则）

- `~/.claude/projects/-Users-twelve-Music-myskills/memory/MEMORY.md` — 索引
- `feedback_use_brainstorming_skill.md` — 脑暴必走 superpowers:brainstorming
- `feedback_dont_ask_for_iterative_decisions.md` — 迭代决策自主化

### Skill 同步

`~/.claude/skills/` 下 12 个 skill 目录（harness-workflow / task-dispatcher / team-* / office-hours / investigate）**已替换为指向 myskills repo 的 symlink**。未来 repo 改动对 Claude 立即生效。

其他机子的同步方式：git clone + 按 README.md 第二步的脚本建 symlink。

---

## 沉淀的核心洞见（未来设计参考）

### 1. 理解用户意图前不要动手

V1 plan 我急着写，用错了"Auto Memory"的含义。用户纠正前走了弯路。

**规则**：遇到"长期记忆 / 项目记忆"这类语义边界模糊的概念，先用一个 MC 问题确认"什么层级的 memory"。

### 2. Dog-food 规则于规则本身

Spec 里定义了 strict-reviewer 的规则（default FAIL + 三硬门）。用同样规则审 spec 自己 → 抓出 6+3+3+3+3 个具体问题。

**规则**：任何"审稿规范"设计出来后，用它审自己一遍。抓不出问题 → 规则太松；抓得出 → 规则值钱。

### 3. Codex 是真能抓 AI 礼貌滤镜的

每轮 codex 都给 3-6 个具体 finding，**从不软着陆**。关键是 prompt 里塞"default FAIL, hesitation = FAIL"这条反向力。没有这句，codex 会回"几点小建议"。

**规则**：审稿类任务给 codex 的 prompt 必须前置 default-FAIL 立场。

### 4. 迭代收敛不是线性的

Round 4: 6 finding → Round 5: 3 → Round 6: 3 → Round 7: 3 → Round 8: 2 → Round 9: 0

每轮修了前面的洞后，新代码暴露下一层问题。**收敛到 PASS 要 5-9 轮是正常的**，不是过度工程。但**不超过 10 轮**需要停下来反思是不是设计路径本身有问题。

### 5. 用户的职责是方向和终点判断，不是逐轮决策

3 条关键用户反馈分别在起点（scope）、中段（方向纠偏）、中后段（自主化）。**这些都是判断类决策，不是选择类决策**。剩下的迭代内部做机械性选择（修或不修、修法 A 或 B）我自己做。

### 6. Round 1 的回滚是对的

方向错了的 Round 1 改动（Auto Memory 账户级路线）完全回滚，没有硬塞进 V2 当"既成事实"。**旧方向的残留会腐化新方向的清晰度**。

### 7. Open Questions 是偷懒的陷阱

V1 spec 留 3 个 Open Questions 给实施阶段。codex Round 4 指出这是偷懒（这些是 write-path 和执法决策，不能留给后面）。收敛到"全在 spec 闭合"后，writing-plans 阶段的 input 质量大幅提升。

**规则**：spec 里不应该有 Open Questions，除非它们是真正需要**原型验证**才能回答的（不是"我没想清楚"类的）。

---

## 下一步

按 `superpowers:brainstorming` skill 的终态规定，下一步是 invoke `superpowers:writing-plans` skill 把这份 spec 变成可执行的 implementation plan。

Implementation scope：
- 🆕 新 skill：`strict-reviewer/SKILL.md`
- ✏️ 修改 skill：
  - `harness-workflow/skill.md`
  - `harness-workflow/references/memory.md`（大改）
  - `harness-workflow/references/workflow.md`
  - `harness-workflow/references/maintenance.md`
  - `harness-workflow/prompts/qa-prompt.md`
  - `harness-workflow/prompts/security-prompt.md`
  - `team-commander/SKILL.md`
- 🆕 新建：
  - `harness-workflow/references/memory-migrations.md`
  - `harness-workflow/references/reviewer-integration.md`
  - `harness-workflow/templates/project-memory/`（脚手架模板）

---

## 附：本次设计的 codex 参与度

Codex session ID: `019db09f-b8d4-7b63-920b-ed126e207144`（保存在 `.context/codex-session-id`，可 `/codex` 继续追问）

| 轮次 | 主题 | 模型 | 总 tokens | 耗时 |
|------|------|------|----------|------|
| Round 1 | 审 V1 plan | high | 180683 | ~3 min |
| Round 2 (4 threads) | 主题脑暴 | high | 274100 | ~3 min |
| Round 2 (骨架) | Option D 提出 | high | 333173 | ~2 min |
| Round 3 | 7 具体 spec | high | 395421 | ~3 min |
| Round 4 | spec 终审 1 | high | 731244 | ~4 min |
| Round 5 | spec 终审 2 | high | 1054263 | ~4 min |
| Round 6 | spec 终审 3 | high | 1442126 | ~4 min |
| Round 7 | spec 终审 4 | high | 1742424 | ~3 min |
| Round 8 | spec 终审 5 | high | 2075702 | ~3 min |
| Round 9 | spec 终审 6（PASS）| high | 2427816 | ~3 min |

累计 ~10M tokens 的 codex 协作，换来一份 726 行可实施 spec + 两条持久行为规则。
