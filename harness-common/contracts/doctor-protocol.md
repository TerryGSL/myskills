# `harness doctor --json` 握手契约

> **Source of truth**: `packages/harness-cli/src/types/constants.ts`（或对应 `doctor-protocol.schema.json`）。如本文档与代码不一致，以代码为准。

Canonical schema for what `harness doctor --json` returns and how skills must consume it.

## 输出 schema（5 必填 + 3 辅助字段）

```json
{
  "version": "0.1.0",
  "schema_version": "1.0.0",
  "installed_presets": ["preset:personal"],
  "managed_files_git_status": "untracked",
  "workflow_schema_version": "1.0.0",
  "profile": "harness",
  "issues": [
    {
      "severity": "error" | "warn" | "info",
      "code": "<stable-code>",
      "message": "<human-readable>"
    }
  ],
  "exitCode": 0 | 1 | 2
}
```

### 必填五字段（team-init v1 依赖）

| 字段 | 语义 | 消费方用法 |
|------|------|-----------|
| `version` | CLI 版本 | 对比 skill 期望最低版本 |
| `schema_version` | bundled schema 版本 | 双向兼容判定（见下文哨兵） |
| `installed_presets` | harness.config.json 的 extends 字段 | 检查企业 preset 是否已装 |
| `managed_files_git_status` | `untracked` / `tracked` / `not-present` | 若 tracked → 立即提示用户 `git rm --cached` |
| `issues[]` | 问题清单 | 按 severity 分组呈现给用户 |

### 辅助三字段

- `workflow_schema_version`：读自 `.harness/current.json.workflow_schema_version`
- `profile`：读自 `.harness-profile.profile`
- `exitCode`：0 = healthy；1 = warn（任一 warn）；2 = error（任一 error）

## 消费方（skill 侧）握手流程

```
1. spawn `harness doctor --json` with `workspaceRoot` as cwd
2. parse JSON from stdout
3. if exit !== 0 or stderr contains "command not found":
     abort with "CLI not installed; run: npm install -g harness-workflow-cli"
4. compare version/schema_version（见哨兵）
5. surface any issue with severity=error → abort
6. surface warn → show but continue
```

## Schema 版本双向哨兵（AD4）

### 方向 1：Skill 较新，CLI 较老

`cli.schema_version < skill-expected minimum` → 提示：
```
CLI version too old. Expected schema ≥ X, got Y.
Run: npm install -g harness-workflow-cli@latest
```

### 方向 2：Project 较新，CLI 较老（AD4 核心）

`cli.schema_version` < `.harness/current.json.workflow_schema_version`
→ **硬 abort**（不降级尝试）：
```
Project state (.harness/current.json) was written by a newer CLI version.
Current CLI: <X>, project requires ≥<Y>. Please upgrade CLI before retry.
```

**为什么硬 abort**：用老版 CLI 读新版 schema 的状态文件，未定义行为会腐蚀状态。

## 稳定 Issue Codes（可脚本 grep）

| code | severity | 含义 |
|------|---------|------|
| `managed-files-tracked` | error | `.harness/managed-files.json` 被 git tracked |
| `schema-too-new` | error | 项目 schema 高于 CLI 理解 |
| `current-json-unparseable` | error | `.harness/current.json` 不是合法 JSON |
| `missing-schema-sentinel` | warn | 老版项目缺 `workflow_schema_version`（可 migrate） |
| `memory-tree-incomplete` | warn | `docs/memory/` 不完整，跑 `harness adopt` |
| `no-profile-marker` | warn | `.harness-profile` missing |
| `java-standards-missing` | warn | company-mt 依赖的独立 Java skill 未装（degraded fallback 仍可跑） |

## 实际输出示例

### 干净新 init 项目

```json
{
  "version": "0.1.0",
  "schema_version": "1.0.0",
  "installed_presets": ["preset:personal"],
  "managed_files_git_status": "untracked",
  "workflow_schema_version": "1.0.0",
  "profile": "harness",
  "issues": [],
  "exitCode": 0
}
```

### 有 warn 但能继续

```json
{
  "version": "0.1.0",
  "schema_version": "1.0.0",
  "installed_presets": [],
  "managed_files_git_status": "not-present",
  "workflow_schema_version": null,
  "profile": null,
  "issues": [
    {"severity": "warn", "code": "no-profile-marker", "message": ".harness-profile missing — run 'harness init' or 'harness adopt'"},
    {"severity": "warn", "code": "memory-tree-incomplete", "message": "docs/memory/* missing — run 'harness adopt'"}
  ],
  "exitCode": 1
}
```

### Error（硬 abort）

```json
{
  "version": "0.1.0",
  "schema_version": "1.0.0",
  "installed_presets": [],
  "managed_files_git_status": "tracked",
  "workflow_schema_version": "99.0.0",
  "profile": "harness",
  "issues": [
    {"severity": "error", "code": "managed-files-tracked", "message": ".harness/managed-files.json is tracked by git. Run: git rm --cached .harness/managed-files.json"},
    {"severity": "error", "code": "schema-too-new", "message": "project wants schema 99.0.0 but CLI supports up to 1.0.0 — upgrade CLI"}
  ],
  "exitCode": 2
}
```

## 实现位置

- Command：`packages/harness-cli/src/commands/doctor.ts` (`runDoctor`)
- Types：`packages/harness-cli/src/commands/doctor.ts` (`DoctorResult` interface)
