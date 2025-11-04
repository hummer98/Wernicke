/**
 * Status Command
 * ステータス表示コマンド
 */

import * as child_process from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

interface StatusOptions {
  json?: boolean;
}

/**
 * Show the transcription service status
 */
export async function statusCommand(options: StatusOptions): Promise<void> {
  try {
    // Get PM2 process info
    const { stdout: listOutput } = await exec('pm2 jlist');
    const processes = JSON.parse(listOutput);
    const process = processes.find(
      (p: any) => p.name === 'continuous-transcription'
    );

    if (!process) {
      if (options.json) {
        console.log(
          JSON.stringify({
            status: 'stopped',
            message: 'Transcription service is not running',
          })
        );
      } else {
        console.log('Status: Stopped');
        console.log('Transcription service is not running');
      }
      return;
    }

    // Collect status information
    const status = {
      status: process.pm2_env.status,
      pid: process.pid,
      uptime: process.pm2_env.pm_uptime
        ? Date.now() - process.pm2_env.pm_uptime
        : 0,
      restarts: process.pm2_env.restart_time || 0,
      cpu: process.monit?.cpu || 0,
      memory: process.monit?.memory || 0,
    };

    // Try to read health check data if available
    const baseDir = process.env.TRANSCRIPTION_BASE_DIR || '~/transcriptions';
    const healthFile = path.join(baseDir, '.health', 'latest.json');

    try {
      const healthData = await fs.readFile(healthFile, 'utf-8');
      const health = JSON.parse(healthData);
      Object.assign(status, { health });
    } catch {
      // Health data not available
    }

    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log('=== Transcription Service Status ===');
      console.log(`Status: ${status.status}`);
      console.log(`PID: ${status.pid}`);
      console.log(`Uptime: ${formatUptime(status.uptime)}`);
      console.log(`Restarts: ${status.restarts}`);
      console.log(`CPU: ${status.cpu.toFixed(1)}%`);
      console.log(`Memory: ${formatBytes(status.memory)}`);

      if ((status as any).health) {
        const health = (status as any).health;
        console.log('\n=== Health Metrics ===');
        console.log(`Last Check: ${health.timestamp}`);
        console.log(`CPU Usage: ${health.cpu.usage.toFixed(1)}%`);
        console.log(`Memory Usage: ${formatBytes(health.memory.heapUsed)}`);
        console.log(`Disk Free: ${formatBytes(health.disk.available)}`);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error getting status:', error.message);
    } else {
      console.error('Error getting status:', error);
    }
    process.exit(1);
  }
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format bytes in human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}
