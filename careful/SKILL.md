---
name: careful
version: 0.1.0
description: |
  Safety guardrails for destructive commands. Warns before rm -rf, DROP TABLE,
  force-push, git reset --hard, kubectl delete, and similar destructive operations.
  User can override each warning. Use when touching prod, debugging live systems,
  or working in a shared environment. Use when asked to "be careful", "safety mode",
  "prod mode", or "careful mode". (gstack)
triggers:
  - be careful
  - warn before destructive
  - safety mode
allowed-tools:
  - Bash
  - Read
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "bash ${CLAUDE_SKILL_DIR}/bin/check-careful.sh"
          statusMessage: "Checking for destructive commands..."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

> **Vendored from gstack@ed1e4be2 (2026-04-26)**.
> Path references rewritten to harness-native locations (state files now under `~/.harness/safety/` instead of the upstream-default state directory)
> Originally lived in gstack submodule; now part of harness namespace.
> Upgrades to upstream are manual: re-clone gstack temporarily, diff, sync changes if relevant.

> **Harness governance note**：当本仓库的 active profile 在 `hard_floor` 列表里含
> `destructive_ops` / `rewrite_history` / `auto_push` / `force_push` 时，本 skill 的
> "可 override 警告" 行为**失效**——hard_floor 优先级最高（参 `harness-common/contracts/hard-floor-enforcement.md`）。
> 命中 hard_floor 的操作直接 REFUSE，不再询问 / 不可被 flag 绕过。
> 本 skill 的 override 通道仅在 hard_floor **不含**对应 flag 时生效。

# /careful — 危险命令守门

安全模式**已激活**。每条 bash 命令在执行前都会先扫一遍危险模式；命中即提示警告，
你可以选择继续或取消（除非命中下面 governance note 里说的 hard_floor，那种情况下直接 REFUSE）。

```bash
mkdir -p ~/.harness/safety/analytics
echo '{"skill":"careful","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","repo":"'$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")'"}'  >> ~/.harness/safety/analytics/skill-usage.jsonl 2>/dev/null || true
```

## 拦截哪些命令

| 模式 | 示例 | 风险 |
|------|------|------|
| `rm -rf` / `rm -r` / `rm --recursive` | `rm -rf /var/data` | 递归删除 |
| `DROP TABLE` / `DROP DATABASE` | `DROP TABLE users;` | 数据丢失 |
| `TRUNCATE` | `TRUNCATE orders;` | 数据丢失 |
| `git push --force` / `-f` | `git push -f origin main` | 改写远端历史 |
| `git reset --hard` | `git reset --hard HEAD~3` | 未提交工作丢失 |
| `git checkout .` / `git restore .` | `git checkout .` | 未提交工作丢失 |
| `kubectl delete` | `kubectl delete pod` | 影响生产 |
| `docker rm -f` / `docker system prune` | `docker system prune -a` | 容器/镜像丢失 |

## 不会触发警告的安全场景

以下模式默认放行（构建产物/缓存目录的清理是常规操作）：
- `rm -rf node_modules` / `.next` / `dist` / `__pycache__` / `.cache` / `build` / `.turbo` / `coverage`

## 工作原理

hook 从 tool input JSON 里读出命令，对照上面表里的模式扫描；命中则返回
`permissionDecision: "ask"` 附带警告消息。你可以选择继续覆盖警告。

要关闭：结束当前会话或新开一个会话。hook 是 session-scoped 的，自动失效。
