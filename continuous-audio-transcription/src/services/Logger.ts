/**
 * Logger Service
 * ログ出力サービス
 */

import * as fs from 'fs';
import * as path from 'path';
import { LogLevel, LogEntry, ILogger } from '../types/logger';

/**
 * Logger configuration options
 * ロガー設定オプション
 */
export interface LoggerOptions {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logDir?: string;
}

/**
 * Logger implementation
 * ロガー実装
 */
export class Logger implements ILogger {
  private readonly component: string;
  private readonly options: LoggerOptions;
  private readonly levelPriority: Map<LogLevel, number>;

  constructor(component: string, options: LoggerOptions) {
    this.component = component;
    this.options = options;
    this.levelPriority = new Map([
      [LogLevel.DEBUG, 0],
      [LogLevel.INFO, 1],
      [LogLevel.WARN, 2],
      [LogLevel.ERROR, 3],
    ]);

    // Create log directory if file output is enabled
    if (this.options.enableFile && this.options.logDir !== undefined) {
      this.ensureLogDir(this.options.logDir);
    }
  }

  /**
   * Ensure log directory exists
   * ログディレクトリの存在を保証
   */
  private ensureLogDir(logDir: string): void {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true, mode: 0o755 });
    }
  }

  /**
   * Check if a log level should be output
   * ログレベルが出力対象かチェック
   */
  private shouldLog(level: LogLevel): boolean {
    const currentPriority = this.levelPriority.get(this.options.level) ?? 1;
    const messagePriority = this.levelPriority.get(level) ?? 1;
    return messagePriority >= currentPriority;
  }

  /**
   * Create log entry object
   * ログエントリオブジェクトを作成
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
    };

    if (context !== undefined) {
      entry.context = context;
    }

    if (error !== undefined) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  /**
   * Format log entry for output
   * ログエントリを出力用にフォーマット
   */
  private formatLogEntry(entry: LogEntry): string {
    const parts = [entry.timestamp, entry.level.toUpperCase(), entry.component, entry.message];

    if (entry.context !== undefined) {
      parts.push(JSON.stringify(entry.context));
    }

    if (entry.error !== undefined) {
      parts.push(
        JSON.stringify({
          error: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack,
        })
      );
    }

    return parts.join(' | ');
  }

  /**
   * Output log entry
   * ログエントリを出力
   */
  private output(entry: LogEntry): void {
    const formatted = this.formatLogEntry(entry);

    // Console output
    if (this.options.enableConsole) {
      if (entry.level === LogLevel.ERROR) {
        console.error(formatted);
      } else {
        console.log(formatted);
      }
    }

    // File output
    if (this.options.enableFile && this.options.logDir !== undefined) {
      const logFile = this.getLogFilePath(this.options.logDir);
      fs.appendFileSync(logFile, formatted + '\n', 'utf-8');
    }
  }

  /**
   * Get log file path for current date
   * 現在の日付のログファイルパスを取得
   */
  private getLogFilePath(logDir: string): string {
    const today = new Date().toISOString().split('T')[0];
    return path.join(logDir, `${today}.log`);
  }

  /**
   * Log debug message
   * デバッグメッセージをログ出力
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) {
      return;
    }
    const entry = this.createLogEntry(LogLevel.DEBUG, message, context);
    this.output(entry);
  }

  /**
   * Log info message
   * 情報メッセージをログ出力
   */
  public info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.INFO)) {
      return;
    }
    const entry = this.createLogEntry(LogLevel.INFO, message, context);
    this.output(entry);
  }

  /**
   * Log warning message
   * 警告メッセージをログ出力
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.WARN)) {
      return;
    }
    const entry = this.createLogEntry(LogLevel.WARN, message, context);
    this.output(entry);
  }

  /**
   * Log error message
   * エラーメッセージをログ出力
   */
  public error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.ERROR)) {
      return;
    }
    const entry = this.createLogEntry(LogLevel.ERROR, message, context, error);
    this.output(entry);
  }
}
