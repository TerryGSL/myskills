#!/usr/bin/env node
// Thin wrapper so `bin/cli.js` is the published entry point (standard npm layout).
// The actual implementation is compiled to dist/ by `tsc`.
import('../dist/cli.js').catch((err) => {
  console.error('harness-workflow-cli failed to start:');
  console.error(err);
  process.exit(1);
});
