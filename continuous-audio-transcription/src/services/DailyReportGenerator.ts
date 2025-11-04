/**
 * Daily Report Generator
 * 日次レポート生成
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface DailyReportGeneratorConfig {
  baseDir: string; // Base directory for transcriptions (e.g., ~/transcriptions)
}

export interface DailyReportGeneratorStatistics {
  totalReportsGenerated: number;
  totalCharactersCounted: number;
}

/**
 * Daily Report Generator
 * 日次レポートを生成
 */
export class DailyReportGenerator {
  private config: DailyReportGeneratorConfig;
  private statistics: DailyReportGeneratorStatistics;

  constructor(config: DailyReportGeneratorConfig) {
    this.config = config;
    this.statistics = {
      totalReportsGenerated: 0,
      totalCharactersCounted: 0,
    };
  }

  /**
   * Get configuration
   */
  public getConfig(): DailyReportGeneratorConfig {
    return { ...this.config };
  }

  /**
   * Count characters from daily.txt
   * Excludes timestamps and speaker labels
   */
  public async countCharacters(date: Date): Promise<number> {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const dailyFile = path.join(this.config.baseDir, dateStr, 'daily.txt');

    try {
      const content = await fs.readFile(dailyFile, 'utf8');

      // Count only text content (excluding timestamps and speaker labels)
      // Format: [HH:MM:SS] [Speaker_XX] text
      let totalChars = 0;

      const lines = content.trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        // Extract text after [Speaker_XX]
        const match = line.match(/\[Speaker_\d+\]\s+(.+)$/);
        if (match && match[1]) {
          totalChars += match[1].length;
        }
      }

      return totalChars;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return 0;
      }
      throw error;
    }
  }

  /**
   * Format uptime in hours and minutes
   */
  private formatUptime(uptimeMs: number): string {
    const hours = Math.floor(uptimeMs / 1000 / 60 / 60);
    const minutes = Math.floor((uptimeMs / 1000 / 60) % 60);
    return `${hours}h ${minutes}m`;
  }

  /**
   * Generate daily report
   */
  public async generateReport(date: Date, uptimeMs: number, errorCount: number): Promise<string> {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const characterCount = await this.countCharacters(date);
    const uptimeFormatted = this.formatUptime(uptimeMs);

    const report = `
=== Daily Report - ${dateStr} ===

Characters: ${characterCount}
Uptime: ${uptimeFormatted}
Errors: ${errorCount}

Generated at: ${new Date().toISOString()}
`.trim();

    // Update statistics
    this.statistics.totalReportsGenerated++;
    this.statistics.totalCharactersCounted += characterCount;

    return report;
  }

  /**
   * Get statistics
   */
  public getStatistics(): DailyReportGeneratorStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      totalReportsGenerated: 0,
      totalCharactersCounted: 0,
    };
  }
}
