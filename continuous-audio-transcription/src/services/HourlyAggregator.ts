/**
 * Hourly Aggregator
 * 1時間ごとの文字起こし集約
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface AggregatorConfig {
  baseDir: string; // Base directory for transcriptions (e.g., ~/transcriptions)
}

export interface AggregatorStatistics {
  totalAggregations: number; // Total number of hourly aggregations
  totalSegments: number; // Total number of segments aggregated
}

interface TranscriptionSegment {
  timestamp: string; // ISO 8601 timestamp
  audioFile?: string;
  start: number;
  end: number;
  text: string;
  speaker: string;
  confidence: number;
  language?: string;
}

/**
 * Hourly Aggregator
 * 1時間ごとのJSONLファイルを集約してテキストファイルに出力
 */
export class HourlyAggregator {
  private config: AggregatorConfig;
  private statistics: AggregatorStatistics;

  constructor(config: AggregatorConfig) {
    this.config = config;
    this.statistics = {
      totalAggregations: 0,
      totalSegments: 0,
    };
  }

  /**
   * Get configuration
   */
  public getConfig(): AggregatorConfig {
    return { ...this.config };
  }

  /**
   * Aggregate JSONL files for a specific hour
   * Format: ~/transcriptions/YYYY-MM-DD/hourly/HH.txt
   */
  public async aggregateHour(date: Date, hour: number): Promise<void> {
    // Create date string
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Get raw directory
    const rawDir = path.join(this.config.baseDir, dateStr, 'raw');

    // Read all JSONL files in raw directory
    const files = await fs.readdir(rawDir);

    // Filter files for this hour
    const hourStr = String(hour).padStart(2, '0');
    const hourFiles = files.filter((f) => f.startsWith(`${hourStr}-`) && f.endsWith('.jsonl'));

    if (hourFiles.length === 0) {
      // No files for this hour
      return;
    }

    // Read and parse all segments
    const segments: TranscriptionSegment[] = [];

    for (const file of hourFiles) {
      const filePath = path.join(rawDir, file);
      const content = await fs.readFile(filePath, 'utf8');

      // Parse JSONL (one JSON object per line)
      const lines = content.trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          const segment = JSON.parse(line) as TranscriptionSegment;
          segments.push(segment);
        }
      }
    }

    // Sort segments by timestamp
    segments.sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    // Format output: [HH:MM:SS] [Speaker_XX] text
    const lines: string[] = [];
    for (const segment of segments) {
      const timestamp = new Date(segment.timestamp);
      const hours = String(timestamp.getHours()).padStart(2, '0');
      const minutes = String(timestamp.getMinutes()).padStart(2, '0');
      const seconds = String(timestamp.getSeconds()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}:${seconds}`;

      const line = `[${timeStr}] [${segment.speaker}] ${segment.text}`;
      lines.push(line);
    }

    // Write to hourly file
    const hourlyDir = path.join(this.config.baseDir, dateStr, 'hourly');
    await fs.mkdir(hourlyDir, { recursive: true });

    const hourlyFile = path.join(hourlyDir, `${hourStr}.txt`);
    await fs.writeFile(hourlyFile, lines.join('\n') + '\n', 'utf8');

    // Update statistics
    this.statistics.totalAggregations++;
    this.statistics.totalSegments += segments.length;
  }

  /**
   * Get statistics
   */
  public getStatistics(): AggregatorStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      totalAggregations: 0,
      totalSegments: 0,
    };
  }
}
