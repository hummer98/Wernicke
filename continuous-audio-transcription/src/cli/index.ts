#!/usr/bin/env node
/**
 * CLI Entry Point
 * コマンドラインインターフェース
 */

import { Command } from 'commander';
import { startCommand } from './commands/start';
import { stopCommand } from './commands/stop';
import { statusCommand } from './commands/status';
import { logsCommand } from './commands/logs';

const program = new Command();

program
  .name('transcribe')
  .description('24時間連続音声文字起こしシステム')
  .version('0.1.0');

// Register subcommands
program
  .command('start')
  .description('Start transcription service')
  .action(startCommand);

program
  .command('stop')
  .description('Stop transcription service')
  .action(stopCommand);

program
  .command('status')
  .description('Show service status')
  .option('-j, --json', 'Output as JSON')
  .action(statusCommand);

program
  .command('logs')
  .description('Show service logs')
  .option('-n, --lines <number>', 'Number of lines to show', '100')
  .option('-f, --follow', 'Follow log output')
  .option('-l, --level <level>', 'Filter by log level (error|warn|info|debug)')
  .action(logsCommand);

program.parse();
