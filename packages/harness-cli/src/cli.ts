#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'node:path';
import { runInit } from './commands/init.js';
import { runAdopt } from './commands/adopt.js';

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

program.parse();
