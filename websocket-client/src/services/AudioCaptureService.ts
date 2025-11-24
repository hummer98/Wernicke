/**
 * Audio Capture Service
 * FFmpegを使用した音声キャプチャサービス
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { AudioCaptureError } from '../types/errors';
import { BufferManager } from './BufferManager';
import { logger } from './Logger';

export interface AudioCaptureConfig {
  deviceName: string;
  sampleRate: number;
  channels: number;
  format: string;
}

export interface AudioStatistics {
  bytesCapture: number;
  uptime: number;
  restartCount: number;
  lastRestartTime?: Date;
}

/**
 * Audio Capture Service using FFmpeg
 * FFmpegを使用して音声デバイスから音声をストリーミングキャプチャ
 */
export class AudioCaptureService extends EventEmitter {
  private config: AudioCaptureConfig;
  private ffmpegProcess: ChildProcess | null = null;
  private running: boolean = false;
  private statistics: AudioStatistics;
  private retryCount: number = 0;
  private maxRetries: number = 3;
  private retryDelay: number = 10000; // 10 seconds
  private startTime?: Date;
  private bufferManager: BufferManager;
  private maxAutoRestarts: number = 3; // Task 13.1: Maximum auto-restart attempts

  constructor(config: AudioCaptureConfig) {
    super();
    this.config = config;
    this.statistics = {
      bytesCapture: 0,
      uptime: 0,
      restartCount: 0,
    };

    // Initialize BufferManager
    this.bufferManager = new BufferManager({
      bufferDuration: 30, // 30 seconds
      sampleRate: config.sampleRate,
      channels: config.channels,
      format: config.format,
      tempDir: '/tmp/transcription-buffers',
      enableVAD: true, // Enable voice activity detection
    });
  }

  /**
   * Get current configuration
   */
  public getConfig(): AudioCaptureConfig {
    return { ...this.config };
  }

  /**
   * Check if service is running
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Get FFmpeg process ID
   */
  public getProcessId(): number | null {
    return this.ffmpegProcess?.pid ?? null;
  }

  /**
   * Get retry count
   */
  public getRetryCount(): number {
    return this.retryCount;
  }

  /**
   * Get statistics
   */
  public getStatistics(): AudioStatistics {
    if (this.startTime !== undefined) {
      this.statistics.uptime = Date.now() - this.startTime.getTime();
    }
    return { ...this.statistics };
  }

  /**
   * Get buffer manager
   */
  public getBufferManager(): BufferManager {
    return this.bufferManager;
  }

  /**
   * Start audio capture
   */
  public async start(): Promise<void> {
    if (this.running) {
      throw new AudioCaptureError('Audio capture is already running');
    }

    this.retryCount = 0;
    await this.startWithRetry();
  }

  /**
   * Start FFmpeg with retry logic
   */
  private async startWithRetry(): Promise<void> {
    while (this.retryCount < this.maxRetries) {
      try {
        await this.startFFmpeg();
        this.retryCount = 0; // Reset on success
        return;
      } catch (error) {
        this.retryCount++;
        if (this.retryCount >= this.maxRetries) {
          throw new AudioCaptureError(
            `Failed to start FFmpeg after ${this.maxRetries} attempts: ${error}`
          );
        }
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
      }
    }
  }

  /**
   * Start FFmpeg process
   */
  private async startFFmpeg(): Promise<void> {
    return new Promise((resolve, reject) => {
      // FFmpeg command for macOS (avfoundation)
      const args = [
        '-f',
        'avfoundation',
        '-i',
        `:${this.config.deviceName}`,
        '-ar',
        this.config.sampleRate.toString(),
        '-ac',
        this.config.channels.toString(),
        '-f',
        this.config.format,
        '-', // Output to stdout
      ];

      this.ffmpegProcess = spawn('ffmpeg', args);

      let started = false;

      // Handle stdout data
      this.ffmpegProcess.stdout?.on('data', async (chunk: Buffer) => {
        if (!started) {
          started = true;
          this.running = true;
          this.startTime = new Date();
          resolve();
        }

        this.statistics.bytesCapture += chunk.length;
        this.emit('data', chunk);

        // Add chunk to buffer
        const isFull = this.bufferManager.addChunk(chunk);

        // If buffer is full, flush to file
        if (isFull) {
          try {
            const filePath = await this.bufferManager.flush();
            if (filePath !== null) {
              this.emit('bufferFlushed', filePath);
            } else {
              // Buffer was skipped due to silence
              this.emit('bufferSkipped');
            }
          } catch (error) {
            this.emit('error', new AudioCaptureError(`Failed to flush buffer: ${error}`));
          }
        }
      });

      // Handle stderr (FFmpeg logs to stderr)
      let stderrData = '';
      this.ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        stderrData += data.toString();

        // Check for device errors
        if (stderrData.includes('No such device') || stderrData.includes('not found')) {
          if (!started) {
            reject(new AudioCaptureError('Audio device not found'));
          }
        }
      });

      // Handle process exit
      this.ffmpegProcess.on('exit', (code) => {
        this.running = false;
        this.ffmpegProcess = null;

        if (code !== 0 && code !== null) {
          const error = new AudioCaptureError(`FFmpeg exited with code ${code}`);
          this.emit('error', error);

          // Auto-restart logic
          this.autoRestart();
        }
      });

      // Handle process errors
      this.ffmpegProcess.on('error', (error) => {
        if (!started) {
          reject(new AudioCaptureError(`Failed to spawn FFmpeg: ${error.message}`));
        } else {
          this.emit('error', error);
        }
      });

      // Timeout for initial start
      setTimeout(() => {
        if (!started) {
          this.stop();
          reject(new AudioCaptureError('FFmpeg start timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Auto-restart FFmpeg on crash
   * Task 13.1: FFmpegクラッシュハンドリング
   * - Maximum 3 restart attempts
   * - Emit fatalError after max attempts
   * - Detailed error logging with troubleshooting guidance
   */
  private async autoRestart(): Promise<void> {
    this.statistics.restartCount++;
    this.statistics.lastRestartTime = new Date();

    // Task 13.1: Check if maximum restart attempts reached
    if (this.statistics.restartCount > this.maxAutoRestarts) {
      const errorMessage = `FFmpeg has crashed and reached maximum restart attempts (${this.maxAutoRestarts}).\n\n` +
        `Troubleshooting steps:\n` +
        `1. Check if the audio device '${this.config.deviceName}' is properly connected\n` +
        `2. Verify FFmpeg is installed correctly: ffmpeg -version\n` +
        `3. Check system audio settings and permissions\n` +
        `4. Review FFmpeg logs for specific error details\n` +
        `5. Try restarting the application or the system\n\n` +
        `If the problem persists, please contact support with the error logs.`;

      logger.error('FFmpeg maximum restart attempts reached', {
        restartCount: this.statistics.restartCount,
        maxRestarts: this.maxAutoRestarts,
        deviceName: this.config.deviceName,
      });

      const fatalError = new AudioCaptureError(errorMessage, {
        restartCount: this.statistics.restartCount,
        lastRestartTime: this.statistics.lastRestartTime,
        deviceName: this.config.deviceName,
      });

      this.emit('fatalError', fatalError);
      return;
    }

    logger.warn('FFmpeg crashed, scheduling restart', {
      delaySeconds: this.retryDelay / 1000,
      attempt: this.statistics.restartCount,
      maxRestarts: this.maxAutoRestarts,
    });

    await new Promise((resolve) => setTimeout(resolve, this.retryDelay));

    try {
      await this.startFFmpeg();
      logger.info('FFmpeg restarted successfully', {
        attempt: this.statistics.restartCount,
      });
    } catch (error) {
      logger.error('Auto-restart attempt failed', {
        attempt: this.statistics.restartCount,
        error: error instanceof Error ? error.message : String(error),
      });
      this.emit('error', new AudioCaptureError(`Auto-restart failed: ${error}`));
    }
  }

  /**
   * Stop audio capture
   */
  public async stop(): Promise<void> {
    if (this.ffmpegProcess !== null) {
      this.ffmpegProcess.kill('SIGTERM');
      this.ffmpegProcess = null;
    }
    this.running = false;

    // Cleanup buffer manager
    await this.bufferManager.cleanup();
  }

  /**
   * Simulate crash (for testing)
   */
  public simulateCrash(): void {
    if (this.ffmpegProcess !== null) {
      this.ffmpegProcess.kill('SIGKILL');
    }
  }
}
