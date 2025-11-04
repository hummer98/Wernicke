/**
 * Stop Command
 * サービス停止コマンド
 */

import * as child_process from 'child_process';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

/**
 * Stop the transcription service using PM2
 */
export async function stopCommand(): Promise<void> {
  try {
    // Check if process is running
    const { stdout: listOutput } = await exec('pm2 jlist');
    const processes = JSON.parse(listOutput);
    const existing = processes.find(
      (p: any) => p.name === 'continuous-transcription'
    );

    if (!existing || existing.pm2_env.status !== 'online') {
      console.error('Error: Transcription service is not running');
      process.exit(1);
    }

    // Stop the service
    console.log('Stopping transcription service...');
    await exec('pm2 stop continuous-transcription');

    // Delete from PM2 process list
    await exec('pm2 delete continuous-transcription');

    console.log('Transcription service stopped successfully');
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error stopping transcription service:', error.message);
    } else {
      console.error('Error stopping transcription service:', error);
    }
    process.exit(1);
  }
}
