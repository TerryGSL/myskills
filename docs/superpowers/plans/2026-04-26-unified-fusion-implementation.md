# Harness 统一工作流 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) for tracking.

**Goal:** 把 harness 体系融合为一套核心规则（4 层架构）+ 两种使用方式（直接 markdown / CLI）+ 跨工具兼容（Claude Code / Codex / Cursor / Aider / Copilot），通过 contract test 守门保证一致性。

**Architecture:** 5 个 Phase（A1 → A2 → B / C 并行 → D → E），跨 Phase 必须串行；Phase 内 PR 按显式 `[depends on]` 边走（非自动并行）。每 PR atomic + rollback。

**Tech Stack:** TypeScript（packages/harness-cli/）+ jest + bash + Markdown + GitHub Actions + git。

**Spec：** `docs/superpowers/specs/2026-04-26-unified-fusion-design.md`

**Hard Constraints**:
- 跨 Phase 严格串行；跨 PR 必须 commit message 带 `[depends on: PR X]` tag
- atomic write（mktemp + mv）
- jest 全套 + schema-drift CI 必须绿才能合
- SKILL.md frontmatter / description 不允许出现"v2/v3/重构/迭代"等历史 transition 字眼
- 每个 PR 必须有 Rollback 段（git revert 命令 + 任何外部副作用恢复步骤）
- **触及同一文件的 PR 必须串行**（B3 vs C6 同改 4 个 leaf SKILL → C6 显式 depends on B3）
- **A2.2 fixtures 引入 `status: pending_until_<PR-id>` 字段**；golden.test.ts 见到 pending → skip 不 fail；等对应 C 系列 PR 完成后改为 active

---

## Phase A1：Drift Cleanup（必须最先做，1 PR）

### PR A1：现状不一致全部对齐

**Files:**
- Modify: `packages/harness-cli/src/commands/profile-bootstrap.ts`（hardFloor list 4 → 6）
- Modify: `packages/harness-cli/src/commands/install.ts`（hardFloor list 4 → 6）
- Modify: `packages/harness-cli/tools/harness-pack-test`（如存在；hard_floor 校验白名单 4 → 6）
- Modify: `harness/setup/setup-harness.sh`（write_company_template hardFloor 4 → 6；marker 描述改 YAML）
- Modify: `harness/profile-bootstrap/SKILL.md`（hardFloor 列表 4 → 6；marker 描述改 YAML）
- Rename: `harness-{quick,bugfix,feature,refactor}/skill.md` → `SKILL.md`（顶层 4 文件，符合 skill-creator 标准）
- Rename: `profile-entry/skill.md` → `SKILL.md`（顶层）
- Rename: `harness-common/skill.md` → `SKILL.md`（顶层）
- Rename: `task-dispatcher/skill.md` → `SKILL.md`（顶层）
- Rename: `harness-workflow/skill.md` → `SKILL.md`（顶层）

**Steps:**
1. 改所有 hardFloor 字面量数组（4 项 → 6 项），用 import constants.HARD_FLOOR_FLAGS 替代
2. profile-bootstrap.ts marker 写入逻辑确认是 YAML（已是）；setup-harness.sh print_marker 改成 YAML 格式 print；profile-bootstrap/SKILL.md 描述同步
3. `git mv skill.md SKILL.md` 8 个文件
4. **Ref update sweep**：grep 全仓 `skill.md` 字面引用（README / docs / shell scripts / TS imports），逐个改为 `SKILL.md`。命令：`grep -rln 'skill\.md' --include='*.md' --include='*.sh' --include='*.ts' --include='*.json' --exclude-dir=node_modules` 列出所有命中后 sed 替换
5. 跑 jest（应仍 107 PASS，因为这只是数组扩张和文件重命名）
6. Commit message: `chore(drift): align hard_floor flags 4→6, marker format YAML, SKILL.md case [PR A1]`

**Rollback:** `git revert <pr-a1-sha>`。外部副作用：(1) constants.ts hardFloor list 数组扩张可能影响下游消费（不向后兼容） → 同时 revert 任何 import constants.HARD_FLOOR_FLAGS 的文件；(2) skill.md → SKILL.md 文件重命名可能让 ~/.claude/skills/ symlink 失效 → 用户须 `ln -sf` 重链。

---

## Phase A2：Conformance Fixtures + Schema Sync（A1 完成后；2 PR 顺序）

### PR A2.1：新增 10 个 schema + regen-schema.ts 扩展

**Files:**
- Create: `packages/harness-cli/resources/schemas/marker.schema.json`
- Create: `packages/harness-cli/resources/schemas/task-type.schema.json`
- Create: `packages/harness-cli/resources/schemas/knowledge.schema.json`
- Create: `packages/harness-cli/resources/schemas/knowledgeCheck.schema.json`
- Create: `packages/harness-cli/resources/schemas/hard-floor.schema.json`
- Create: `packages/harness-cli/resources/schemas/memory.schema.json`
- Create: `packages/harness-cli/resources/schemas/drift.schema.json`
- Create: `packages/harness-cli/resources/schemas/reviewer-gates.schema.json`
- Create: `packages/harness-cli/resources/schemas/doctor-protocol.schema.json`
- Create: `packages/harness-cli/resources/schemas/route-output.schema.json`
- Modify: `packages/harness-cli/scripts/regen-schema.ts`（生成全部 12 个）

**Steps:**
1. 写 10 个 schema（基础结构参 spec §Layer 0）；reviewer-gates / drift / memory / knowledgeCheck / knowledge 字段用 spec §14 能力清单 + harness/harness-common/references/ 现有规则文档为来源
2. regen-schema.ts 加 10 个新 schema 的 patch / write 逻辑
3. 跑 `npm run regen:schema && git diff --exit-code resources/schemas/` 应无 diff（说明现 schema 与 constants 一致）
4. 跑 jest（应 107 PASS）
5. Commit: `feat(schemas): 10 new Layer 0 schemas + regen-schema.ts extension [PR A2.1] [depends on: PR A1]`

**Rollback:** `git revert <pr-a2.1-sha>`。外部副作用：CI workflow schema-drift.yml 会被 revert 后失效 → 临时跳过 schema drift CI 检查直到下次 schema 改动；jest 已存在的 schema 测试可能 fail（如有），同步 revert。

### PR A2.2：20 golden fixtures（5 大类各 3 + routing 5）

**Files:**
- Create: `packages/harness-cli/tests/fixtures/golden/profile-resolution-{1,2,3}.yml`
- Create: `packages/harness-cli/tests/fixtures/golden/hard-floor-{1,2,3}.yml`
- Create: `packages/harness-cli/tests/fixtures/golden/push-risk-{1,2,3}.yml`
- Create: `packages/harness-cli/tests/fixtures/golden/knowledge-retrieval-{1,2,3}.yml`
- Create: `packages/harness-cli/tests/fixtures/golden/marker-parsing-{1,2,3}.yml`
- Create: `packages/harness-cli/tests/fixtures/golden/routing-{marker,tie-break,yolo-conflict,bugfix,refactor}.yml`
- Create: `packages/harness-cli/tests/golden.test.ts`（jest 跑全 20 fixture）

**Fixture 格式约定**：每个 fixture 含 `input` / `expected_output` / `description` 三段。golden.test.ts 跑现有 CLI 命令（`harness profile-resolve` / `harness push-check` / etc.）输出，与 expected_output 比较。

**Routing fixtures 必须覆盖 5 个独立路径**：
1. `.harness-profile` marker 显式解析（marker 命中 → 跳 fallback matchers）
2. matcher tie-break（同 priority 下用具体度决胜）
3. `/yolo` flag vs 公司 hard_floor 冲突（hard_floor 必须胜）
4. bugfix 路由（task_description 含"修 X bug"等触发词 → harness-bugfix）
5. refactor 路由（task_description 含"重构"或 `/refactor` flag → harness-refactor）

**Steps:**
1. 在 fixture 起草阶段，markdown 手算结果是 expected_output 起点
2. 起草后以 Layer 0 schema 校验（不能违反 schema）
3. golden.test.ts 跑现有 CLI 全输出，markdown 手算 / CLI / fixture expected 三方一致 → fixture 定稿
4. 任何不一致 → 在 fixture 标注，作为 Phase B/C 要 close 的 parity gap
5. Commit: `test(golden): 20 conformance fixtures (15 + routing 5) [PR A2.2] [depends on: PR A2.1]`

**Rollback:** `git revert <pr-a2.2-sha>`。外部副作用：fixture 已被 import 的 jest test（如 golden.test.ts）会 fail → 同步 revert；fixture 已被 commit 进 git → revert 自动恢复，无需 .bak。

---

## Phase B：直接用法薄化 + Layer 1 contracts（A2 完成后；可与 Phase C 并行；3 PR）

### PR B1：harness-common/references → harness-common/contracts/（rename + 重组）

**Files:**
- Rename: `harness-common/references/` → `harness-common/contracts/`
- Modify: 所有引用旧路径的文档（grep `harness-common/references/` 扫一遍）

**Steps:**
1. `git mv harness-common/references/ harness-common/contracts/`
2. grep 全仓引用旧路径 → 替换 → 同步
3. 加每个 contract 文件顶部 source-of-truth header
4. 跑 jest（应 107 PASS）
5. Commit: `refactor(contracts): rename references/ to contracts/ + source-of-truth header [PR B1] [depends on: PR A2.2]`

**Rollback:** `git revert <pr-b1-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

### PR B2：补全 contracts/（14 文件确保都存在 + 内容齐备）

**Files:**
- Verify exists: `harness-common/contracts/profile.md / task-type.md / aggression-mode.md / push-decision.md / knowledge.md / memory.md / autonomy.md / reviewer-gates.md / drift.md / phase-init.md / hooks.md / hard-floor-enforcement.md / doctor-protocol.md / routing.md`
- Migrate from `harness/harness-common/references/` 旧的 knowledge-retrieval.md / project-scanner.md 等到 contracts/knowledge.md（合并）
- Migrate from `harness/harness-common/references/` 旧的 phase-init.md → contracts/phase-init.md
- Create: `harness-common/contracts/hard-floor-enforcement.md`（spec §14 #10）
- Create: `harness-common/contracts/routing.md`（spec §Routing-as-CLI 设计要点）

**Steps:**
1. 检查现有 contracts/ 哪些文件缺；迁移 / 创建
2. 每个 contract 顶部加 source-of-truth header → constants.ts 或对应 schema.json
3. 删 Claude Code 专属概念引用（claude-mem / Skill 工具）
4. 跑 jest（应 107 PASS）
5. Commit: `feat(contracts): complete 14 narrative contracts + cross-tool portability [PR B2] [depends on: PR B1]`

**Rollback:** `git revert <pr-b2-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

### PR B3：直接用法 SKILL 薄化（4 leaf skill 引用 contracts，删内嵌规则）

**Files:**
- Modify: `harness-quick/SKILL.md`（顶层；保留流程顺序 + 调用清单 + 紧凑 operational summary，删长篇规则展开）
- Modify: `harness-bugfix/SKILL.md`（同）
- Modify: `harness-feature/SKILL.md`（同）
- Modify: `harness-refactor/SKILL.md`（同）

**目标行数**：feature 404 → 150；refactor 368 → 130；bugfix 270 → 100；quick 153 → 80（如果当前已是顶层薄壳版本，可能已达标，仅需小修）。

**Steps:**
1. 读现有 SKILL，识别"规则展开" vs "流程顺序 + 调用清单"
2. 把规则展开内容迁到对应 contracts/*.md。**显式映射**：
   - push 决策规则 → `harness-common/contracts/push-decision.md`
   - hard-floor 强制 → `harness-common/contracts/hard-floor-enforcement.md`
   - autonomy 决策树 → `harness-common/contracts/autonomy.md`
   - knowledge retrieval / Stage -0.5 → `harness-common/contracts/knowledge.md`
   - reviewer 4 硬门 → `harness-common/contracts/reviewer-gates.md`
   - memory 三层权限 → `harness-common/contracts/memory.md`
   - drift detection → `harness-common/contracts/drift.md`
   - phase init → `harness-common/contracts/phase-init.md`
3. SKILL.md 改为"调用 contracts/X.md 规则 + 列出执行步骤"
4. 跑 jest（应 107 PASS）
5. Commit: `refactor(skills): thin direct-usage SKILL files (reference contracts/) [PR B3] [depends on: PR B2]`

**Rollback:** `git revert <pr-b3-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

---

## Phase C：CLI 用法 parity 补全（A2 完成后；可与 Phase B 并行；6 PR）

### PR C1：`harness profile-resolve --json`（命令拆分）

**Files:**
- Create: `packages/harness-cli/src/commands/profile-resolve.ts`
- Modify: `packages/harness-cli/src/cli.ts`（注册子命令）
- Create: `packages/harness-cli/tests/commands/profile-resolve.test.ts`

**Steps:**
1. 实现：读 .harness-profile marker（YAML）+ ~/.claude/profiles/*.yml，跑 profile resolution algorithm，输出 JSON `{profile_name, resolved_by, matched_pattern}`
2. fixture-based jest test（用 PR A2.2 的 profile-resolution-* fixtures）
3. 跑 golden.test.ts → 该命令对应 fixture 必须全 PASS
4. Commit: `feat(profile-resolve): CLI command for profile resolution [PR C1] [depends on: PR A2.2]`

**Rollback:** `git revert <pr-c1-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

### PR C2：`harness scan --json`（Knowledge Scanner 完整实现）

**Files:**
- Modify (existing): `packages/harness-cli/src/commands/scan.ts`（已存在；本 PR 补全 5-domain manifest 完整实现）
- Create: `packages/harness-cli/src/utils/knowledge.ts`（5-domain manifest 扫描逻辑）
- Modify: `packages/harness-cli/src/cli.ts`
- Create: `packages/harness-cli/tests/commands/scan.test.ts`
- Create: `packages/harness-cli/tests/utils/knowledge.test.ts`
- Migrate logic from: `harness/harness-common/references/project-scanner.md` 或现有 A 套 scanner 实现

**Steps:**
1. 实现 5-domain（API / DB / 业务规则 / 配置 / 部署）manifest 扫描
2. 输出 JSON {domain, manifest, rules[], examples[]}，conform knowledge.schema.json
3. fixture-based jest test
4. golden.test.ts 该命令对应 fixture 全 PASS
5. Commit: `feat(scan): CLI Knowledge Scanner with 5-domain manifest [PR C2] [depends on: PR C1]`

**Rollback:** `git revert <pr-c2-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

### PR C3：Stage -0.5 retrieval + 8-field knowledgeCheck

**Files:**
- Create: `packages/harness-cli/src/utils/knowledge-retrieval.ts`（含 8-field knowledgeCheck state）
- Create: `packages/harness-cli/tests/utils/knowledge-retrieval.test.ts`

**Steps:**
1. 实现 8 字段 knowledgeCheck 状态对象（spec §14 #6 + knowledgeCheck.schema.json）
2. fixture-based jest test
3. Commit: `feat(retrieval): Stage -0.5 with 8-field knowledgeCheck [PR C3] [depends on: PR C2]（注：retrieval 输出由 PR C5 route 消费，不修改 scan.ts；本 PR 仅创建 utils/knowledge-retrieval.ts）`

**Rollback:** `git revert <pr-c3-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

### PR C4：`harness memory check --json`

**Files:**
- Create: `packages/harness-cli/src/commands/memory.ts`
- Create: `packages/harness-cli/src/utils/memory.ts`（三层权限矩阵 + 文件读写工具）
- Modify: `packages/harness-cli/src/cli.ts`（注册子命令）
- Create: `packages/harness-cli/tests/commands/memory.test.ts`
- Create: `packages/harness-cli/tests/utils/memory.test.ts`

**Steps:**
1. 读 docs/memory/{decisions,cases,errors}.md 文件，按三层权限矩阵校验写入 stage 是否合法
2. 输出 JSON {layer, allowed_writers, current_violations[]}
3. fixture-based jest test
4. Commit: `feat(memory): CLI memory contract check [PR C4] [depends on: PR C3]`

**Rollback:** `git revert <pr-c4-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

### PR C5：`harness route` 命令（统一执行点）

**Files:**
- Create: `packages/harness-cli/src/commands/route.ts`（合并 profile-resolve + fast-path + aggression + hard-floor + knowledge retrieval）
- Modify: `packages/harness-cli/src/cli.ts`
- Create: `packages/harness-cli/tests/commands/route.test.ts`

**Steps:**
1. 实现：调 profile-resolve.ts → 加载 profile yml → 跑 fast-path 检测 → 解析 aggression → 装载 hard-floor → 调 knowledge-retrieval.ts → 拼装 route-output JSON
2. 输出 conform route-output.schema.json（leaf_skill / resolved_profile / resolved_mode / task_description / hard_floor / knowledge_manifest / fast_path_hit / context_to_inject）
3. fixture-based jest test（用 PR A2.2 的 routing-* 5 fixtures）
4. golden.test.ts 全套 PASS
5. Commit: `feat(route): unified routing CLI command [PR C5] [depends on: PR C3]（route 不依赖 memory check）`

**Rollback:** `git revert <pr-c5-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

### PR C6：profile-entry SKILL → Tier-3 fallback + 删除冗余

**Files:**
- Modify: `profile-entry/SKILL.md`（顶层；改为 Tier-3 fallback 角色描述）
- Modify: 4 leaf SKILL（`harness-{quick,bugfix,feature,refactor}/SKILL.md`，加"调用 harness route" 引用）
- Modify: `harness/profile-entry/SKILL.md`（改为 alias 指向顶层 + 部分内容迁 contracts/）

**Steps:**
1. 顶层 profile-entry SKILL 内容改为"Tier 3 fallback 路径，参 contracts/routing.md"
2. 4 leaf SKILL 加 input contract section: "通过 harness route --json 获取 route object（CLI 用法）/ 通过 profile-entry SKILL 手算（Tier 3 fallback）"
3. harness/profile-entry/SKILL.md 改为 thin alias
4. Commit: `refactor(profile-entry): Tier-3 fallback role + leaf SKILL input contract [PR C6] [depends on: PR C5, PR B3]（同改 4 leaf SKILL，必须串行）`

**Rollback:** `git revert <pr-c6-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

---

## Phase D：跨工具 Wrapper Kernel（A2 完成后；可与 B/C 并行；2 PR）

### PR D1：AGENTS.md + Claude Code SKILL kernel（Tier-1）

**Files:**
- Create: `AGENTS.md`（仓库根，Codex 等读）
- Modify: `harness-init/SKILL.md`（顶层入口 SKILL.md kernel section）

**Steps:**
1. 写 AGENTS.md，含完整 7 条 kernel 规则（spec §Layer 3）+ 引用 contracts/
2. harness-init/SKILL.md 内嵌相同 kernel section（duplicated 而非 one-line pointer）
3. smoke test：手动用 Codex / Claude Code 跑一遍接入流程，AI 能从 wrapper 读到 7 条规则
4. Commit: `feat(wrappers): AGENTS.md + SKILL.md kernel duplicated for Tier-1 tools [PR D1] [depends on: PR A2.2]`

**Rollback:** `git revert <pr-d1-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

### PR D2：.cursor/rules + CONVENTIONS.md + .github/copilot-instructions.md（Tier-2）

**Files:**
- Create: `.cursor/rules/harness.md`
- Create: `CONVENTIONS.md`
- Create: `.aider.conf.yml`（指向 CONVENTIONS.md）
- Create: `.github/copilot-instructions.md`

**Steps:**
1. 4 个 wrapper 各自含完整 7 条 kernel + 引用 contracts/
2. smoke test：Cursor / Aider / Copilot 各跑一次，AI 能引用规则
3. Commit: `feat(wrappers): Tier-2 wrapper kernels for Cursor/Aider/Copilot [PR D2] [depends on: PR D1]`

**Rollback:** `git revert <pr-d2-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

---

## Phase E：Cleanup（其他 Phase 全完成后；2 PR）

### PR E1：claude-mem 反转依赖

**Files:**
- Modify: `harness-init/SKILL.md`（claude-mem 从 required → optional）
- Modify: `harness-feature/SKILL.md` Stage 8（memory observation 改 docs/memory/* 为主，claude-mem 为 optional acceleration）
- Modify: 其他 SKILL 中 claude-mem required 引用，改为 optional

**Steps:**
1. grep 全仓 `claude-mem` 引用，识别哪些是 required 哪些是 optional
2. 改 required → optional + 把"必需"行为改成"docs/memory/* 文件"
3. Commit: `refactor(memory): invert claude-mem dependency to optional [PR E1] [depends on: PR B3, PR C6, PR D2]（Phase B/C/D 收敛点）`

**Rollback:** `git revert <pr-e1-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

### PR E2：删除冗余 + 文档同步

**Files:**
- Delete: `harness/harness-quick/SKILL.md`（A 套已被 B3 薄化的顶层 SKILL 取代）
- Delete: `harness/harness-bugfix/SKILL.md`（同）
- Delete: `harness/harness-feature/SKILL.md`（同）
- Delete: `harness/harness-refactor/SKILL.md`（同）
- Delete: `harness/profile-entry/SKILL.md`（被 C6 改 alias 后冗余）
- Delete: `harness/setup/setup-harness.sh`（被 PR A1 marker YAML 后已无独立逻辑，B 套 install 替代）
- 保留：`harness/profile-bootstrap/lib/`（Tier 3 fallback bash + test oracle）
- Modify: 顶层 `README.md` 反映新架构（4 层 + 14 能力 + 两种用法 + 跨工具）
- Modify: `harness/README.md` 改为"直接用法接入文档（不依赖 npm CLI）"，去掉"独立实现"措辞
- Modify: `packages/harness-cli/README.md` 加 8 → 多个新命令（profile-resolve / scan / route / memory）

**Steps:**
1. 跑 jest 全套（应 ≥ 107 PASS + 新增 contract test）
2. 跑 schema-drift CI workflow（应通过）
3. 检查 SKILL frontmatter / description 不含 v2/重构/迭代字眼
4. 检查 contracts/ 14 文件齐备 + 顶部 source-of-truth header
5. Commit: `chore(cleanup): remove redundancy + sync docs [PR E2] [depends on: PR E1]`

**Rollback:** `git revert <pr-e2-sha>`。如有外部副作用（生成的文件 / settings.json 改动 / hook 注册），按对应 .bak 文件恢复。

---

## 实施顺序硬约束

```
PR A1 → PR A2.1 → PR A2.2 ─┬─→ PR B1 → PR B2 → PR B3 ─┐
                            ├─→ PR C1 → C2 → C3 ─┬─→ PR C5 → C6 ─┤
                            │                  └─→ PR C4 ────────────┤
                            ├─→ PR D1 → PR D2 ─────────┐         │
                            │                          │         │
                            ▼                          ▼         ▼
                         （3 路并行收敛到 Phase E）─→ PR E1 → PR E2
```

跨 Phase 严格串行；Phase 内 PR 按 `[depends on]` 边裁定顺序（无 dep 关联的同 Phase PR 才允许并行）。每 PR commit message 必须含 `[depends on: PR X]` tag。

总计：16 PR（A1 + A2.1 + A2.2 + B1 + B2 + B3 + C1-C6 + D1 + D2 + E1 + E2）/ ~25 新文件 / ~35 修改文件 / 估计 ~70 commits。

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| PR B3 薄化时丢规则细节 | 先在 PR B2 完成 contracts/ 内容，B3 只迁引用 |
| PR C5 route 命令复杂，子模块多 | 拆分到 C1-C4 子命令，C5 只是 orchestration |
| Phase D smoke test 覆盖不全 | Tier-1 用 Claude Code + Codex 强制；Tier-2 三工具 best-effort |
| claude-mem 反转破坏现有用户工作流 | PR E1 加 migration note，optional 不删 |

---

## 验收标准

- jest 全套 ≥ 107 PASS（baseline）+ 新增 fixtures contract test 全绿
- schema-drift CI workflow 绿（regen 后 git diff 为空）
- contracts/ 14 个 markdown 文件存在 + 顶部 source-of-truth header
- 14 能力 × 直接用法 / CLI 用法 = 28 cell 全有实现
- 跨工具 smoke test：Claude Code / Codex 必过，Cursor / Aider / Copilot best-effort
- SKILL 文件 frontmatter / description 无版本字眼（v2 / 重构 / 迭代）
- 顶层 README.md 反映新架构
