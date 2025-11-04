/**
 * ConfigService
 * 設定管理サービス
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AppConfig } from '../types/config';

/**
 * Configuration Service
 * デフォルト設定、ファイル読み込み、環境変数オーバーライド、設定検証を提供
 */
export class ConfigService {
  /**
   * Get default configuration
   * デフォルト設定を返す
   */
  private static getDefaultConfig(): AppConfig {
    const homeDir = os.homedir();

    return {
      audio: {
        deviceName: 'BlackHole 2ch',
        sampleRate: 16000,
        channels: 1,
        chunkDuration: 30,
        format: 's16le',
      },
      transcription: {
        serverUrl: 'http://localhost:8000',
        timeout: 300000, // 5 minutes
        maxRetries: 3,
        retryDelay: 5000, // 5 seconds
      },
      storage: {
        baseDir: path.join(homeDir, 'transcriptions'),
        minFreeSpaceGB: 10,
        enableRotation: true,
        retentionDays: 30,
      },
      log: {
        level: 'info',
        logDir: path.join(homeDir, 'transcriptions', 'logs'),
        enableConsole: true,
        enableFile: true,
      },
    };
  }

  /**
   * Load configuration from file
   * ファイルから設定を読み込む
   */
  private static loadConfigFile(configPath: string): Partial<AppConfig> {
    if (!fs.existsSync(configPath)) {
      return {};
    }

    try {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(fileContent) as Partial<AppConfig>;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in config file: ${configPath}`);
      }
      throw error;
    }
  }

  /**
   * Apply environment variable overrides
   * 環境変数による設定上書きを適用
   */
  private static applyEnvironmentOverrides(config: AppConfig): AppConfig {
    // Audio configuration
    const audioDevice = process.env['TRANSCRIPTION_AUDIO_DEVICE'];
    if (audioDevice !== undefined && audioDevice !== '') {
      config.audio.deviceName = audioDevice;
    }
    const audioSampleRate = process.env['TRANSCRIPTION_AUDIO_SAMPLE_RATE'];
    if (audioSampleRate !== undefined && audioSampleRate !== '') {
      config.audio.sampleRate = parseInt(audioSampleRate, 10);
    }
    const audioChannels = process.env['TRANSCRIPTION_AUDIO_CHANNELS'];
    if (audioChannels !== undefined && audioChannels !== '') {
      config.audio.channels = parseInt(audioChannels, 10);
    }
    const chunkDuration = process.env['TRANSCRIPTION_CHUNK_DURATION'];
    if (chunkDuration !== undefined && chunkDuration !== '') {
      config.audio.chunkDuration = parseInt(chunkDuration, 10);
    }
    const audioFormat = process.env['TRANSCRIPTION_AUDIO_FORMAT'];
    if (audioFormat !== undefined && audioFormat !== '') {
      config.audio.format = audioFormat;
    }

    // Transcription server configuration
    const serverUrl = process.env['TRANSCRIPTION_SERVER_URL'];
    if (serverUrl !== undefined && serverUrl !== '') {
      config.transcription.serverUrl = serverUrl;
    }
    const timeout = process.env['TRANSCRIPTION_TIMEOUT'];
    if (timeout !== undefined && timeout !== '') {
      config.transcription.timeout = parseInt(timeout, 10);
    }
    const maxRetries = process.env['TRANSCRIPTION_MAX_RETRIES'];
    if (maxRetries !== undefined && maxRetries !== '') {
      config.transcription.maxRetries = parseInt(maxRetries, 10);
    }
    const retryDelay = process.env['TRANSCRIPTION_RETRY_DELAY'];
    if (retryDelay !== undefined && retryDelay !== '') {
      config.transcription.retryDelay = parseInt(retryDelay, 10);
    }

    // Storage configuration
    const baseDir = process.env['TRANSCRIPTION_BASE_DIR'];
    if (baseDir !== undefined && baseDir !== '') {
      config.storage.baseDir = baseDir;
    }
    const minFreeSpace = process.env['TRANSCRIPTION_MIN_FREE_SPACE_GB'];
    if (minFreeSpace !== undefined && minFreeSpace !== '') {
      config.storage.minFreeSpaceGB = parseFloat(minFreeSpace);
    }
    const enableRotation = process.env['TRANSCRIPTION_ENABLE_ROTATION'];
    if (enableRotation !== undefined && enableRotation !== '') {
      config.storage.enableRotation = enableRotation === 'true';
    }
    const retentionDays = process.env['TRANSCRIPTION_RETENTION_DAYS'];
    if (retentionDays !== undefined && retentionDays !== '') {
      config.storage.retentionDays = parseInt(retentionDays, 10);
    }

    // Log configuration
    const logLevel = process.env['TRANSCRIPTION_LOG_LEVEL'];
    if (logLevel !== undefined && logLevel !== '') {
      config.log.level = logLevel as 'debug' | 'info' | 'warn' | 'error';
    }
    const logDir = process.env['TRANSCRIPTION_LOG_DIR'];
    if (logDir !== undefined && logDir !== '') {
      config.log.logDir = logDir;
    }
    const enableConsole = process.env['TRANSCRIPTION_ENABLE_CONSOLE'];
    if (enableConsole !== undefined && enableConsole !== '') {
      config.log.enableConsole = enableConsole === 'true';
    }
    const enableFile = process.env['TRANSCRIPTION_ENABLE_FILE'];
    if (enableFile !== undefined && enableFile !== '') {
      config.log.enableFile = enableFile === 'true';
    }

    return config;
  }

  /**
   * Validate configuration
   * 設定値を検証
   */
  private static validateConfig(config: AppConfig): void {
    // Validate audio configuration
    if (config.audio.sampleRate <= 0) {
      throw new Error('Invalid audio sample rate: must be positive');
    }
    if (config.audio.channels <= 0) {
      throw new Error('Invalid audio channels: must be positive');
    }
    if (config.audio.chunkDuration <= 0) {
      throw new Error('Invalid chunk duration: must be positive');
    }

    // Validate transcription configuration
    try {
      new URL(config.transcription.serverUrl);
    } catch {
      throw new Error('Invalid server URL: must be a valid URL');
    }
    if (config.transcription.timeout < 0) {
      throw new Error('Invalid timeout: must be non-negative');
    }
    if (config.transcription.maxRetries < 0) {
      throw new Error('Invalid max retries: must be non-negative');
    }
    if (config.transcription.retryDelay < 0) {
      throw new Error('Invalid retry delay: must be non-negative');
    }

    // Validate storage configuration
    if (config.storage.minFreeSpaceGB < 0) {
      throw new Error('Invalid min free space: must be non-negative');
    }
    if (config.storage.retentionDays < 0) {
      throw new Error('Invalid retention days: must be non-negative');
    }

    // Validate log configuration
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(config.log.level)) {
      throw new Error(`Invalid log level: must be one of ${validLogLevels.join(', ')}`);
    }
  }

  /**
   * Deep merge two objects
   * オブジェクトの深いマージ
   */
  private static deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (
          sourceValue !== null &&
          sourceValue !== undefined &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue) &&
          targetValue !== null &&
          targetValue !== undefined &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          result[key] = this.deepMerge(targetValue, sourceValue as Partial<typeof targetValue>);
        } else if (sourceValue !== undefined) {
          result[key] = sourceValue as T[Extract<keyof T, string>];
        }
      }
    }

    return result;
  }

  /**
   * Load configuration
   * 設定を読み込む
   *
   * @param configPath - Path to config.json (optional)
   * @returns Complete application configuration
   */
  public static load(configPath?: string): AppConfig {
    // Start with default configuration
    let config = this.getDefaultConfig();

    // Merge with config file if provided
    if (configPath !== undefined && configPath !== '') {
      const fileConfig = this.loadConfigFile(configPath);
      config = this.deepMerge(config, fileConfig);
    } else {
      // Try to load from default location (./config.json)
      const defaultConfigPath = path.join(process.cwd(), 'config.json');
      if (fs.existsSync(defaultConfigPath)) {
        const fileConfig = this.loadConfigFile(defaultConfigPath);
        config = this.deepMerge(config, fileConfig);
      }
    }

    // Apply environment variable overrides
    config = this.applyEnvironmentOverrides(config);

    // Validate final configuration
    this.validateConfig(config);

    return config;
  }
}
