#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('harness')
  .description('Harness workflow CLI')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize harness in a new project')
  .action(() => {
    console.log('TODO: implemented in Round 3');
    process.exit(1);
  });

program.parse();
