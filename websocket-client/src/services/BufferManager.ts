/**
 * Buffer Manager Service
 * 音声バッファ管理サービス
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { VoiceActivityDetector, VADResult } from './VoiceActivityDetector';
import { logger } from './Logger';

export interface BufferManagerConfig {
  bufferDuration: number; // seconds
  sampleRate: number;
  channels: number;
  format: string;
  tempDir: string;
  enableVAD?: boolean; // Enable voice activity detection (default: false)
}

export interface BufferStatistics {
  totalBytesProcessed: number;
  flushCount: number;
  bufferFillPercentage: number;
  skippedBuffers?: number; // Number of buffers skipped due to silence
}

/**
 * Buffer Manager for 30-second audio chunks
 * 30秒の音声チャンクをメモリバッファに蓄積し、一時ファイルに保存
 */
export class BufferManager {
  private config: BufferManagerConfig;
  private buffer: Buffer[] = [];
  private bufferSize: number = 0;
  private bufferCapacity: number;
  private statistics: BufferStatistics;
  private vad?: VoiceActivityDetector;
  private isFlushing: boolean = false;

  constructor(config: BufferManagerConfig) {
    this.config = config;

    // Calculate buffer capacity (duration * sampleRate * channels * bytes per sample)
    // s16le = 16-bit = 2 bytes per sample
    const bytesPerSample = 2;
    this.bufferCapacity =
      config.bufferDuration * config.sampleRate * config.channels * bytesPerSample;

    this.statistics = {
      totalBytesProcessed: 0,
      flushCount: 0,
      bufferFillPercentage: 0,
      skippedBuffers: 0,
    };

    // Initialize VAD if enabled
    if (config.enableVAD === true) {
      this.vad = new VoiceActivityDetector({
        sampleRate: config.sampleRate,
        channels: config.channels,
        silenceThreshold: -85, // dB (adjusted for low-volume BlackHole input)
        silenceDuration: 10, // seconds
        forceVoiceAfter: 300, // 5 minutes
      });
    }

    // Create temp directory
    this.ensureTempDir();
  }

  /**
   * Ensure temp directory exists
   */
  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.tempDir, { recursive: true });
    } catch (error) {
      // Ignore if already exists
    }
  }

  /**
   * Get buffer capacity in bytes
   */
  public getBufferCapacity(): number {
    return this.bufferCapacity;
  }

  /**
   * Get current buffer size in bytes
   */
  public getBufferSize(): number {
    return this.bufferSize;
  }

  /**
   * Add audio chunk to buffer
   * Returns true if buffer is full
   */
  public addChunk(chunk: Buffer): boolean {
    // Calculate remaining capacity
    const remaining = this.bufferCapacity - this.bufferSize;

    if (remaining <= 0) {
      // Buffer is already full
      return true;
    }

    // Add chunk (truncate if exceeds capacity)
    if (chunk.length > remaining) {
      this.buffer.push(chunk.subarray(0, remaining));
      this.bufferSize += remaining;
      this.statistics.totalBytesProcessed += remaining;
    } else {
      this.buffer.push(chunk);
      this.bufferSize += chunk.length;
      this.statistics.totalBytesProcessed += chunk.length;
    }

    // Update fill percentage
    this.statistics.bufferFillPercentage = (this.bufferSize / this.bufferCapacity) * 100;

    // Check if buffer is full
    return this.bufferSize >= this.bufferCapacity;
  }

  /**
   * Flush buffer to file and clear memory
   * Returns the file path, or null if buffer was skipped due to silence
   */
  public async flush(): Promise<string | null> {
    // Prevent concurrent flush calls (race condition fix)
    if (this.isFlushing) {
      return null; // Already flushing, skip this call
    }

    if (this.bufferSize === 0) {
      throw new Error('Buffer is empty');
    }

    this.isFlushing = true; // Acquire lock

    try {
      // Concatenate all buffer chunks
      const audioData = Buffer.concat(this.buffer);

      // Check for voice activity if VAD is enabled
      if (this.vad !== undefined) {
        const vadResult = this.vad.analyze(audioData);

        // Skip buffer if no voice detected
        if (!vadResult.isVoiceDetected) {
          logger.debug('Skipping silent buffer', {
            level: `${vadResult.averageLevel.toFixed(1)}dB`,
            silence: `${vadResult.silenceDuration.toFixed(1)}s`,
          });

          // Clear buffer and release memory
          this.buffer = [];
          this.bufferSize = 0;
          this.statistics.bufferFillPercentage = 0;
          if (this.statistics.skippedBuffers !== undefined) {
            this.statistics.skippedBuffers++;
          }

          return null; // Buffer skipped
        }
      }

      // Generate filename with timestamp (HH-MM-SS-mmm.wav)
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
      const filename = `${hours}-${minutes}-${seconds}-${milliseconds}.wav`;
      const filePath = path.join(this.config.tempDir, filename);

      // Create WAV file with header
      const wavBuffer = this.createWavBuffer(audioData);

      // Write to file
      await fs.writeFile(filePath, wavBuffer);

      // Clear buffer and release memory
      this.buffer = [];
      this.bufferSize = 0;
      this.statistics.flushCount++;
      this.statistics.bufferFillPercentage = 0;

      return filePath;
    } finally {
      this.isFlushing = false; // Always release lock
    }
  }

  /**
   * Create WAV buffer with header
   */
  private createWavBuffer(audioData: Buffer): Buffer {
    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + audioData.length, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // fmt chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(this.config.channels, 22);
    header.writeUInt32LE(this.config.sampleRate, 24);
    header.writeUInt32LE(this.config.sampleRate * this.config.channels * 2, 28); // byte rate
    header.writeUInt16LE(this.config.channels * 2, 32); // block align
    header.writeUInt16LE(16, 34); // bits per sample

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(audioData.length, 40);

    return Buffer.concat([header, audioData]);
  }

  /**
   * Delete temp file
   */
  public async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Get list of pending files in temp directory
   */
  public async getPendingFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.config.tempDir);
      return files
        .filter((f) => f.endsWith('.wav'))
        .map((f) => path.join(this.config.tempDir, f));
    } catch (error) {
      return [];
    }
  }

  /**
   * Cleanup all temp files
   */
  public async cleanup(): Promise<void> {
    const files = await this.getPendingFiles();
    for (const file of files) {
      await this.deleteFile(file);
    }
  }

  /**
   * Get statistics
   */
  public getStatistics(): BufferStatistics {
    return { ...this.statistics };
  }

  /**
   * Get VAD result (if enabled)
   */
  public getVADResult(): VADResult | null {
    if (this.vad === undefined) {
      return null;
    }

    // Analyze current buffer
    if (this.bufferSize === 0) {
      return null;
    }

    const audioData = Buffer.concat(this.buffer);
    return this.vad.analyze(audioData);
  }
}
