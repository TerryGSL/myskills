#!/bin/bash
# Check for dangling references to nested harness/ paths that have been removed.
# Retained nested paths (NOT flagged):
#   - harness/profile-bootstrap/lib/  (Tier 3 fallback + test oracle)
#   - harness/hooks/context-monitor.sh  (symlink to top-level)
#   - harness/docs/   (historical archive)
#   - harness/harness-workflow/specs/, plans/  (historical archive)
set -euo pipefail

# Patterns matching REMOVED nested paths only.
# Use word boundaries / specific suffixes to avoid matching retained paths.
hits=$(grep -rEl \
  "harness/setup(/|\b)|harness/profile-bootstrap/SKILL\.md|harness/harness-common/references|harness/harness-workflow/references|harness/harness-quick/SKILL\.md|harness/harness-bugfix/SKILL\.md|harness/harness-feature/SKILL\.md|harness/harness-refactor/SKILL\.md" \
  --include="*.md" --include="*.sh" --include="*.ts" --include="*.yml" --include="*.json" \
  --exclude-dir=node_modules \
  --exclude-dir=.legacy-backup-2026-04 \
  --exclude-dir=harness-workflow.legacy-backup-2026-04 \
  --exclude-dir=dist \
  . 2>/dev/null | grep -v "^\./docs/superpowers/" | grep -v "^\./harness/" | grep -v "^\./scripts/check-nested-harness-refs\.sh$" || true)

if [[ -n "$hits" ]]; then
  echo "✗ Dangling refs to removed nested harness/ paths in:"
  echo "$hits"
  exit 1
fi
echo "✓ No dangling refs to removed nested harness/ paths"
