/**
 * Transcription Display Tests
 * Task 11: TranscriptionDisplay実装のテスト
 */

import * as path from 'path';
import { TranscriptionDisplay, TranscriptionDisplayConfig } from './TranscriptionDisplay';
import { PartialResultMessage, FinalResultMessage } from '../types/websocket';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  chmodSync: jest.fn(),
}));

import * as fs from 'fs';

describe('TranscriptionDisplay - Task 11', () => {
  let display: TranscriptionDisplay;

  const testDir = '/tmp/test-transcriptions';
  const config: TranscriptionDisplayConfig = {
    transcriptionDir: testDir,
    liveFile: path.join(testDir, 'live.txt'),
    logDir: path.join(testDir, 'logs'),
  };

  beforeEach(() => {
    // Reset all mocks (clears both call history and implementations)
    jest.clearAllMocks();

    // Restore default mock implementations
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    display = new TranscriptionDisplay(config);
  });

  describe('Constructor', () => {
    test('should initialize with correct configuration', () => {
      expect(display.getConfig()).toEqual(config);
    });

    test('should create directories if they do not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      new TranscriptionDisplay(config);

      expect(fs.mkdirSync).toHaveBeenCalledWith(testDir, { recursive: true, mode: 0o755 });
      expect(fs.mkdirSync).toHaveBeenCalledWith(config.logDir, {
        recursive: true,
        mode: 0o755,
      });
    });
  });

  describe('Task 11.1: Partial Result Display', () => {
    const partialResult: PartialResultMessage = {
      type: 'partial',
      buffer_id: 'buff_20250105_120000_001',
      text: 'こんにちは',
      segments: [
        {
          start: 0.0,
          end: 1.5,
          text: 'こんにちは',
        },
      ],
      timestamp_range: {
        start: 0.0,
        end: 1.5,
      },
      latency_ms: 2500,
    };

    test('should display partial result to live.txt with gray/italic formatting', () => {
      display.displayPartialResult(partialResult);

      // Verify partial result is stored in partialBuffers
      const partialBuffers = display.getPartialBuffers();
      expect(partialBuffers.has(partialResult.buffer_id)).toBe(true);
      expect(partialBuffers.get(partialResult.buffer_id)).toEqual(partialResult);

      // Verify file write with gray/italic formatting
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        config.liveFile,
        expect.stringContaining('こんにちは'),
        'utf-8'
      );
    });

    test('should include timestamp (HH:MM) and speaker label', () => {
      const partialWithSpeaker: PartialResultMessage = {
        ...partialResult,
        segments: [
          {
            start: 0.0,
            end: 1.5,
            text: 'こんにちは',
            speaker: 'Speaker_00',
          },
        ],
      };

      display.displayPartialResult(partialWithSpeaker);

      const callArg = (fs.appendFileSync as jest.Mock).mock.calls[0]?.[1] as string;
      expect(callArg).toMatch(/\d{2}:\d{2}/); // Timestamp HH:MM
      expect(callArg).toContain('Speaker_00');
    });

    test('should measure and record latency', () => {
      display.displayPartialResult(partialResult);

      const stats = display.getStatistics();
      expect(stats.partialResultsDisplayed).toBe(1);
      expect(stats.totalPartialLatencyMs).toBe(2500);
    });
  });

  describe('Task 11.2: Final Result Replacement', () => {
    const partialResult: PartialResultMessage = {
      type: 'partial',
      buffer_id: 'buff_20250105_120000_001',
      text: 'こんにちは',
      segments: [
        {
          start: 0.0,
          end: 1.5,
          text: 'こんにちは',
        },
      ],
      timestamp_range: {
        start: 0.0,
        end: 1.5,
      },
      latency_ms: 2500,
    };

    const finalResult: FinalResultMessage = {
      type: 'final',
      buffer_id: 'buff_20250105_120000_001',
      text: 'こんにちは、今日は良い天気です',
      segments: [
        {
          start: 0.0,
          end: 3.0,
          text: 'こんにちは、今日は良い天気です',
          speaker: 'Speaker_00',
        },
      ],
      timestamp_range: {
        start: 0.0,
        end: 3.0,
      },
      latency_ms: 12000,
    };

    test('should replace partial result with final result by buffer_id', () => {
      // Mock appendFileSync to track appended content
      let fileContent = '';
      (fs.appendFileSync as jest.Mock).mockImplementation((_path, content) => {
        fileContent += content;
      });

      // Mock readFileSync to return the current fileContent
      (fs.readFileSync as jest.Mock).mockImplementation(() => fileContent);

      // Display partial first
      display.displayPartialResult(partialResult);

      // Display final result
      display.displayFinalResult(finalResult);

      // Verify partial result is removed from partialBuffers
      const partialBuffers = display.getPartialBuffers();
      expect(partialBuffers.has(finalResult.buffer_id)).toBe(false);

      // Verify file is rewritten with final result
      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0]?.[1] as string;

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        config.liveFile,
        expect.stringContaining('こんにちは、今日は良い天気です'),
        'utf-8'
      );

      // Verify (partial) marker is removed
      expect(writeCall).not.toContain('(partial)');
    });

    test('should use normal font/black color for final result', () => {
      // Mock appendFileSync to track appended content
      let fileContent = '';
      (fs.appendFileSync as jest.Mock).mockImplementation((_path, content) => {
        fileContent += content;
      });

      // Mock readFileSync to return the current fileContent
      (fs.readFileSync as jest.Mock).mockImplementation(() => fileContent);

      display.displayPartialResult(partialResult);

      display.displayFinalResult(finalResult);

      const callArg = (fs.writeFileSync as jest.Mock).mock.calls[0]?.[1] as string;
      expect(callArg).not.toContain('(partial)');
      expect(callArg).toContain('Speaker_00');
    });

    test('should free memory by removing from partialBuffers after replacement', () => {
      // Track appended content
      let fileContent = '';
      (fs.appendFileSync as jest.Mock).mockImplementation((_path, content) => {
        fileContent += content;
      });

      // Mock readFileSync to return current file content
      (fs.readFileSync as jest.Mock).mockImplementation(() => fileContent);

      display.displayPartialResult(partialResult);

      expect(display.getPartialBuffers().size).toBe(1);

      display.displayFinalResult(finalResult);

      expect(display.getPartialBuffers().size).toBe(0);
    });
  });

  describe('Task 11.3: Log File Recording', () => {
    const finalResult: FinalResultMessage = {
      type: 'final',
      buffer_id: 'buff_20250105_120000_001',
      text: 'こんにちは、今日は良い天気です',
      segments: [
        {
          start: 0.0,
          end: 3.0,
          text: 'こんにちは、今日は良い天気です',
          speaker: 'Speaker_00',
        },
      ],
      timestamp_range: {
        start: 0.0,
        end: 3.0,
      },
      latency_ms: 12000,
    };

    test('should record final result to daily log file', () => {
      display.displayFinalResult(finalResult);

      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(config.logDir, `${today}.log`);

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        logFile,
        expect.stringContaining('こんにちは、今日は良い天気です'),
        'utf-8'
      );
    });

    test('should include timestamp (HH:MM) and speaker label in log', () => {
      display.displayFinalResult(finalResult);

      const callArgs = (fs.appendFileSync as jest.Mock).mock.calls;
      const logCall = callArgs.find((call) => call[0]?.includes('.log'));
      const logContent = logCall?.[1] as string;

      expect(logContent).toMatch(/\d{2}:\d{2}/); // Timestamp
      expect(logContent).toContain('Speaker_00');
    });

    test('should set file permissions to 0600 (owner read/write only)', () => {
      display.displayFinalResult(finalResult);

      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(config.logDir, `${today}.log`);

      expect(fs.chmodSync).toHaveBeenCalledWith(logFile, 0o600);
    });

    test('should use daily rotation (YYYY-MM-DD.log format)', () => {
      display.displayFinalResult(finalResult);

      const today = new Date().toISOString().split('T')[0];
      const expectedLogFile = path.join(config.logDir, `${today}.log`);

      const callArgs = (fs.appendFileSync as jest.Mock).mock.calls;
      const logCall = callArgs.find((call) => call[0]?.includes('.log'));

      expect(logCall?.[0]).toBe(expectedLogFile);
    });
  });

  describe('Statistics', () => {
    test('should track partial and final results count', () => {
      const partial: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'test',
        segments: [],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 1000,
      };

      const final: FinalResultMessage = {
        type: 'final',
        buffer_id: 'buff_001',
        text: 'test final',
        segments: [],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 5000,
      };

      // Track appended content
      let fileContent = '';
      (fs.appendFileSync as jest.Mock).mockImplementation((_path, content) => {
        fileContent += content;
      });

      // Mock readFileSync to return current file content
      (fs.readFileSync as jest.Mock).mockImplementation(() => fileContent);

      display.displayPartialResult(partial);
      display.displayFinalResult(final);

      const stats = display.getStatistics();
      expect(stats.partialResultsDisplayed).toBe(1);
      expect(stats.finalResultsDisplayed).toBe(1);
    });
  });
});
