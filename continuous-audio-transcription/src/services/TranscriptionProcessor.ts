/**
 * Transcription Processor
 * 音声処理とCUDA連携を統合するプロセッサー
 */

import { BufferManager } from './BufferManager';
import { CUDAServerClient, TranscriptionResponse } from './CUDAServerClient';

export interface ProcessorStatistics {
  totalProcessed: number; // Total buffers processed
  totalSkipped: number; // Buffers skipped due to silence (VAD)
  totalFailed: number; // Buffers failed due to server errors
  consecutiveFailures: number; // Current consecutive failures
}

export interface AlertInfo {
  message: string;
  consecutiveFailures: number;
  lastError: string;
}

export type AlertCallback = (alert: AlertInfo) => void;

/**
 * Transcription Processor
 * BufferManagerとCUDAServerClientを統合し、音声処理フローを管理
 */
export class TranscriptionProcessor {
  private bufferManager: BufferManager;
  private cudaClient: CUDAServerClient;
  private statistics: ProcessorStatistics;
  private alertCallback?: AlertCallback;
  private lastError: string = '';

  constructor(bufferManager: BufferManager, cudaClient: CUDAServerClient) {
    this.bufferManager = bufferManager;
    this.cudaClient = cudaClient;
    this.statistics = {
      totalProcessed: 0,
      totalSkipped: 0,
      totalFailed: 0,
      consecutiveFailures: 0,
    };
  }

  /**
   * Set alert callback for consecutive failures
   */
  public setAlertCallback(callback: AlertCallback): void {
    this.alertCallback = callback;
  }

  /**
   * Process buffer and send to CUDA server if voice detected
   * Returns transcription result or null if skipped/failed
   */
  public async processBuffer(): Promise<TranscriptionResponse | null> {
    this.statistics.totalProcessed++;

    try {
      // Flush buffer to file
      const filePath = await this.bufferManager.flush();

      // Check if buffer was skipped due to silence (VAD)
      if (filePath === null) {
        console.log('[TranscriptionProcessor] Buffer skipped due to silence (VAD)');
        this.statistics.totalSkipped++;
        return null;
      }

      // Send to CUDA server for transcription
      try {
        const result = await this.cudaClient.transcribe(filePath);

        // Success - reset consecutive failures
        this.statistics.consecutiveFailures = 0;

        // Delete temp file after successful transcription
        await this.bufferManager.deleteFile(filePath);

        return result;
      } catch (error) {
        // Transcription failed
        this.statistics.totalFailed++;
        this.statistics.consecutiveFailures++;
        this.lastError = error instanceof Error ? error.message : 'Unknown error';

        console.error(
          `[TranscriptionProcessor] Transcription failed (${this.statistics.consecutiveFailures} consecutive): ${this.lastError}`
        );

        // Delete temp file after failed transcription
        await this.bufferManager.deleteFile(filePath);

        // Send alert after 3 consecutive failures
        if (this.statistics.consecutiveFailures === 3 && this.alertCallback) {
          this.alertCallback({
            message: '3 consecutive transcription failures detected',
            consecutiveFailures: this.statistics.consecutiveFailures,
            lastError: this.lastError,
          });
        }

        return null;
      }
    } catch (error) {
      // Buffer flush failed
      console.error('[TranscriptionProcessor] Buffer flush failed:', error);
      this.statistics.totalFailed++;
      this.statistics.consecutiveFailures++;
      this.lastError = error instanceof Error ? error.message : 'Unknown error';

      return null;
    }
  }

  /**
   * Get statistics
   */
  public getStatistics(): ProcessorStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      totalProcessed: 0,
      totalSkipped: 0,
      totalFailed: 0,
      consecutiveFailures: 0,
    };
    this.lastError = '';
  }
}
