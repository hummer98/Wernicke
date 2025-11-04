/**
 * Daily Aggregator
 * 1日ごとの文字起こし集約
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface DailyAggregatorConfig {
  baseDir: string; // Base directory for transcriptions (e.g., ~/transcriptions)
}

export interface DailyAggregatorStatistics {
  totalAggregations: number; // Total number of daily aggregations
  totalHourlyFiles: number; // Total number of hourly files aggregated
}

/**
 * Daily Aggregator
 * 1日分のhourlyファイルを集約してdaily.txtに出力
 */
export class DailyAggregator {
  private config: DailyAggregatorConfig;
  private statistics: DailyAggregatorStatistics;

  constructor(config: DailyAggregatorConfig) {
    this.config = config;
    this.statistics = {
      totalAggregations: 0,
      totalHourlyFiles: 0,
    };
  }

  /**
   * Get configuration
   */
  public getConfig(): DailyAggregatorConfig {
    return { ...this.config };
  }

  /**
   * Aggregate all hourly files for a specific day
   * Format: ~/transcriptions/YYYY-MM-DD/daily.txt
   */
  public async aggregateDay(date: Date): Promise<void> {
    // Create date string
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Get hourly directory
    const hourlyDir = path.join(this.config.baseDir, dateStr, 'hourly');

    try {
      // Read all files in hourly directory
      const files = await fs.readdir(hourlyDir);

      // Filter hourly files (00.txt, 01.txt, ..., 23.txt)
      const hourlyFiles = files.filter((f) => /^\d{2}\.txt$/.test(f));

      if (hourlyFiles.length === 0) {
        // No hourly files for this day
        return;
      }

      // Sort files numerically (00.txt, 01.txt, ..., 23.txt)
      hourlyFiles.sort((a, b) => {
        const hourA = parseInt(a.split('.')[0] || '0', 10);
        const hourB = parseInt(b.split('.')[0] || '0', 10);
        return hourA - hourB;
      });

      // Read and concatenate all hourly files
      const contents: string[] = [];
      for (const file of hourlyFiles) {
        const filePath = path.join(hourlyDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        contents.push(content);
      }

      // Write to daily file
      const dailyFile = path.join(this.config.baseDir, dateStr, 'daily.txt');
      const dailyContent = contents.join('');
      await fs.writeFile(dailyFile, dailyContent, 'utf8');

      // Update statistics
      this.statistics.totalAggregations++;
      this.statistics.totalHourlyFiles += hourlyFiles.length;
    } catch (error: any) {
      // Handle directory not found (no hourly files for this day)
      if (error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  /**
   * Get statistics
   */
  public getStatistics(): DailyAggregatorStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      totalAggregations: 0,
      totalHourlyFiles: 0,
    };
  }
}
