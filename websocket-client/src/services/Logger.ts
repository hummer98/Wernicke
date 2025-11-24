/**
 * Logger Service
 * Winston-based structured logging for client-side operations
 *
 * Design.md:967-990 - エラー追跡用のファイルログ記録
 */

import winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Logger Configuration
 * ロガー設定
 */
export interface LoggerConfig {
  logDir: string;
  level: string;
  enableConsole: boolean;
}

/**
 * Create Winston logger instance
 * Winstonロガーインスタンスの作成
 */
export function createLogger(config?: Partial<LoggerConfig>): winston.Logger {
  // Get project root directory (websocket-client/)
  const projectRoot = path.resolve(__dirname, '../..');

  const defaultConfig: LoggerConfig = {
    logDir: path.join(projectRoot, 'logs'),
    level: 'info',
    enableConsole: process.env['DISABLE_CONSOLE_LOG'] !== 'true',
  };

  const finalConfig = { ...defaultConfig, ...config };

  // Winston transports
  const transports: winston.transport[] = [];

  // Console transport (optional)
  if (finalConfig.enableConsole) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            return `[${timestamp}] ${level}: ${message}${metaStr}`;
          })
        ),
      })
    );
  }

  // Only add file transports if not in test environment
  if (process.env['NODE_ENV'] !== 'test') {
    // Ensure log directory exists
    if (!fs.existsSync(finalConfig.logDir)) {
      fs.mkdirSync(finalConfig.logDir, { recursive: true, mode: 0o755 });
    }

    // Get today's log file name (YYYY-MM-DD.log)
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(finalConfig.logDir, `client-${today}.log`);

    // File transport (daily log file)
    transports.push(
      new winston.transports.File({
        filename: logFile,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        level: finalConfig.level,
      })
    );

    // Error-only log file
    const errorLogFile = path.join(finalConfig.logDir, 'error.log');
    transports.push(
      new winston.transports.File({
        filename: errorLogFile,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        level: 'error',
      })
    );

    // Set file permissions to 0600 (owner read/write only)
    if (fs.existsSync(logFile)) {
      fs.chmodSync(logFile, 0o600);
    }
    if (fs.existsSync(errorLogFile)) {
      fs.chmodSync(errorLogFile, 0o600);
    }
  }

  // Create logger
  const logger = winston.createLogger({
    level: finalConfig.level,
    transports,
  });

  return logger;
}

/**
 * Default logger instance
 * デフォルトロガーインスタンス
 */
export const logger = createLogger();
