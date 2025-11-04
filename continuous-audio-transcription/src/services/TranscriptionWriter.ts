/**
 * Transcription Writer
 * 文字起こし結果のJSONL形式保存
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { TranscriptionResponse } from './CUDAServerClient';

export interface WriterConfig {
  baseDir: string; // Base directory for transcriptions (e.g., ~/transcriptions)
}

export interface WriterStatistics {
  totalWrites: number; // Total number of writeTranscription calls
  totalSegments: number; // Total number of segments written
  failedWrites: number; // Total number of failed writes
}

export interface TranscriptionRecord {
  timestamp: string; // ISO 8601 timestamp
  audioFile: string; // Path to audio file
  start: number; // Segment start time (seconds)
  end: number; // Segment end time (seconds)
  text: string; // Transcribed text
  speaker: string; // Speaker label (e.g., "Speaker_00")
  confidence: number; // Confidence score (0.0-1.0)
  language: string; // Language code
}

/**
 * Transcription Writer
 * 文字起こし結果をJSONL形式で保存
 */
export class TranscriptionWriter {
  private config: WriterConfig;
  private statistics: WriterStatistics;

  constructor(config: WriterConfig) {
    this.config = config;
    this.statistics = {
      totalWrites: 0,
      totalSegments: 0,
      failedWrites: 0,
    };
  }

  /**
   * Get configuration
   */
  public getConfig(): WriterConfig {
    return { ...this.config };
  }

  /**
   * Write transcription to JSONL file
   * Format: ~/transcriptions/YYYY-MM-DD/raw/HH-MM-SS.jsonl
   */
  public async writeTranscription(
    transcription: TranscriptionResponse,
    audioFilePath: string,
    timestamp: Date
  ): Promise<void> {
    // Skip empty transcriptions
    if (transcription.segments.length === 0) {
      return;
    }

    try {
      // Extract date and time components
      const year = timestamp.getFullYear();
      const month = String(timestamp.getMonth() + 1).padStart(2, '0');
      const day = String(timestamp.getDate()).padStart(2, '0');
      const hours = String(timestamp.getHours()).padStart(2, '0');
      const minutes = String(timestamp.getMinutes()).padStart(2, '0');
      const seconds = String(timestamp.getSeconds()).padStart(2, '0');

      // Create directory structure: YYYY-MM-DD/raw/
      const dateStr = `${year}-${month}-${day}`;
      const dirPath = path.join(this.config.baseDir, dateStr, 'raw');
      await fs.mkdir(dirPath, { recursive: true });

      // Create filename: HH-MM-SS.jsonl
      const filename = `${hours}-${minutes}-${seconds}.jsonl`;
      const filePath = path.join(dirPath, filename);

      // Convert segments to JSONL format
      const lines: string[] = [];
      for (const segment of transcription.segments) {
        const record: TranscriptionRecord = {
          timestamp: timestamp.toISOString(),
          audioFile: audioFilePath,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          speaker: segment.speaker,
          confidence: segment.confidence,
          language: transcription.language,
        };
        lines.push(JSON.stringify(record));
      }

      // Append to file
      const content = lines.join('\n') + '\n';
      await fs.appendFile(filePath, content, 'utf8');

      // Update statistics
      this.statistics.totalWrites++;
      this.statistics.totalSegments += transcription.segments.length;
    } catch (error) {
      this.statistics.failedWrites++;
      throw error;
    }
  }

  /**
   * Get statistics
   */
  public getStatistics(): WriterStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      totalWrites: 0,
      totalSegments: 0,
      failedWrites: 0,
    };
  }
}
