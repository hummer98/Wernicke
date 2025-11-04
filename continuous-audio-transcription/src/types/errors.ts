/**
 * Error Types
 * エラー型定義
 */

/**
 * Base error class for all application errors
 * アプリケーション共通エラー基底クラス
 */
export abstract class BaseError extends Error {
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Audio capture related errors
 * 音声キャプチャ関連エラー
 */
export class AudioCaptureError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * Process execution related errors
 * プロセス実行関連エラー
 */
export class ProcessError extends BaseError {
  public readonly exitCode?: number;

  constructor(message: string, exitCode?: number, context?: Record<string, unknown>) {
    super(message, context);
    this.exitCode = exitCode;
  }
}

/**
 * File system related errors
 * ファイルシステム関連エラー
 */
export class FileError extends BaseError {
  public readonly path?: string;

  constructor(message: string, path?: string, context?: Record<string, unknown>) {
    super(message, context);
    this.path = path;
  }
}

/**
 * Network/API related errors
 * ネットワーク/API関連エラー
 */
export class NetworkError extends BaseError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number, context?: Record<string, unknown>) {
    super(message, context);
    this.statusCode = statusCode;
  }
}

/**
 * Configuration related errors
 * 設定関連エラー
 */
export class ConfigError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * Result type for explicit success/failure handling
 * 成功/失敗を明示的に扱うResult型
 */
export type Result<T, E extends Error = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Create a successful result
 * 成功結果を作成
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create a failed result
 * 失敗結果を作成
 */
export function err<E extends Error>(error: E): Result<never, E> {
  return { ok: false, error };
}
