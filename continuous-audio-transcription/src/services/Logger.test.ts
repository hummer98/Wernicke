/**
 * Logger Tests
 * ログ出力サービスのテスト
 */

import { Logger } from './Logger';
import { LogLevel } from '../types/logger';
import * as fs from 'fs';
import * as path from 'path';

describe('Logger', () => {
  const testLogDir = path.join(__dirname, '../../test-logs');
  const componentName = 'TestComponent';
  let consoleOutput: string[] = [];
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    // Clean up test log directory
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
    fs.mkdirSync(testLogDir, { recursive: true });

    // Capture console output
    consoleOutput = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = jest.fn((...args: unknown[]) => {
      consoleOutput.push(args.join(' '));
    });
    console.error = jest.fn((...args: unknown[]) => {
      consoleOutput.push(args.join(' '));
    });
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    // Clean up test log directory
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
  });

  describe('Console Output', () => {
    it('should output debug logs to console when level is debug', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.DEBUG,
        enableConsole: true,
        enableFile: false,
      });

      logger.debug('Test debug message');

      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('DEBUG');
      expect(consoleOutput[0]).toContain('TestComponent');
      expect(consoleOutput[0]).toContain('Test debug message');
    });

    it('should output info logs to console', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.INFO,
        enableConsole: true,
        enableFile: false,
      });

      logger.info('Test info message');

      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('INFO');
      expect(consoleOutput[0]).toContain('Test info message');
    });

    it('should output warn logs to console', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.WARN,
        enableConsole: true,
        enableFile: false,
      });

      logger.warn('Test warn message');

      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('WARN');
      expect(consoleOutput[0]).toContain('Test warn message');
    });

    it('should output error logs to console', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.ERROR,
        enableConsole: true,
        enableFile: false,
      });

      const testError = new Error('Test error');
      logger.error('Test error message', testError);

      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('ERROR');
      expect(consoleOutput[0]).toContain('Test error message');
    });

    it('should not output logs below configured level', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.WARN,
        enableConsole: true,
        enableFile: false,
      });

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');

      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('WARN');
    });

    it('should not output to console when disabled', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: false,
      });

      logger.info('Test message');

      expect(consoleOutput.length).toBe(0);
    });
  });

  describe('File Output', () => {
    it('should write logs to file when enabled', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: true,
        logDir: testLogDir,
      });

      logger.info('Test file log');

      const logFiles = fs.readdirSync(testLogDir);
      expect(logFiles.length).toBe(1);

      const logContent = fs.readFileSync(path.join(testLogDir, logFiles[0] ?? ''), 'utf-8');
      expect(logContent).toContain('INFO');
      expect(logContent).toContain('TestComponent');
      expect(logContent).toContain('Test file log');
    });

    it('should create log file with date in filename', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: true,
        logDir: testLogDir,
      });

      logger.info('Test');

      const logFiles = fs.readdirSync(testLogDir);
      const today = new Date().toISOString().split('T')[0];
      expect(logFiles[0]).toContain(today);
    });

    it('should append multiple logs to same file', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: true,
        logDir: testLogDir,
      });

      logger.info('First log');
      logger.info('Second log');
      logger.info('Third log');

      const logFiles = fs.readdirSync(testLogDir);
      expect(logFiles.length).toBe(1);

      const logContent = fs.readFileSync(path.join(testLogDir, logFiles[0] ?? ''), 'utf-8');
      const lines = logContent.trim().split('\n');
      expect(lines.length).toBe(3);
    });

    it('should not write to file when disabled', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: false,
        logDir: testLogDir,
      });

      logger.info('Test');

      const logFiles = fs.readdirSync(testLogDir);
      expect(logFiles.length).toBe(0);
    });
  });

  describe('Context and Error Information', () => {
    it('should include context in log output', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.INFO,
        enableConsole: true,
        enableFile: false,
      });

      logger.info('Test with context', { userId: 123, action: 'test' });

      expect(consoleOutput[0]).toContain('userId');
      expect(consoleOutput[0]).toContain('123');
      expect(consoleOutput[0]).toContain('action');
    });

    it('should include error details in error logs', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.ERROR,
        enableConsole: true,
        enableFile: false,
      });

      const testError = new Error('Test error details');
      logger.error('Error occurred', testError);

      expect(consoleOutput[0]).toContain('Error occurred');
      expect(consoleOutput[0]).toContain('Test error details');
    });

    it('should include stack trace in error logs', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.ERROR,
        enableConsole: true,
        enableFile: false,
      });

      const testError = new Error('Test error');
      logger.error('Error with stack', testError);

      expect(consoleOutput[0]).toContain('stack');
    });
  });

  describe('Log Formatting', () => {
    it('should format log with timestamp', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.INFO,
        enableConsole: true,
        enableFile: false,
      });

      logger.info('Test');

      // ISO 8601 format check
      expect(consoleOutput[0]).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should format log with all required fields', () => {
      const logger = new Logger(componentName, {
        level: LogLevel.INFO,
        enableConsole: true,
        enableFile: false,
      });

      logger.info('Test message');

      const output = consoleOutput[0] ?? '';
      expect(output).toContain('INFO');
      expect(output).toContain('TestComponent');
      expect(output).toContain('Test message');
    });
  });
});
