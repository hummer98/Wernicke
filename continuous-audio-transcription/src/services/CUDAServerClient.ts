/**
 * CUDA Server Client
 * CUDAサーバーとのHTTP通信クライアント
 */

import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';

export interface CUDAServerConfig {
  serverUrl: string;
  timeout: number; // milliseconds
}

export interface TranscriptionSegment {
  start: number; // seconds
  end: number;
  text: string;
  speaker: string; // "Speaker_00", "Speaker_01", etc.
  confidence: number; // 0.0-1.0
}

export interface TranscriptionResponse {
  segments: TranscriptionSegment[];
  language: string;
  duration: number; // seconds
}

export interface ClientStatistics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number; // milliseconds
}

/**
 * CUDA Server HTTP Client
 * CUDAサーバーへのHTTPリクエスト送信とレスポンス処理
 */
export class CUDAServerClient {
  private config: CUDAServerConfig;
  private statistics: ClientStatistics;
  private responseTimes: number[] = [];

  constructor(config: CUDAServerConfig) {
    this.config = config;
    this.statistics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
    };
  }

  /**
   * Get configuration
   */
  public getConfig(): CUDAServerConfig {
    return { ...this.config };
  }

  /**
   * Check if CUDA server is healthy
   */
  public async checkHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.config.serverUrl}/health`, {
        timeout: 5000, // 5 seconds for health check
      });

      return response.status === 200 && response.data.status === 'ok';
    } catch (error) {
      return false;
    }
  }

  /**
   * Transcribe audio file
   * Includes retry logic (3 attempts with exponential backoff)
   */
  public async transcribe(audioPath: string): Promise<TranscriptionResponse> {
    this.statistics.totalRequests++;
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.transcribeWithoutRetry(audioPath);
        this.statistics.successfulRequests++;
        return result;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on 400/422 errors (client errors)
        if (error instanceof Error && 'response' in error) {
          const axiosError = error as AxiosError;
          if (axiosError.response?.status === 400 || axiosError.response?.status === 422) {
            this.statistics.failedRequests++;
            throw error;
          }
        }

        // Wait before retry (exponential backoff: 1s, 2s, 4s)
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    this.statistics.failedRequests++;
    throw lastError || new Error('Transcription failed after 3 retries');
  }

  /**
   * Transcribe audio file (single attempt, no retry)
   */
  private async transcribeWithoutRetry(audioPath: string): Promise<TranscriptionResponse> {
    const startTime = Date.now();

    try {
      // Create form data with audio file
      const formData = new FormData();
      formData.append('audio', fs.createReadStream(audioPath));

      // Send POST request to CUDA server
      const response = await axios.post(
        `${this.config.serverUrl}/transcribe`,
        formData,
        {
          timeout: this.config.timeout,
          headers: {
            ...formData.getHeaders(),
          },
        }
      );

      // Track response time
      const responseTime = Date.now() - startTime;
      this.responseTimes.push(responseTime);
      this.updateAverageResponseTime();

      return response.data as TranscriptionResponse;
    } catch (error) {
      // Handle axios errors
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error(`Request timeout after ${this.config.timeout}ms`);
        }

        if (error.response) {
          const status = error.response.status;
          const errorMessage =
            error.response.data?.error || error.response.data?.message || 'Unknown error';

          throw new Error(`Server error (${status}): ${errorMessage}`);
        }

        if (error.request || error.code === 'ECONNREFUSED') {
          throw new Error('No response from server - connection failed');
        }
      }

      throw error;
    }
  }

  /**
   * Update average response time
   */
  private updateAverageResponseTime(): void {
    if (this.responseTimes.length === 0) {
      this.statistics.averageResponseTime = 0;
      return;
    }

    const sum = this.responseTimes.reduce((acc, time) => acc + time, 0);
    this.statistics.averageResponseTime = sum / this.responseTimes.length;
  }

  /**
   * Get statistics
   */
  public getStatistics(): ClientStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
    };
    this.responseTimes = [];
  }
}
