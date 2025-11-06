/**
 * Transcription Display
 * Task 11: TranscriptionDisplay実装
 * Task 11.1: 部分結果表示機能
 * Task 11.2: 最終結果による部分結果置換機能
 * Task 11.3: ログファイル記録機能
 */

import * as fs from 'fs';
import * as path from 'path';
import { PartialResultMessage, FinalResultMessage } from '../types/websocket';

/**
 * Transcription Display Configuration
 * 文字起こし表示設定
 */
export interface TranscriptionDisplayConfig {
  transcriptionDir: string;
  liveFile: string;
  logDir: string;
}

/**
 * Transcription Display Statistics
 * 文字起こし表示統計
 */
export interface TranscriptionDisplayStatistics {
  partialResultsDisplayed: number;
  finalResultsDisplayed: number;
  totalPartialLatencyMs: number;
  totalFinalLatencyMs: number;
}

/**
 * Transcription Display
 * プログレッシブ表示機能（部分結果→最終結果）
 */
export class TranscriptionDisplay {
  private config: TranscriptionDisplayConfig;
  private partialBuffers: Map<string, PartialResultMessage> = new Map();
  private statistics: TranscriptionDisplayStatistics = {
    partialResultsDisplayed: 0,
    finalResultsDisplayed: 0,
    totalPartialLatencyMs: 0,
    totalFinalLatencyMs: 0,
  };

  constructor(config: TranscriptionDisplayConfig) {
    this.config = config;

    // Ensure directories exist
    this.ensureDirectories();
  }

  /**
   * Ensure transcription directories exist
   * 文字起こしディレクトリの存在を保証
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.config.transcriptionDir)) {
      fs.mkdirSync(this.config.transcriptionDir, { recursive: true, mode: 0o755 });
    }

    if (!fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true, mode: 0o755 });
    }
  }

  /**
   * Get configuration
   * 設定を取得
   */
  public getConfig(): TranscriptionDisplayConfig {
    return { ...this.config };
  }

  /**
   * Get partial buffers
   * 部分結果バッファを取得
   */
  public getPartialBuffers(): Map<string, PartialResultMessage> {
    return this.partialBuffers;
  }

  /**
   * Get statistics
   * 統計情報を取得
   */
  public getStatistics(): TranscriptionDisplayStatistics {
    return { ...this.statistics };
  }

  /**
   * Display partial result
   * 部分結果を表示
   *
   * Task 11.1: 部分結果表示機能の実装
   */
  public displayPartialResult(result: PartialResultMessage): void {
    // Store in partialBuffers
    this.partialBuffers.set(result.buffer_id, result);

    // Format partial result for display
    const timestamp = this.formatTimestamp(new Date());
    const speaker = this.extractSpeaker(result.segments);
    const formattedLine = `[${timestamp}] ${speaker ? `[${speaker}] ` : ''}(partial) ${result.text}\n`;

    // Append to live.txt with gray/italic formatting
    fs.appendFileSync(this.config.liveFile, formattedLine, 'utf-8');

    // Update statistics
    this.statistics.partialResultsDisplayed++;
    this.statistics.totalPartialLatencyMs += result.latency_ms;

    console.log(`[Partial] ${result.buffer_id}: ${result.text} (latency: ${result.latency_ms}ms)`);
  }

  /**
   * Display final result
   * 最終結果を表示
   *
   * Task 11.2: 最終結果による部分結果置換機能の実装
   * Task 11.3: ログファイル記録機能の実装
   */
  public displayFinalResult(result: FinalResultMessage): void {
    // Task 11.2: Replace partial result with final result
    if (this.partialBuffers.has(result.buffer_id)) {
      this.replacePartialWithFinal(result);
    } else {
      // If no partial result exists, just append to live.txt
      const timestamp = this.formatTimestamp(new Date());
      const speaker = this.extractSpeaker(result.segments);
      const formattedLine = `[${timestamp}] ${speaker ? `[${speaker}] ` : ''}${result.text}\n`;

      fs.appendFileSync(this.config.liveFile, formattedLine, 'utf-8');
    }

    // Task 11.3: Record to log file
    this.recordToLogFile(result);

    // Update statistics
    this.statistics.finalResultsDisplayed++;
    this.statistics.totalFinalLatencyMs += result.latency_ms;

    console.log(`[Final] ${result.buffer_id}: ${result.text} (latency: ${result.latency_ms}ms)`);
  }

  /**
   * Replace partial result with final result
   * 部分結果を最終結果で置換
   *
   * Task 11.2: 最終結果による部分結果置換機能の実装
   */
  private replacePartialWithFinal(result: FinalResultMessage): void {
    // Read current live.txt content
    let content = '';
    if (fs.existsSync(this.config.liveFile)) {
      content = fs.readFileSync(this.config.liveFile, 'utf-8');
    }

    // Find and replace the partial result line
    const lines = content.split('\n');
    const updatedLines = lines.map((line) => {
      // Check if this line contains the partial result (marked with "(partial)")
      if (line.includes('(partial)')) {
        // Replace with final result
        const timestamp = this.formatTimestamp(new Date());
        const speaker = this.extractSpeaker(result.segments);
        return `[${timestamp}] ${speaker ? `[${speaker}] ` : ''}${result.text}`;
      }
      return line;
    });

    // Write back to live.txt
    fs.writeFileSync(this.config.liveFile, updatedLines.join('\n'), 'utf-8');

    // Remove from partialBuffers (memory free)
    this.partialBuffers.delete(result.buffer_id);
  }

  /**
   * Record final result to log file
   * 最終結果をログファイルに記録
   *
   * Task 11.3: ログファイル記録機能の実装
   */
  private recordToLogFile(result: FinalResultMessage): void {
    // Get today's log file (YYYY-MM-DD.log)
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.config.logDir, `${today}.log`);

    // Format final result for log
    const timestamp = this.formatTimestamp(new Date());
    const speaker = this.extractSpeaker(result.segments);
    const formattedLine = `[${timestamp}] ${speaker ? `[${speaker}] ` : ''}${result.text}\n`;

    // Append to log file
    fs.appendFileSync(logFile, formattedLine, 'utf-8');

    // Set file permissions to 0600 (owner read/write only)
    fs.chmodSync(logFile, 0o600);
  }

  /**
   * Format timestamp (HH:MM)
   * タイムスタンプをフォーマット
   */
  private formatTimestamp(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Extract speaker from segments
   * セグメントから話者を抽出
   */
  private extractSpeaker(segments: Array<{ speaker?: string }>): string | null {
    if (segments.length === 0) {
      return null;
    }

    const speaker = segments[0]?.speaker;
    return speaker ?? null;
  }
}
