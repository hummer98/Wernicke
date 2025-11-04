/**
 * Logs Command
 * ログ表示コマンド
 */

import * as child_process from 'child_process';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

interface LogsOptions {
  lines?: string;
  follow?: boolean;
  level?: string;
}

/**
 * Show service logs
 */
export async function logsCommand(options: LogsOptions): Promise<void> {
  try {
    const lines = parseInt(options.lines || '100', 10);

    if (options.follow) {
      // Use PM2's built-in log following
      const pm2Process = child_process.spawn('pm2', [
        'logs',
        'continuous-transcription',
        '--lines',
        lines.toString(),
      ]);

      pm2Process.stdout.on('data', (data) => {
        const output = data.toString();
        if (options.level) {
          // Filter by log level
          const filtered = filterByLevel(output, options.level);
          if (filtered) {
            process.stdout.write(filtered);
          }
        } else {
          process.stdout.write(output);
        }
      });

      pm2Process.stderr.on('data', (data) => {
        process.stderr.write(data.toString());
      });

      pm2Process.on('close', (code) => {
        if (code !== 0) {
          process.exit(code || 1);
        }
      });

      // Handle Ctrl+C gracefully
      process.on('SIGINT', () => {
        pm2Process.kill('SIGINT');
        process.exit(0);
      });
    } else {
      // Get logs from PM2
      const { stdout } = await exec(
        `pm2 logs continuous-transcription --lines ${lines} --nostream`
      );

      if (options.level) {
        // Filter by log level
        const filtered = filterByLevel(stdout, options.level);
        console.log(filtered);
      } else {
        console.log(stdout);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error getting logs:', error.message);
    } else {
      console.error('Error getting logs:', error);
    }
    process.exit(1);
  }
}

/**
 * Filter logs by level
 */
function filterByLevel(logs: string, level: string): string {
  const lines = logs.split('\n');
  const levelUpper = level.toUpperCase();

  const filtered = lines.filter((line) => {
    // Look for log level indicators in the line
    if (levelUpper === 'ERROR') {
      return line.includes('[ERROR]') || line.includes('ERROR:');
    } else if (levelUpper === 'WARN') {
      return line.includes('[WARN]') || line.includes('WARN:');
    } else if (levelUpper === 'INFO') {
      return line.includes('[INFO]') || line.includes('INFO:');
    } else if (levelUpper === 'DEBUG') {
      return line.includes('[DEBUG]') || line.includes('DEBUG:');
    }
    return true;
  });

  return filtered.join('\n');
}
