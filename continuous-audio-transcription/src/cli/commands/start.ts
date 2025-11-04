/**
 * Start Command
 * サービス起動コマンド
 */

import * as child_process from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

/**
 * Start the transcription service using PM2
 */
export async function startCommand(): Promise<void> {
  try {
    // Check if process is already running
    const { stdout: listOutput } = await exec('pm2 jlist');
    const processes = JSON.parse(listOutput);
    const existing = processes.find(
      (p: any) => p.name === 'continuous-transcription'
    );

    if (existing && existing.pm2_env.status === 'online') {
      console.error('Error: Transcription service is already running');
      console.error(`PID: ${existing.pid}`);
      process.exit(1);
    }

    // Start the service using PM2
    const ecosystemPath = path.join(__dirname, '../../../ecosystem.config.js');
    await exec(`pm2 start ${ecosystemPath}`);

    // Get process info
    const { stdout: infoOutput } = await exec('pm2 jlist');
    const updatedProcesses = JSON.parse(infoOutput);
    const started = updatedProcesses.find(
      (p: any) => p.name === 'continuous-transcription'
    );

    if (started && started.pid) {
      console.log('Transcription service started successfully');
      console.log(`PID: ${started.pid}`);
      console.log(`Status: ${started.pm2_env.status}`);
    } else {
      console.error('Error: Failed to start transcription service');
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error starting transcription service:', error.message);
    } else {
      console.error('Error starting transcription service:', error);
    }
    process.exit(1);
  }
}
