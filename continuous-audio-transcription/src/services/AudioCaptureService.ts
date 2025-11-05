/**
 * Audio Capture Service
 * FFmpegを使用した音声キャプチャサービス
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { AudioCaptureError } from '../types/errors';
import { BufferManager } from './BufferManager';

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
   */
  private async autoRestart(): Promise<void> {
    this.statistics.restartCount++;
    this.statistics.lastRestartTime = new Date();

    console.log('FFmpeg crashed, restarting in 10 seconds...');

    await new Promise((resolve) => setTimeout(resolve, this.retryDelay));

    try {
      await this.startFFmpeg();
    } catch (error) {
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
