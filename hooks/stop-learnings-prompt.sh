#!/usr/bin/env bash
# stop-learnings-prompt.sh
# 会话停止时检查 .harness/learnings/LEARNINGS.md 是否在本会话被 append；
# 没有的话向用户输出一行提示，建议补一条 LRN。
# 仅提示，不阻塞 Stop。

set -uo pipefail

# 读 stdin（Claude Code hook 传入 JSON），目前只用 cwd/session_id 字段
INPUT="$(cat 2>/dev/null || true)"

# 找当前 git repo 根
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO_ROOT" ]; then
  echo '{"continue":true,"suppressOutput":true}'
  exit 0
fi

LEARNINGS_FILE="$REPO_ROOT/.harness/learnings/LEARNINGS.md"
if [ ! -f "$LEARNINGS_FILE" ]; then
  # 项目未启用 harness learnings，静默退出
  echo '{"continue":true,"suppressOutput":true}'
  exit 0
fi

# 看 LEARNINGS.md 在最近 4 小时内有没有被改过（本会话 proxy）
NOW_SEC=$(date +%s)
FILE_MTIME=$(stat -f %m "$LEARNINGS_FILE" 2>/dev/null || stat -c %Y "$LEARNINGS_FILE" 2>/dev/null || echo 0)
DELTA=$((NOW_SEC - FILE_MTIME))

# 4 小时阈值（14400 秒）
if [ "$DELTA" -lt 14400 ]; then
  # 最近改过，OK
  echo '{"continue":true,"suppressOutput":true}'
  exit 0
fi

# 已超 4 小时没改 → 提示
cat <<'JSON'
{
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "[HARNESS Stop hook] 本会话尚未向 .harness/learnings/LEARNINGS.md 追加任何 LRN 条目。若本会话有用户纠正 / 偏好 / 非平凡发现，请补一条：\n\n```\n## [LRN-YYYYMMDD-NNN] <slug>\n**Logged**: <ISO-8601>  **Status**: resolved\n### Summary\n<一句话规则>\n### Why\n<用户原话或纠正动机>\n### Related Files\n<paths>\n```\n\n纯 typo / 格式化 / 用户明确说不用记 → 忽略本提示。"
}
JSON
