/**
 * Process Manager
 * プロセス管理と自動復旧
 */

export interface ProcessManagerConfig {
  restartIntervalHours?: number; // Restart interval in hours (default: 1)
  maxRestartsPerHour?: number; // Maximum restarts per hour before alerting (default: 3)
}

export interface ProcessManagerStatistics {
  totalRestarts: number;
  recentRestarts: number; // Restarts within the last hour
}

/**
 * Process Manager
 * プロセスの再起動管理とクラッシュ検出
 */
export class ProcessManager {
  private config: Required<ProcessManagerConfig>;
  private statistics: ProcessManagerStatistics;
  private restartHistory: Date[]; // Recent restart timestamps
  private lastRestartTime: Date | null;

  constructor(config: ProcessManagerConfig) {
    this.config = {
      restartIntervalHours: config.restartIntervalHours ?? 1,
      maxRestartsPerHour: config.maxRestartsPerHour ?? 3,
    };
    this.statistics = {
      totalRestarts: 0,
      recentRestarts: 0,
    };
    this.restartHistory = [];
    this.lastRestartTime = null;
  }

  /**
   * Get configuration
   */
  public getConfig(): Required<ProcessManagerConfig> {
    return { ...this.config };
  }

  /**
   * Clean up old restart records outside the time window
   */
  private cleanupRestartHistory(referenceTime?: Date): void {
    const now = referenceTime ? referenceTime.getTime() : Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    this.restartHistory = this.restartHistory.filter((timestamp) => {
      return timestamp.getTime() > oneHourAgo;
    });

    this.statistics.recentRestarts = this.restartHistory.length;
  }

  /**
   * Record a restart
   */
  public recordRestart(timestamp: Date): void {
    this.restartHistory.push(timestamp);
    this.lastRestartTime = timestamp;
    this.statistics.totalRestarts++;

    // Clean up old records using the recorded timestamp as reference
    this.cleanupRestartHistory(timestamp);
  }

  /**
   * Check if restart is needed based on interval
   */
  public shouldRestart(now: Date): boolean {
    if (this.lastRestartTime === null) {
      // Don't restart immediately on first check
      return false;
    }

    const timeSinceLastRestart = now.getTime() - this.lastRestartTime.getTime();
    const intervalMs = this.config.restartIntervalHours * 60 * 60 * 1000;

    return timeSinceLastRestart >= intervalMs;
  }

  /**
   * Check if restart count is excessive
   */
  public isExcessiveRestarts(referenceTime?: Date): boolean {
    this.cleanupRestartHistory(referenceTime);
    return this.restartHistory.length > this.config.maxRestartsPerHour;
  }

  /**
   * Get last restart time
   */
  public getLastRestartTime(): Date | null {
    return this.lastRestartTime;
  }

  /**
   * Get statistics
   */
  public getStatistics(referenceTime?: Date): ProcessManagerStatistics {
    this.cleanupRestartHistory(referenceTime);
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      totalRestarts: 0,
      recentRestarts: 0,
    };
    this.restartHistory = [];
    this.lastRestartTime = null;
  }
}
