/**
 * Weekly Report Generator
 * 週次レポート生成
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface WeeklyReportGeneratorConfig {
  baseDir: string; // Base directory for transcriptions (e.g., ~/transcriptions)
}

export interface WeeklyReportGeneratorStatistics {
  totalReportsGenerated: number;
}

/**
 * Weekly Report Generator
 * 週次レポートを生成
 */
export class WeeklyReportGenerator {
  private config: WeeklyReportGeneratorConfig;
  private statistics: WeeklyReportGeneratorStatistics;

  constructor(config: WeeklyReportGeneratorConfig) {
    this.config = config;
    this.statistics = {
      totalReportsGenerated: 0,
    };
  }

  /**
   * Get configuration
   */
  public getConfig(): WeeklyReportGeneratorConfig {
    return { ...this.config };
  }

  /**
   * Check if directory name is valid date format (YYYY-MM-DD)
   */
  private isValidDateDir(dirname: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(dirname);
  }

  /**
   * Calculate total storage usage
   */
  public async calculateStorage(): Promise<number> {
    try {
      const dateDirs = await fs.readdir(this.config.baseDir);
      let totalSize = 0;

      for (const dateDir of dateDirs) {
        // Skip non-date directories
        if (!this.isValidDateDir(dateDir)) {
          continue;
        }

        const datePath = path.join(this.config.baseDir, dateDir);

        try {
          const subdirs = await fs.readdir(datePath);

          for (const subdir of subdirs) {
            const subdirPath = path.join(datePath, subdir);

            try {
              const files = await fs.readdir(subdirPath);

              for (const file of files) {
                const filePath = path.join(subdirPath, file);

                try {
                  const stats = await fs.stat(filePath);
                  if (stats.isFile()) {
                    totalSize += stats.size;
                  }
                } catch (error) {
                  // Skip files that cannot be accessed
                  continue;
                }
              }
            } catch (error) {
              // Skip subdirectories that cannot be read
              continue;
            }
          }
        } catch (error) {
          // Skip date directories that cannot be read
          continue;
        }
      }

      return totalSize;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return 0;
      }
      throw error;
    }
  }

  /**
   * Format bytes to human-readable size
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    } else {
      return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }
  }

  /**
   * Format date to YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Generate weekly report
   */
  public async generateReport(startDate: Date, endDate: Date, errorCount: number): Promise<string> {
    const storageBytes = await this.calculateStorage();
    const storageFormatted = this.formatSize(storageBytes);

    const startDateStr = this.formatDate(startDate);
    const endDateStr = this.formatDate(endDate);

    const report = `
=== Weekly Report (${startDateStr} - ${endDateStr}) ===

Storage: ${storageFormatted}
Errors: ${errorCount}

Generated at: ${new Date().toISOString()}
`.trim();

    // Update statistics
    this.statistics.totalReportsGenerated++;

    return report;
  }

  /**
   * Get statistics
   */
  public getStatistics(): WeeklyReportGeneratorStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      totalReportsGenerated: 0,
    };
  }
}
