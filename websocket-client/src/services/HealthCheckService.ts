/**
 * Health Check Service
 * Task 14.2: クライアント側ヘルスチェック機能
 *
 * Features:
 * - 60-second interval health checks
 * - Server response logging
 * - Warning logs on abnormal detection
 * - Health check statistics tracking
 */

import axios from 'axios';

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  active_sessions?: number;
  gpu_vram_used_mb?: number;
  gpu_vram_total_mb?: number;
  reason?: string;
}

export interface HealthCheckStatistics {
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  lastCheckTime?: Date;
  consecutiveFailures: number;
}

/**
 * Health Check Service
 * Periodically checks server health and logs statistics
 */
export class HealthCheckService {
  private healthCheckUrl: string;
  private intervalMs: number = 60000; // 60 seconds
  private intervalId: NodeJS.Timeout | null = null;
  private running: boolean = false;

  // Statistics
  private statistics: HealthCheckStatistics = {
    totalChecks: 0,
    successfulChecks: 0,
    failedChecks: 0,
    consecutiveFailures: 0,
  };

  constructor(healthCheckUrl: string, intervalMs: number = 60000) {
    this.healthCheckUrl = healthCheckUrl;
    this.intervalMs = intervalMs;
  }

  /**
   * Start health check service
   */
  public start(): void {
    if (this.running) {
      console.log('Health check service is already running');
      return;
    }

    this.running = true;
    console.log(`Health check service started (interval: ${this.intervalMs}ms)`);

    // Perform initial health check
    this.performHealthCheck();

    // Schedule periodic health checks
    this.intervalId = setInterval(() => {
      this.performHealthCheck();
    }, this.intervalMs);
  }

  /**
   * Stop health check service
   */
  public stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    console.log('Health check service stopped');
  }

  /**
   * Check if service is running
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Get health check statistics
   */
  public getStatistics(): HealthCheckStatistics {
    return { ...this.statistics };
  }

  /**
   * Perform health check
   * Task 14.2: 60秒ごとのヘルスチェック実行
   */
  private async performHealthCheck(): Promise<void> {
    this.statistics.totalChecks++;
    this.statistics.lastCheckTime = new Date();

    try {
      const response = await axios.get<HealthCheckResponse>(this.healthCheckUrl);

      // Task 14.2.2: サーバー応答のログ記録
      this.logHealthCheckResponse(response.status, response.data);

      // Task 14.2.3: 異常検出時の警告ログ
      if (response.status === 503 || response.data.status === 'unhealthy') {
        this.logUnhealthyWarning(response.data);
        this.statistics.successfulChecks++; // Still a successful HTTP request (got response)
        this.statistics.consecutiveFailures++;
      } else {
        this.statistics.successfulChecks++;
        this.statistics.consecutiveFailures = 0; // Reset on success
      }
    } catch (error) {
      // Task 14.2.3: 異常検出時の警告ログ
      this.logHealthCheckError(error);
      this.statistics.failedChecks++;
      this.statistics.consecutiveFailures++;
    }

    // Task 14.2.4: ヘルスチェック統計の記録
    this.logStatistics();
  }

  /**
   * Log health check response
   * Task 14.2.2: サーバー応答のログ記録
   */
  private logHealthCheckResponse(status: number, data: HealthCheckResponse): void {
    console.log(`Health check: status=${data.status}, httpStatus=${status}`);

    if (data.active_sessions !== undefined) {
      console.log(`  Active sessions: ${data.active_sessions}`);
    }

    if (data.gpu_vram_used_mb !== undefined && data.gpu_vram_total_mb !== undefined) {
      const usagePercent = ((data.gpu_vram_used_mb / data.gpu_vram_total_mb) * 100).toFixed(1);
      console.log(
        `  GPU VRAM: ${data.gpu_vram_used_mb.toFixed(0)}MB / ${data.gpu_vram_total_mb.toFixed(0)}MB (${usagePercent}%)`
      );
    }
  }

  /**
   * Log unhealthy warning
   * Task 14.2.3: 異常検出時の警告ログ
   */
  private logUnhealthyWarning(data: HealthCheckResponse): void {
    console.warn(`WARNING: Server is unhealthy!`);
    if (data.reason) {
      console.warn(`  Reason: ${data.reason}`);
    }
    console.warn(`  Consecutive failures: ${this.statistics.consecutiveFailures + 1}`);
  }

  /**
   * Log health check error
   * Task 14.2.3: 異常検出時の警告ログ
   */
  private logHealthCheckError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Health check failed: ${errorMessage}`);
    console.error(`  Consecutive failures: ${this.statistics.consecutiveFailures + 1}`);
  }

  /**
   * Log statistics
   * Task 14.2.4: ヘルスチェック統計の記録
   */
  private logStatistics(): void {
    if (this.statistics.totalChecks % 10 === 0) {
      // Log statistics every 10 checks
      console.log('--- Health Check Statistics ---');
      console.log(`  Total checks: ${this.statistics.totalChecks}`);
      console.log(`  Successful: ${this.statistics.successfulChecks}`);
      console.log(`  Failed: ${this.statistics.failedChecks}`);
      console.log(`  Consecutive failures: ${this.statistics.consecutiveFailures}`);
      console.log(`  Success rate: ${((this.statistics.successfulChecks / this.statistics.totalChecks) * 100).toFixed(1)}%`);
      console.log('-------------------------------');
    }
  }
}
