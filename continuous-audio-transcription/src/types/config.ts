/**
 * Configuration Types
 * 設定管理システムの型定義
 */

/**
 * Audio capture configuration
 * 音声キャプチャ設定
 */
export interface AudioConfig {
  /** Device name (e.g., "BlackHole 2ch") */
  deviceName: string;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of channels */
  channels: number;
  /** Chunk duration in seconds */
  chunkDuration: number;
  /** Audio format */
  format: string;
}

/**
 * Transcription server configuration
 * 文字起こしサーバー設定
 */
export interface TranscriptionConfig {
  /** Server URL (CUDA server) */
  serverUrl: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Retry delay in milliseconds */
  retryDelay: number;
}

/**
 * Storage configuration
 * ストレージ設定
 */
export interface StorageConfig {
  /** Base directory for transcription files */
  baseDir: string;
  /** Minimum free space in GB */
  minFreeSpaceGB: number;
  /** Enable file rotation */
  enableRotation: boolean;
  /** Retention period in days */
  retentionDays: number;
}

/**
 * Logging configuration
 * ログ設定
 */
export interface LogConfig {
  /** Log level: debug, info, warn, error */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** Log output directory */
  logDir: string;
  /** Enable console output */
  enableConsole: boolean;
  /** Enable file output */
  enableFile: boolean;
}

/**
 * Complete application configuration
 * アプリケーション全体の設定
 */
export interface AppConfig {
  audio: AudioConfig;
  transcription: TranscriptionConfig;
  storage: StorageConfig;
  log: LogConfig;
}
