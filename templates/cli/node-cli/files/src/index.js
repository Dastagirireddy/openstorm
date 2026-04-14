#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('{{project-name}}')
  .description('A CLI tool built with Node.js and Commander')
  .version('1.0.0');

program
  .option('-n, --name <name>', 'Name to greet')
  .option('-v, --verbose', 'Enable verbose output')
  .action((options) => {
    if (options.verbose) {
      console.log('Verbose mode enabled');
    }

    if (options.name) {
      console.log(`Hello, ${options.name}!`);
    } else {
      console.log(`Hello from {{project-name}}!`);
    }
  });

program.parse();
