/**
 * Resource Monitor
 * システムリソース監視
 */

import * as os from 'os';

export interface ResourceMonitorConfig {
  memoryThresholdMB?: number; // Memory threshold in MB (default: 2048)
  cpuThresholdPercent?: number; // CPU threshold percentage (default: 50)
  cpuCheckDurationMinutes?: number; // Duration to check CPU (default: 5)
  checkIntervalMs?: number; // Check interval in milliseconds (default: 60000)
}

export interface MemoryUsage {
  rss: number; // Resident Set Size in MB
  heapTotal: number; // Total heap size in MB
  heapUsed: number; // Used heap size in MB
  external: number; // External memory in MB
}

export interface MemoryCheckResult {
  exceeded: boolean;
  currentMB: number;
  thresholdMB: number;
}

export interface CPUCheckResult {
  sustained: boolean;
  durationMinutes: number;
  averagePercent: number;
}

export interface ResourceMonitorStatistics {
  totalMemoryChecks: number;
  totalCPUChecks: number;
  memoryAlerts: number;
  cpuAlerts: number;
}

/**
 * Resource Monitor
 * メモリとCPU使用率を監視
 */
export class ResourceMonitor {
  private config: Required<ResourceMonitorConfig>;
  private statistics: ResourceMonitorStatistics;
  private cpuHistory: number[]; // Store CPU usage percentage history

  constructor(config: ResourceMonitorConfig) {
    this.config = {
      memoryThresholdMB: config.memoryThresholdMB ?? 2048,
      cpuThresholdPercent: config.cpuThresholdPercent ?? 50,
      cpuCheckDurationMinutes: config.cpuCheckDurationMinutes ?? 5,
      checkIntervalMs: config.checkIntervalMs ?? 60000,
    };
    this.statistics = {
      totalMemoryChecks: 0,
      totalCPUChecks: 0,
      memoryAlerts: 0,
      cpuAlerts: 0,
    };
    this.cpuHistory = [];
  }

  /**
   * Get configuration
   */
  public getConfig(): Required<ResourceMonitorConfig> {
    return { ...this.config };
  }

  /**
   * Get current memory usage in MB
   */
  public getMemoryUsage(): MemoryUsage {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
    };
  }

  /**
   * Check if memory exceeds threshold
   */
  public checkMemory(): MemoryCheckResult {
    this.statistics.totalMemoryChecks++;

    const usage = this.getMemoryUsage();
    const exceeded = usage.rss > this.config.memoryThresholdMB;

    if (exceeded) {
      this.statistics.memoryAlerts++;
      console.warn(
        `[ResourceMonitor] Memory threshold exceeded: ${usage.rss}MB > ${this.config.memoryThresholdMB}MB`
      );
    }

    return {
      exceeded,
      currentMB: usage.rss,
      thresholdMB: this.config.memoryThresholdMB,
    };
  }

  /**
   * Get current CPU usage percentage
   */
  public getCPUUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - Math.floor((idle / total) * 100);

    return usage;
  }

  /**
   * Record CPU sample for sustained check
   */
  public recordCPUSample(): void {
    this.statistics.totalCPUChecks++;

    const usage = this.getCPUUsage();

    // If CPU is below threshold, reset history
    if (usage < this.config.cpuThresholdPercent) {
      this.cpuHistory = [];
      return;
    }

    // Add to history
    this.cpuHistory.push(usage);

    // Keep only the last N samples (where N = cpuCheckDurationMinutes)
    if (this.cpuHistory.length > this.config.cpuCheckDurationMinutes) {
      this.cpuHistory.shift();
    }
  }

  /**
   * Check if CPU usage is sustained above threshold
   */
  public checkCPU(): CPUCheckResult {
    const sustained = this.cpuHistory.length >= this.config.cpuCheckDurationMinutes;
    const durationMinutes = this.cpuHistory.length;
    const averagePercent =
      this.cpuHistory.length > 0 ? Math.round(this.cpuHistory.reduce((a, b) => a + b, 0) / this.cpuHistory.length) : 0;

    if (sustained) {
      this.statistics.cpuAlerts++;
      console.warn(
        `[ResourceMonitor] CPU usage sustained above ${this.config.cpuThresholdPercent}% for ${durationMinutes} minutes (avg: ${averagePercent}%)`
      );
    }

    return {
      sustained,
      durationMinutes,
      averagePercent,
    };
  }

  /**
   * Get statistics
   */
  public getStatistics(): ResourceMonitorStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      totalMemoryChecks: 0,
      totalCPUChecks: 0,
      memoryAlerts: 0,
      cpuAlerts: 0,
    };
    this.cpuHistory = [];
  }
}
