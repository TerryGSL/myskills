---
name: unfreeze
version: 0.1.0
description: |
  Clear the freeze boundary set by /freeze, allowing edits to all directories
  again. Use when you want to widen edit scope without ending the session.
  Use when asked to "unfreeze", "unlock edits", "remove freeze", or
  "allow all edits". (gstack)
triggers:
  - unfreeze edits
  - unlock all directories
  - remove edit restrictions
allowed-tools:
  - Bash
  - Read
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

> **Vendored from gstack@ed1e4be2 (2026-04-26)**.
> Path references rewritten to harness-native locations (state files now under `~/.harness/safety/` instead of the upstream-default state directory).
> Originally lived in gstack submodule; now part of harness namespace.
> Upgrades to upstream are manual: re-clone gstack temporarily, diff, sync changes if relevant.

> **Harness governance note**：当本仓库的 active profile 在 `hard_floor` 列表里含
> `destructive_ops` / `rewrite_history` / `auto_push` / `force_push` 时，本 skill 的
> "可 override 警告" 行为**失效**——hard_floor 优先级最高（参 `harness-common/contracts/hard-floor-enforcement.md`）。
> 命中 hard_floor 的操作直接 REFUSE，不再询问 / 不可被 flag 绕过。
> 本 skill 的 override 通道仅在 hard_floor **不含**对应 flag 时生效。

# /unfreeze — Clear Freeze Boundary

Remove the edit restriction set by `/freeze`, allowing edits to all directories.

```bash
mkdir -p ~/.harness/safety/analytics
echo '{"skill":"unfreeze","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","repo":"'$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")'"}'  >> ~/.harness/safety/analytics/skill-usage.jsonl 2>/dev/null || true
```

## Clear the boundary

```bash
STATE_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.harness/safety}"
if [ -f "$STATE_DIR/freeze-dir.txt" ]; then
  PREV=$(cat "$STATE_DIR/freeze-dir.txt")
  rm -f "$STATE_DIR/freeze-dir.txt"
  echo "Freeze boundary cleared (was: $PREV). Edits are now allowed everywhere."
else
  echo "No freeze boundary was set."
fi
```

Tell the user the result. Note that `/freeze` hooks are still registered for the
session — they will just allow everything since no state file exists. To re-freeze,
run `/freeze` again.
