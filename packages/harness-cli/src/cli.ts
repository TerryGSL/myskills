#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'node:path';
import { runInit } from './commands/init.js';
import { runAdopt } from './commands/adopt.js';
import { runDoctor } from './commands/doctor.js';
import { runMaintain } from './commands/maintain.js';
import { runScan } from './commands/scan.js';

const program = new Command();

program
  .name('harness')
  .description('Harness workflow CLI')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize harness in a new project')
  .option('-p, --preset <preset>', 'Preset to apply (personal | company-mt)', 'personal')
  .option('-a, --agent-type <agent>', 'Agent type (claude; codex reserved)', 'claude')
  .option('-f, --force', 'Bypass conflict detection (personal only)', false)
  .argument('[projectPath]', 'Project root (defaults to cwd)', '.')
  .action((projectPath, opts) => {
    const projectRoot = path.resolve(projectPath);
    const preset = opts.preset === 'company-mt' ? 'company-mt' : 'personal';
    const r = runInit({
      projectRoot,
      preset,
      agentType: opts.agentType,
      force: opts.force,
    });
    process.stdout.write(`profile: ${r.profile}\n`);
    process.stdout.write(`wrote ${r.filesWritten.length} files\n`);
    for (const f of r.filesWritten) process.stdout.write(`  + ${f}\n`);
    if (r.conflicts.length) {
      process.stderr.write(`conflicts (.rej written):\n`);
      for (const f of r.conflicts) process.stderr.write(`  ! ${f}\n`);
    }
    if (r.blockedBy) {
      process.stderr.write(`BLOCKED at ${r.blockedBy} (company-mt hard_floor)\n`);
    }
    process.exit(r.exitCode);
  });

program
  .command('adopt')
  .description('Adopt harness into an existing project (only fills missing)')
  .option('-p, --preset <preset>', 'Preset (personal | company-mt)', 'personal')
  .option('-a, --agent-type <agent>', 'Agent type', 'claude')
  .option('-f, --force', 'Bypass conflict detection (personal only)', false)
  .argument('[projectPath]', 'Project root (defaults to cwd)', '.')
  .action((projectPath, opts) => {
    const projectRoot = path.resolve(projectPath);
    const preset = opts.preset === 'company-mt' ? 'company-mt' : 'personal';
    const r = runAdopt({
      projectRoot,
      preset,
      agentType: opts.agentType,
      force: opts.force,
    });
    process.stdout.write(`profile: ${r.profile}\n`);
    process.stdout.write(`synced ${r.filesWritten.length} files\n`);
    if (r.conflicts.length) {
      process.stderr.write(`conflicts (.rej written):\n`);
      for (const f of r.conflicts) process.stderr.write(`  ! ${f}\n`);
    }
    if (r.blockedBy) {
      process.stderr.write(`BLOCKED at ${r.blockedBy}\n`);
    }
    process.exit(r.exitCode);
  });

program
  .command('doctor')
  .description('Health check: managed-files git status, schema version, profile, memory tree')
  .option('--json', 'JSON output (for bootstrap skill handshake)', false)
  .argument('[projectPath]', 'Project root (defaults to cwd)', '.')
  .action((projectPath, opts) => {
    const projectRoot = path.resolve(projectPath);
    const r = runDoctor({ projectRoot });
    if (opts.json) {
      process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    } else {
      process.stdout.write(`harness-workflow-cli ${r.version} (schema ${r.schema_version})\n`);
      process.stdout.write(`profile: ${r.profile ?? '(none)'}\n`);
      process.stdout.write(`managed-files git: ${r.managed_files_git_status}\n`);
      process.stdout.write(`workflow_schema_version: ${r.workflow_schema_version ?? '(unset)'}\n`);
      for (const i of r.issues) {
        process.stdout.write(`[${i.severity.toUpperCase()}] ${i.code}: ${i.message}\n`);
      }
    }
    process.exit(r.exitCode);
  });

program
  .command('maintain')
  .description('Drift check + promotable learnings reminder')
  .option('-p, --preset <preset>', 'Preset', 'personal')
  .option('--upgrade', 'Re-apply bundled templates with four-state conflict handling', false)
  .argument('[projectPath]', 'Project root', '.')
  .action((projectPath, opts) => {
    const projectRoot = path.resolve(projectPath);
    const preset = opts.preset === 'company-mt' ? 'company-mt' : 'personal';
    const r = runMaintain({ projectRoot, preset, upgrade: opts.upgrade });
    process.stdout.write(`health issues: ${r.healthIssues}\n`);
    process.stdout.write(`promotable learnings: ${r.promotableFlags.length}\n`);
    for (const f of r.promotableFlags) {
      process.stdout.write(`  [${f.reason}] ${f.file} / ${f.id}${f.days ? ` (${f.days}d)` : ''}\n`);
    }
    if (r.upgrade) {
      process.stdout.write(`upgrade: wrote ${r.upgrade.filesWritten.length}, conflicts ${r.upgrade.conflicts.length}\n`);
      if (r.upgrade.blockedBy) process.stderr.write(`BLOCKED at ${r.upgrade.blockedBy}\n`);
    }
    process.exit(r.exitCode);
  });

program
  .command('scan')
  .description('Request knowledge scan (AI pipeline runs via harness-workflow Stage -0.5)')
  .option('--apply-answers', 'Apply user answers in TODO.md', false)
  .option('--budget <min>', 'Time budget in minutes', '28')
  .option('--domain <name>', 'Limit to one domain')
  .argument('[projectPath]', 'Project root', '.')
  .action((projectPath, opts) => {
    const projectRoot = path.resolve(projectPath);
    const r = runScan({
      projectRoot,
      applyAnswers: opts.applyAnswers,
      budgetMin: opts.budget ? Number(opts.budget) : undefined,
      domain: opts.domain,
    });
    process.stdout.write(`scan: ${r.action}\n`);
    if (r.reason) process.stderr.write(`${r.reason}\n`);
    process.exit(r.exitCode);
  });

program.parse();
