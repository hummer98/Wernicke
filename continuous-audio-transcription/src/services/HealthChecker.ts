/**
 * Health Checker
 * ヘルスチェックとアラート
 */

export interface HealthCheckerConfig {
  transcriptionTimeoutMinutes?: number; // Timeout in minutes (default: 5)
  errorThresholdPerHour?: number; // Error threshold per hour (default: 10)
}

export interface TranscriptionTimeoutResult {
  timedOut: boolean;
  minutesSinceLastSuccess: number;
}

export interface ErrorThresholdResult {
  exceeded: boolean;
  currentCount: number;
  threshold: number;
}

export interface HealthCheckerStatistics {
  totalErrors: number;
  currentHourErrors: number;
  transcriptionTimeoutAlerts: number;
  errorThresholdAlerts: number;
}

/**
 * Health Checker
 * 文字起こしのヘルスチェックとエラートラッキング
 */
export class HealthChecker {
  private config: Required<HealthCheckerConfig>;
  private statistics: HealthCheckerStatistics;
  private lastTranscriptionTime: Date | null;
  private errorThresholdAlerted: boolean; // Flag to prevent multiple alerts per hour

  constructor(config: HealthCheckerConfig) {
    this.config = {
      transcriptionTimeoutMinutes: config.transcriptionTimeoutMinutes ?? 5,
      errorThresholdPerHour: config.errorThresholdPerHour ?? 10,
    };
    this.statistics = {
      totalErrors: 0,
      currentHourErrors: 0,
      transcriptionTimeoutAlerts: 0,
      errorThresholdAlerts: 0,
    };
    this.lastTranscriptionTime = null;
    this.errorThresholdAlerted = false;
  }

  /**
   * Get configuration
   */
  public getConfig(): Required<HealthCheckerConfig> {
    return { ...this.config };
  }

  /**
   * Record successful transcription
   */
  public recordTranscriptionSuccess(timestamp: Date): void {
    this.lastTranscriptionTime = timestamp;
  }

  /**
   * Get last transcription time
   */
  public getLastTranscriptionTime(): Date | null {
    return this.lastTranscriptionTime;
  }

  /**
   * Check if transcription has timed out
   */
  public checkTranscriptionTimeout(now: Date): TranscriptionTimeoutResult {
    if (this.lastTranscriptionTime === null) {
      this.statistics.transcriptionTimeoutAlerts++;
      console.warn('[HealthChecker] No transcription has occurred yet');
      return {
        timedOut: true,
        minutesSinceLastSuccess: Infinity,
      };
    }

    const diffMs = now.getTime() - this.lastTranscriptionTime.getTime();
    const diffMinutes = Math.floor(diffMs / 1000 / 60);

    const timedOut = diffMinutes >= this.config.transcriptionTimeoutMinutes;

    if (timedOut) {
      this.statistics.transcriptionTimeoutAlerts++;
      console.warn(
        `[HealthChecker] Transcription timeout: ${diffMinutes} minutes since last success (threshold: ${this.config.transcriptionTimeoutMinutes} minutes)`
      );
    }

    return {
      timedOut,
      minutesSinceLastSuccess: diffMinutes,
    };
  }

  /**
   * Record an error
   */
  public recordError(_errorMessage: string): void {
    this.statistics.totalErrors++;
    this.statistics.currentHourErrors++;
  }

  /**
   * Check if error threshold has been exceeded
   */
  public checkErrorThreshold(): ErrorThresholdResult {
    const exceeded = this.statistics.currentHourErrors > this.config.errorThresholdPerHour;

    if (exceeded && !this.errorThresholdAlerted) {
      this.statistics.errorThresholdAlerts++;
      this.errorThresholdAlerted = true;
      console.error(
        `[HealthChecker] Error threshold exceeded: ${this.statistics.currentHourErrors} errors in current hour (threshold: ${this.config.errorThresholdPerHour})`
      );
    }

    return {
      exceeded,
      currentCount: this.statistics.currentHourErrors,
      threshold: this.config.errorThresholdPerHour,
    };
  }

  /**
   * Reset hourly error count
   * Should be called every hour
   */
  public resetHourlyErrorCount(): void {
    this.statistics.currentHourErrors = 0;
    this.errorThresholdAlerted = false;
  }

  /**
   * Get statistics
   */
  public getStatistics(): HealthCheckerStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      totalErrors: 0,
      currentHourErrors: 0,
      transcriptionTimeoutAlerts: 0,
      errorThresholdAlerts: 0,
    };
    this.lastTranscriptionTime = null;
    this.errorThresholdAlerted = false;
  }
}
