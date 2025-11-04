/**
 * ConfigService Tests
 * 設定管理サービスのテスト
 */

import { ConfigService } from './ConfigService';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfig } from '../types/config';

describe('ConfigService', () => {
  const testConfigPath = path.join(__dirname, '../../test-config.json');
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
    // Clean up test config file
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    // Clean up test config file
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  describe('Default Configuration', () => {
    it('should return default configuration when no config file exists', () => {
      const config = ConfigService.load();

      expect(config.audio.deviceName).toBe('BlackHole 2ch');
      expect(config.audio.sampleRate).toBe(16000);
      expect(config.audio.channels).toBe(1);
      expect(config.audio.chunkDuration).toBe(30);
      expect(config.audio.format).toBe('s16le');

      expect(config.transcription.serverUrl).toBe('http://localhost:8000');
      expect(config.transcription.timeout).toBe(300000);
      expect(config.transcription.maxRetries).toBe(3);
      expect(config.transcription.retryDelay).toBe(5000);

      expect(config.storage.baseDir).toContain('transcriptions');
      expect(config.storage.minFreeSpaceGB).toBe(10);
      expect(config.storage.enableRotation).toBe(true);
      expect(config.storage.retentionDays).toBe(30);

      expect(config.log.level).toBe('info');
      expect(config.log.logDir).toContain('logs');
      expect(config.log.enableConsole).toBe(true);
      expect(config.log.enableFile).toBe(true);
    });
  });

  describe('Config File Loading', () => {
    it('should load configuration from config.json', () => {
      const customConfig: Partial<AppConfig> = {
        audio: {
          deviceName: 'Custom Device',
          sampleRate: 48000,
          channels: 2,
          chunkDuration: 60,
          format: 's32le',
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(customConfig, null, 2));

      const config = ConfigService.load(testConfigPath);

      expect(config.audio.deviceName).toBe('Custom Device');
      expect(config.audio.sampleRate).toBe(48000);
      expect(config.audio.channels).toBe(2);
    });

    it('should merge partial config with defaults', () => {
      const partialConfig = {
        audio: {
          deviceName: 'Test Device',
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(partialConfig, null, 2));

      const config = ConfigService.load(testConfigPath);

      expect(config.audio.deviceName).toBe('Test Device');
      expect(config.audio.sampleRate).toBe(16000); // Default value
    });

    it('should throw error for invalid JSON in config file', () => {
      fs.writeFileSync(testConfigPath, 'invalid json content');

      expect(() => ConfigService.load(testConfigPath)).toThrow();
    });
  });

  describe('Environment Variable Override', () => {
    it('should override audio device name from environment variable', () => {
      process.env['TRANSCRIPTION_AUDIO_DEVICE'] = 'Env Device';

      const config = ConfigService.load();

      expect(config.audio.deviceName).toBe('Env Device');
    });

    it('should override server URL from environment variable', () => {
      process.env['TRANSCRIPTION_SERVER_URL'] = 'http://cuda-server:9000';

      const config = ConfigService.load();

      expect(config.transcription.serverUrl).toBe('http://cuda-server:9000');
    });

    it('should override log level from environment variable', () => {
      process.env['TRANSCRIPTION_LOG_LEVEL'] = 'debug';

      const config = ConfigService.load();

      expect(config.log.level).toBe('debug');
    });

    it('should parse numeric environment variables correctly', () => {
      process.env['TRANSCRIPTION_AUDIO_SAMPLE_RATE'] = '48000';
      process.env['TRANSCRIPTION_CHUNK_DURATION'] = '45';

      const config = ConfigService.load();

      expect(config.audio.sampleRate).toBe(48000);
      expect(config.audio.chunkDuration).toBe(45);
    });

    it('should parse boolean environment variables correctly', () => {
      process.env['TRANSCRIPTION_ENABLE_ROTATION'] = 'false';
      process.env['TRANSCRIPTION_ENABLE_CONSOLE'] = 'false';

      const config = ConfigService.load();

      expect(config.storage.enableRotation).toBe(false);
      expect(config.log.enableConsole).toBe(false);
    });
  });

  describe('Configuration Validation', () => {
    it('should throw error for invalid sample rate', () => {
      const invalidConfig = {
        audio: {
          sampleRate: -1,
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => ConfigService.load(testConfigPath)).toThrow('Invalid audio sample rate');
    });

    it('should throw error for invalid channels', () => {
      const invalidConfig = {
        audio: {
          channels: 0,
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => ConfigService.load(testConfigPath)).toThrow('Invalid audio channels');
    });

    it('should throw error for invalid chunk duration', () => {
      const invalidConfig = {
        audio: {
          chunkDuration: 0,
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => ConfigService.load(testConfigPath)).toThrow('Invalid chunk duration');
    });

    it('should throw error for invalid server URL', () => {
      const invalidConfig = {
        transcription: {
          serverUrl: 'not-a-valid-url',
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => ConfigService.load(testConfigPath)).toThrow('Invalid server URL');
    });

    it('should throw error for invalid log level', () => {
      const invalidConfig = {
        log: {
          level: 'invalid',
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => ConfigService.load(testConfigPath)).toThrow('Invalid log level');
    });

    it('should throw error for negative timeout', () => {
      const invalidConfig = {
        transcription: {
          timeout: -100,
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => ConfigService.load(testConfigPath)).toThrow('Invalid timeout');
    });

    it('should throw error for negative retry attempts', () => {
      const invalidConfig = {
        transcription: {
          maxRetries: -1,
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => ConfigService.load(testConfigPath)).toThrow('Invalid max retries');
    });
  });
});
