/**
 * Hourly Aggregator Tests
 * 1時間ごとの文字起こし集約のテスト
 */

import { HourlyAggregator } from './HourlyAggregator';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('HourlyAggregator', () => {
  let aggregator: HourlyAggregator;
  const testBaseDir = '/tmp/test-transcriptions';

  beforeEach(() => {
    aggregator = new HourlyAggregator({
      baseDir: testBaseDir,
    });
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(aggregator).toBeDefined();
      expect(aggregator.getConfig().baseDir).toBe(testBaseDir);
    });
  });

  describe('Hourly Aggregation', () => {
    it('should aggregate JSONL files for a specific hour', async () => {
      const date = new Date('2025-01-27T12:00:00.000Z');
      const hour = 12;

      // Mock directory reading
      mockedFs.readdir.mockResolvedValue([
        '12-15-30.jsonl',
        '12-45-20.jsonl',
        '13-00-10.jsonl', // Different hour
      ] as any);

      // Mock file reading
      mockedFs.readFile
        .mockResolvedValueOnce(
          '{"timestamp":"2025-01-27T12:15:30.000Z","start":0,"end":3.5,"text":"こんにちは","speaker":"Speaker_00","confidence":0.95}\n'
        )
        .mockResolvedValueOnce(
          '{"timestamp":"2025-01-27T12:45:20.000Z","start":0,"end":5.0,"text":"よろしく","speaker":"Speaker_01","confidence":0.92}\n'
        );

      // Mock directory creation and file writing
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      await aggregator.aggregateHour(date, hour);

      // Verify hourly file was created
      const expectedDir = path.join(testBaseDir, '2025-01-27', 'hourly');
      expect(mockedFs.mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true });

      expect(mockedFs.writeFile).toHaveBeenCalledTimes(1);

      const calls = mockedFs.writeFile.mock.calls;
      const content = calls[0]?.[1] as string;
      expect(content).toContain('[Speaker_00] こんにちは');
      expect(content).toContain('[Speaker_01] よろしく');
    });

    it('should sort segments by timestamp', async () => {
      const date = new Date('2025-01-27T12:00:00.000Z');
      const hour = 12;

      mockedFs.readdir.mockResolvedValue(['12-45-20.jsonl', '12-15-30.jsonl'] as any);

      mockedFs.readFile
        .mockResolvedValueOnce(
          '{"timestamp":"2025-01-27T12:45:20.000Z","start":0,"end":5.0,"text":"second","speaker":"Speaker_01","confidence":0.92}\n'
        )
        .mockResolvedValueOnce(
          '{"timestamp":"2025-01-27T12:15:30.000Z","start":0,"end":3.5,"text":"first","speaker":"Speaker_00","confidence":0.95}\n'
        );

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      await aggregator.aggregateHour(date, hour);

      const calls = mockedFs.writeFile.mock.calls;
      const content = calls[0]?.[1] as string;

      // Check that "first" appears before "second"
      const firstIndex = content.indexOf('first');
      const secondIndex = content.indexOf('second');
      expect(firstIndex).toBeLessThan(secondIndex);
    });

    it('should handle empty hour (no files)', async () => {
      const date = new Date('2025-01-27T12:00:00.000Z');
      const hour = 12;

      mockedFs.readdir.mockResolvedValue([] as any);

      await aggregator.aggregateHour(date, hour);

      // Should not create hourly file
      expect(mockedFs.writeFile).not.toHaveBeenCalled();
    });

    it('should handle multiple segments in a single JSONL file', async () => {
      const date = new Date('2025-01-27T12:00:00.000Z');
      const hour = 12;

      mockedFs.readdir.mockResolvedValue(['12-15-30.jsonl'] as any);

      mockedFs.readFile.mockResolvedValueOnce(
        '{"timestamp":"2025-01-27T12:15:30.000Z","start":0,"end":3.5,"text":"line1","speaker":"Speaker_00","confidence":0.95}\n' +
          '{"timestamp":"2025-01-27T12:15:35.000Z","start":3.5,"end":7.0,"text":"line2","speaker":"Speaker_01","confidence":0.90}\n'
      );

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      await aggregator.aggregateHour(date, hour);

      const calls = mockedFs.writeFile.mock.calls;
      const content = calls[0]?.[1] as string;

      expect(content).toContain('line1');
      expect(content).toContain('line2');
    });
  });

  describe('Format', () => {
    it('should format output as [HH:MM:SS] [Speaker_XX] text', async () => {
      const date = new Date('2025-01-27T12:00:00.000Z');
      const hour = 12;

      mockedFs.readdir.mockResolvedValue(['12-15-30.jsonl'] as any);

      mockedFs.readFile.mockResolvedValueOnce(
        '{"timestamp":"2025-01-27T12:15:30.500Z","start":0,"end":3.5,"text":"テスト","speaker":"Speaker_00","confidence":0.95}\n'
      );

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      await aggregator.aggregateHour(date, hour);

      const calls = mockedFs.writeFile.mock.calls;
      const content = calls[0]?.[1] as string;

      // Check format: [HH:MM:SS] [Speaker_XX] text
      expect(content).toMatch(/\[\d{2}:\d{2}:\d{2}\] \[Speaker_\d{2}\] テスト/);
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors', async () => {
      const date = new Date('2025-01-27T12:00:00.000Z');
      const hour = 12;

      mockedFs.readdir.mockResolvedValue(['12-15-30.jsonl'] as any);
      mockedFs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(aggregator.aggregateHour(date, hour)).rejects.toThrow('File not found');
    });

    it('should handle directory read errors', async () => {
      const date = new Date('2025-01-27T12:00:00.000Z');
      const hour = 12;

      mockedFs.readdir.mockRejectedValue(new Error('Permission denied'));

      await expect(aggregator.aggregateHour(date, hour)).rejects.toThrow('Permission denied');
    });
  });

  describe('Statistics', () => {
    it('should track total aggregations', async () => {
      const date = new Date('2025-01-27T12:00:00.000Z');

      mockedFs.readdir.mockResolvedValue(['12-15-30.jsonl', '13-20-40.jsonl'] as any);
      mockedFs.readFile
        .mockResolvedValueOnce(
          '{"timestamp":"2025-01-27T12:15:30.000Z","start":0,"end":3.5,"text":"test","speaker":"Speaker_00","confidence":0.95}\n'
        )
        .mockResolvedValueOnce(
          '{"timestamp":"2025-01-27T13:20:40.000Z","start":0,"end":3.5,"text":"test2","speaker":"Speaker_00","confidence":0.95}\n'
        );
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      await aggregator.aggregateHour(date, 12);
      await aggregator.aggregateHour(date, 13);

      const stats = aggregator.getStatistics();
      expect(stats.totalAggregations).toBe(2);
    });

    it('should track total segments aggregated', async () => {
      const date = new Date('2025-01-27T12:00:00.000Z');

      mockedFs.readdir.mockResolvedValue(['12-15-30.jsonl'] as any);
      mockedFs.readFile.mockResolvedValue(
        '{"timestamp":"2025-01-27T12:15:30.000Z","start":0,"end":3.5,"text":"test1","speaker":"Speaker_00","confidence":0.95}\n' +
          '{"timestamp":"2025-01-27T12:15:35.000Z","start":3.5,"end":7.0,"text":"test2","speaker":"Speaker_01","confidence":0.90}\n'
      );
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      await aggregator.aggregateHour(date, 12);

      const stats = aggregator.getStatistics();
      expect(stats.totalSegments).toBe(2);
    });
  });
});
