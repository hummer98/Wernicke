/**
 * Transcription Writer Tests
 * 文字起こし結果のJSONL形式保存のテスト
 */

import { TranscriptionWriter } from './TranscriptionWriter';
import { TranscriptionResponse } from './CUDAServerClient';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('TranscriptionWriter', () => {
  let writer: TranscriptionWriter;
  const testBaseDir = '/tmp/test-transcriptions';

  beforeEach(() => {
    writer = new TranscriptionWriter({
      baseDir: testBaseDir,
    });
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(writer).toBeDefined();
      expect(writer.getConfig().baseDir).toBe(testBaseDir);
    });
  });

  describe('JSONL Writing', () => {
    const mockTranscription: TranscriptionResponse = {
      segments: [
        {
          start: 0.0,
          end: 3.5,
          text: 'こんにちは',
          speaker: 'Speaker_00',
          confidence: 0.95,
        },
        {
          start: 3.5,
          end: 7.2,
          text: 'よろしくお願いします',
          speaker: 'Speaker_01',
          confidence: 0.92,
        },
      ],
      language: 'ja',
      duration: 7.2,
    };

    it('should write transcription to JSONL file', async () => {
      const audioFilePath = '/tmp/test-buffers/12-34-56-789.wav';
      const timestamp = new Date('2025-01-27T12:34:56.789Z');

      // Mock directory creation
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.appendFile.mockResolvedValue(undefined);

      await writer.writeTranscription(mockTranscription, audioFilePath, timestamp);

      // Verify directory was created
      const expectedDir = path.join(testBaseDir, '2025-01-27', 'raw');
      expect(mockedFs.mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true });

      // Verify file was appended (filename based on local time)
      expect(mockedFs.appendFile).toHaveBeenCalledTimes(1);
      const calls = mockedFs.appendFile.mock.calls;
      const filePath = calls[0]?.[0] as string;
      expect(filePath).toContain('2025-01-27/raw/');
      expect(filePath).toMatch(/\d{2}-\d{2}-\d{2}\.jsonl$/);

      const content = calls[0]?.[1] as string;
      expect(content).toContain('"text":"こんにちは"');
      expect(content).toContain('"text":"よろしくお願いします"');
    });

    it('should write each segment as a separate JSONL line', async () => {
      const audioFilePath = '/tmp/test-buffers/12-34-56-789.wav';
      const timestamp = new Date('2025-01-27T12:34:56.789Z');

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.appendFile.mockResolvedValue(undefined);

      await writer.writeTranscription(mockTranscription, audioFilePath, timestamp);

      // Should have 2 segments = 2 lines
      const calls = mockedFs.appendFile.mock.calls;
      expect(calls.length).toBe(1);

      const content = calls[0]?.[1] as string;
      expect(content).toBeDefined();
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);

      // Each line should be valid JSON
      const line1 = JSON.parse(lines[0] || '{}');
      expect(line1.text).toBe('こんにちは');
      expect(line1.speaker).toBe('Speaker_00');
      expect(line1.confidence).toBe(0.95);

      const line2 = JSON.parse(lines[1] || '{}');
      expect(line2.text).toBe('よろしくお願いします');
      expect(line2.speaker).toBe('Speaker_01');
    });

    it('should include timestamp and audio file path in JSONL', async () => {
      const audioFilePath = '/tmp/test-buffers/12-34-56-789.wav';
      const timestamp = new Date('2025-01-27T12:34:56.789Z');

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.appendFile.mockResolvedValue(undefined);

      await writer.writeTranscription(mockTranscription, audioFilePath, timestamp);

      const calls = mockedFs.appendFile.mock.calls;
      const content = calls[0]?.[1] as string;
      expect(content).toBeDefined();
      const lines = content.trim().split('\n');

      const line1 = JSON.parse(lines[0] || '{}');
      expect(line1.timestamp).toBe('2025-01-27T12:34:56.789Z');
      expect(line1.audioFile).toBe(audioFilePath);
    });

    it('should handle empty segments', async () => {
      const emptyTranscription: TranscriptionResponse = {
        segments: [],
        language: 'ja',
        duration: 0,
      };

      const audioFilePath = '/tmp/test-buffers/12-34-56-789.wav';
      const timestamp = new Date('2025-01-27T12:34:56.789Z');

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.appendFile.mockResolvedValue(undefined);

      await writer.writeTranscription(emptyTranscription, audioFilePath, timestamp);

      // Should not write anything
      expect(mockedFs.appendFile).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle disk full error', async () => {
      const mockTranscription: TranscriptionResponse = {
        segments: [
          {
            start: 0.0,
            end: 3.5,
            text: 'こんにちは',
            speaker: 'Speaker_00',
            confidence: 0.95,
          },
        ],
        language: 'ja',
        duration: 3.5,
      };

      const audioFilePath = '/tmp/test-buffers/12-34-56-789.wav';
      const timestamp = new Date('2025-01-27T12:34:56.789Z');

      mockedFs.mkdir.mockResolvedValue(undefined);
      const error: any = new Error('No space left on device');
      error.code = 'ENOSPC';
      mockedFs.appendFile.mockRejectedValue(error);

      await expect(writer.writeTranscription(mockTranscription, audioFilePath, timestamp)).rejects.toThrow(
        'No space left on device'
      );
    });

    it('should handle permission error', async () => {
      const mockTranscription: TranscriptionResponse = {
        segments: [
          {
            start: 0.0,
            end: 3.5,
            text: 'こんにちは',
            speaker: 'Speaker_00',
            confidence: 0.95,
          },
        ],
        language: 'ja',
        duration: 3.5,
      };

      const audioFilePath = '/tmp/test-buffers/12-34-56-789.wav';
      const timestamp = new Date('2025-01-27T12:34:56.789Z');

      mockedFs.mkdir.mockResolvedValue(undefined);
      const error: any = new Error('Permission denied');
      error.code = 'EACCES';
      mockedFs.appendFile.mockRejectedValue(error);

      await expect(writer.writeTranscription(mockTranscription, audioFilePath, timestamp)).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  describe('Statistics', () => {
    it('should track total writes', async () => {
      const mockTranscription: TranscriptionResponse = {
        segments: [
          {
            start: 0.0,
            end: 3.5,
            text: 'こんにちは',
            speaker: 'Speaker_00',
            confidence: 0.95,
          },
        ],
        language: 'ja',
        duration: 3.5,
      };

      const audioFilePath = '/tmp/test-buffers/12-34-56-789.wav';
      const timestamp = new Date('2025-01-27T12:34:56.789Z');

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.appendFile.mockResolvedValue(undefined);

      await writer.writeTranscription(mockTranscription, audioFilePath, timestamp);
      await writer.writeTranscription(mockTranscription, audioFilePath, timestamp);

      const stats = writer.getStatistics();
      expect(stats.totalWrites).toBe(2);
      expect(stats.totalSegments).toBe(2);
    });

    it('should track total segments written', async () => {
      const mockTranscription: TranscriptionResponse = {
        segments: [
          {
            start: 0.0,
            end: 3.5,
            text: 'こんにちは',
            speaker: 'Speaker_00',
            confidence: 0.95,
          },
          {
            start: 3.5,
            end: 7.2,
            text: 'よろしくお願いします',
            speaker: 'Speaker_01',
            confidence: 0.92,
          },
        ],
        language: 'ja',
        duration: 7.2,
      };

      const audioFilePath = '/tmp/test-buffers/12-34-56-789.wav';
      const timestamp = new Date('2025-01-27T12:34:56.789Z');

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.appendFile.mockResolvedValue(undefined);

      await writer.writeTranscription(mockTranscription, audioFilePath, timestamp);

      const stats = writer.getStatistics();
      expect(stats.totalWrites).toBe(1);
      expect(stats.totalSegments).toBe(2);
    });

    it('should track failed writes', async () => {
      const mockTranscription: TranscriptionResponse = {
        segments: [
          {
            start: 0.0,
            end: 3.5,
            text: 'こんにちは',
            speaker: 'Speaker_00',
            confidence: 0.95,
          },
        ],
        language: 'ja',
        duration: 3.5,
      };

      const audioFilePath = '/tmp/test-buffers/12-34-56-789.wav';
      const timestamp = new Date('2025-01-27T12:34:56.789Z');

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.appendFile.mockRejectedValue(new Error('Disk full'));

      try {
        await writer.writeTranscription(mockTranscription, audioFilePath, timestamp);
      } catch (error) {
        // Expected
      }

      const stats = writer.getStatistics();
      expect(stats.failedWrites).toBe(1);
    });
  });
});
