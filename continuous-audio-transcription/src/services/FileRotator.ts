/**
 * File Rotator
 * ファイルローテーションと自動削除
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileRotatorConfig {
  baseDir: string; // Base directory for transcriptions (e.g., ~/transcriptions)
  rawRetentionDays?: number; // Number of days to keep raw files (default: 7)
  hourlyRetentionDays?: number; // Number of days to keep hourly files (default: 30)
  compressionAfterDays?: number; // Number of days before compressing files (default: 3)
}

export interface FileRotatorStatistics {
  deletedRawDirs: number; // Number of raw directories deleted
  deletedHourlyDirs: number; // Number of hourly directories deleted
  failedCleanups: number; // Number of failed cleanup attempts
}

/**
 * File Rotator
 * ファイルのローテーションと自動削除を管理
 */
export class FileRotator {
  private config: Required<FileRotatorConfig>;
  private statistics: FileRotatorStatistics;

  constructor(config: FileRotatorConfig) {
    this.config = {
      baseDir: config.baseDir,
      rawRetentionDays: config.rawRetentionDays ?? 7,
      hourlyRetentionDays: config.hourlyRetentionDays ?? 30,
      compressionAfterDays: config.compressionAfterDays ?? 3,
    };
    this.statistics = {
      deletedRawDirs: 0,
      deletedHourlyDirs: 0,
      failedCleanups: 0,
    };
  }

  /**
   * Get configuration
   */
  public getConfig(): Required<FileRotatorConfig> {
    return { ...this.config };
  }

  /**
   * Parse date string (YYYY-MM-DD) to Date object
   */
  private parseDate(dateStr: string): Date | null {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    const [, year, month, day] = match;
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  }

  /**
   * Calculate age of a date in days
   */
  private getAgeInDays(date: Date, now: Date): number {
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Clean up raw files older than retention period
   */
  public async cleanupRawFiles(now: Date): Promise<void> {
    // Read all date directories
    const dateDirs = await fs.readdir(this.config.baseDir);

    for (const dateDir of dateDirs) {
      // Parse date directory name
      const date = this.parseDate(dateDir);
      if (!date) {
        continue; // Skip invalid date directories
      }

      // Check if date is older than retention period
      const age = this.getAgeInDays(date, now);
      if (age > this.config.rawRetentionDays) {
        // Delete raw directory
        const rawDir = path.join(this.config.baseDir, dateDir, 'raw');
        try {
          // Check if raw directory has files
          await fs.readdir(rawDir);
          await fs.rm(rawDir, { recursive: true, force: true });
          this.statistics.deletedRawDirs++;
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            this.statistics.failedCleanups++;
          }
          // Continue to next directory
        }
      }
    }
  }

  /**
   * Clean up hourly files older than retention period
   */
  public async cleanupHourlyFiles(now: Date): Promise<void> {
    // Read all date directories
    const dateDirs = await fs.readdir(this.config.baseDir);

    for (const dateDir of dateDirs) {
      // Parse date directory name
      const date = this.parseDate(dateDir);
      if (!date) {
        continue; // Skip invalid date directories
      }

      // Check if date is older than retention period
      const age = this.getAgeInDays(date, now);
      if (age > this.config.hourlyRetentionDays) {
        // Delete hourly directory
        const hourlyDir = path.join(this.config.baseDir, dateDir, 'hourly');
        try {
          await fs.rm(hourlyDir, { recursive: true, force: true });
          this.statistics.deletedHourlyDirs++;
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            this.statistics.failedCleanups++;
          }
          // Continue to next directory
        }
      }
    }
  }

  /**
   * Perform full rotation (cleanup raw + hourly files)
   */
  public async rotate(now: Date): Promise<void> {
    await this.cleanupRawFiles(now);
    await this.cleanupHourlyFiles(now);
  }

  /**
   * Get statistics
   */
  public getStatistics(): FileRotatorStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      deletedRawDirs: 0,
      deletedHourlyDirs: 0,
      failedCleanups: 0,
    };
  }
}
