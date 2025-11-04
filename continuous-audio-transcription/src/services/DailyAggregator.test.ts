/**
 * Daily Aggregator Tests
 * 1日ごとの文字起こし集約のテスト
 */

import { DailyAggregator } from './DailyAggregator';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('DailyAggregator', () => {
  let aggregator: DailyAggregator;
  const testBaseDir = '/tmp/test-transcriptions';

  beforeEach(() => {
    aggregator = new DailyAggregator({
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

  describe('Daily Aggregation', () => {
    it('should aggregate all hourly files for a specific day', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      // Mock directory reading - hourly directory contains 3 files
      mockedFs.readdir.mockResolvedValue(['12.txt', '13.txt', '14.txt'] as any);

      // Mock file reading - each hourly file contains some content
      mockedFs.readFile
        .mockResolvedValueOnce('[12:15:30] [Speaker_00] こんにちは\n[12:45:20] [Speaker_01] よろしく\n')
        .mockResolvedValueOnce('[13:00:10] [Speaker_00] 午後です\n')
        .mockResolvedValueOnce('[14:30:45] [Speaker_01] さようなら\n');

      // Mock file writing
      mockedFs.writeFile.mockResolvedValue(undefined);

      await aggregator.aggregateDay(date);

      // Verify daily file was created
      const expectedPath = path.join(testBaseDir, '2025-01-27', 'daily.txt');
      expect(mockedFs.writeFile).toHaveBeenCalledWith(expectedPath, expect.any(String), 'utf8');

      const calls = mockedFs.writeFile.mock.calls;
      const content = calls[0]?.[1] as string;
      expect(content).toContain('[12:15:30] [Speaker_00] こんにちは');
      expect(content).toContain('[13:00:10] [Speaker_00] 午後です');
      expect(content).toContain('[14:30:45] [Speaker_01] さようなら');
    });

    it('should sort hourly files numerically (00.txt, 01.txt, ..., 23.txt)', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      // Mock directory reading - files in non-sorted order
      mockedFs.readdir.mockResolvedValue(['14.txt', '02.txt', '23.txt'] as any);

      // Files will be sorted: 02.txt, 14.txt, 23.txt
      mockedFs.readFile
        .mockResolvedValueOnce('[02:00:00] [Speaker_00] 2時\n')
        .mockResolvedValueOnce('[14:00:00] [Speaker_00] 14時\n')
        .mockResolvedValueOnce('[23:00:00] [Speaker_00] 23時\n');

      mockedFs.writeFile.mockResolvedValue(undefined);

      await aggregator.aggregateDay(date);

      const calls = mockedFs.writeFile.mock.calls;
      const content = calls[0]?.[1] as string;

      // Check that "2時" appears before "14時" which appears before "23時"
      const index02 = content.indexOf('2時');
      const index14 = content.indexOf('14時');
      const index23 = content.indexOf('23時');
      expect(index02).toBeLessThan(index14);
      expect(index14).toBeLessThan(index23);
    });

    it('should handle empty day (no hourly files)', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      // Mock directory read error (directory does not exist)
      const error: any = new Error('ENOENT: no such file or directory');
      error.code = 'ENOENT';
      mockedFs.readdir.mockRejectedValue(error);

      await aggregator.aggregateDay(date);

      // Should not create daily file
      expect(mockedFs.writeFile).not.toHaveBeenCalled();
    });

    it('should skip non-hourly files', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      // Mock directory reading - includes daily.txt and other files
      mockedFs.readdir.mockResolvedValue(['12.txt', 'daily.txt', 'summary.txt', '.DS_Store'] as any);

      mockedFs.readFile.mockResolvedValue('[12:00:00] [Speaker_00] test\n');

      mockedFs.writeFile.mockResolvedValue(undefined);

      await aggregator.aggregateDay(date);

      // Should only read 12.txt (one hourly file)
      expect(mockedFs.readFile).toHaveBeenCalledTimes(1);
    });

    it('should preserve original formatting from hourly files', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir.mockResolvedValue(['12.txt'] as any);

      const hourlyContent =
        '[12:15:30] [Speaker_00] こんにちは\n' +
        '[12:15:35] [Speaker_01] よろしく\n' +
        '[12:45:20] [Speaker_00] 次の話題です\n';

      mockedFs.readFile.mockResolvedValue(hourlyContent);
      mockedFs.writeFile.mockResolvedValue(undefined);

      await aggregator.aggregateDay(date);

      const calls = mockedFs.writeFile.mock.calls;
      const content = calls[0]?.[1] as string;

      expect(content).toBe(hourlyContent);
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir.mockResolvedValue(['12.txt'] as any);
      mockedFs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(aggregator.aggregateDay(date)).rejects.toThrow('File not found');
    });

    it('should handle file write errors', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir.mockResolvedValue(['12.txt'] as any);
      mockedFs.readFile.mockResolvedValue('[12:00:00] [Speaker_00] test\n');

      const error: any = new Error('No space left on device');
      error.code = 'ENOSPC';
      mockedFs.writeFile.mockRejectedValue(error);

      await expect(aggregator.aggregateDay(date)).rejects.toThrow('No space left on device');
    });
  });

  describe('Statistics', () => {
    it('should track total aggregations', async () => {
      const date1 = new Date('2025-01-27T00:00:00.000Z');
      const date2 = new Date('2025-01-28T00:00:00.000Z');

      mockedFs.readdir.mockResolvedValue(['12.txt'] as any);
      mockedFs.readFile.mockResolvedValue('[12:00:00] [Speaker_00] test\n');
      mockedFs.writeFile.mockResolvedValue(undefined);

      await aggregator.aggregateDay(date1);
      await aggregator.aggregateDay(date2);

      const stats = aggregator.getStatistics();
      expect(stats.totalAggregations).toBe(2);
    });

    it('should track total hourly files aggregated', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir.mockResolvedValue(['12.txt', '13.txt', '14.txt'] as any);
      mockedFs.readFile.mockResolvedValue('[12:00:00] [Speaker_00] test\n');
      mockedFs.writeFile.mockResolvedValue(undefined);

      await aggregator.aggregateDay(date);

      const stats = aggregator.getStatistics();
      expect(stats.totalHourlyFiles).toBe(3);
    });

    it('should not increment statistics for empty days', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      const error: any = new Error('ENOENT: no such file or directory');
      error.code = 'ENOENT';
      mockedFs.readdir.mockRejectedValue(error);

      await aggregator.aggregateDay(date);

      const stats = aggregator.getStatistics();
      expect(stats.totalAggregations).toBe(0);
      expect(stats.totalHourlyFiles).toBe(0);
    });
  });
});
