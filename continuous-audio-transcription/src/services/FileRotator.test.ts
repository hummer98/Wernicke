/**
 * File Rotator Tests
 * ファイルローテーションと自動削除のテスト
 */

import { FileRotator } from './FileRotator';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('FileRotator', () => {
  let rotator: FileRotator;
  const testBaseDir = '/tmp/test-transcriptions';

  beforeEach(() => {
    rotator = new FileRotator({
      baseDir: testBaseDir,
      rawRetentionDays: 7,
      hourlyRetentionDays: 30,
      compressionAfterDays: 3,
    });
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(rotator).toBeDefined();
      const config = rotator.getConfig();
      expect(config.baseDir).toBe(testBaseDir);
      expect(config.rawRetentionDays).toBe(7);
      expect(config.hourlyRetentionDays).toBe(30);
      expect(config.compressionAfterDays).toBe(3);
    });

    it('should use default values if not provided', () => {
      const defaultRotator = new FileRotator({ baseDir: testBaseDir });
      const config = defaultRotator.getConfig();
      expect(config.rawRetentionDays).toBe(7);
      expect(config.hourlyRetentionDays).toBe(30);
      expect(config.compressionAfterDays).toBe(3);
    });
  });

  describe('Raw File Cleanup', () => {
    it('should delete raw files older than retention period', async () => {
      const now = new Date('2025-01-27T00:00:00.000Z');

      // Mock readdir - list of date directories
      mockedFs.readdir
        .mockResolvedValueOnce(['2025-01-15', '2025-01-19', '2025-01-20', '2025-01-26', '2025-01-27'] as any) // date dirs
        .mockResolvedValueOnce(['12-15-30.jsonl', '13-20-40.jsonl'] as any) // 2025-01-15/raw (12 days old - delete)
        .mockResolvedValueOnce(['14-30-45.jsonl'] as any); // 2025-01-19/raw (8 days old - delete)

      // Mock rm for directory removal
      mockedFs.rm.mockResolvedValue(undefined);

      await rotator.cleanupRawFiles(now);

      // Should delete raw directories for 2025-01-15 and 2025-01-19
      expect(mockedFs.rm).toHaveBeenCalledTimes(2);
      expect(mockedFs.rm).toHaveBeenCalledWith(path.join(testBaseDir, '2025-01-15', 'raw'), {
        recursive: true,
        force: true,
      });
      expect(mockedFs.rm).toHaveBeenCalledWith(path.join(testBaseDir, '2025-01-19', 'raw'), {
        recursive: true,
        force: true,
      });
    });

    it('should not delete raw files within retention period', async () => {
      const now = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir.mockResolvedValue(['2025-01-21', '2025-01-26', '2025-01-27'] as any);
      mockedFs.rm.mockResolvedValue(undefined);

      await rotator.cleanupRawFiles(now);

      // Should not delete any files (all within 7 days)
      expect(mockedFs.rm).not.toHaveBeenCalled();
    });

    it('should skip invalid date directories', async () => {
      const now = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir.mockResolvedValue(['2025-01-15', 'invalid-dir', '.DS_Store', 'daily.txt'] as any);
      mockedFs.rm.mockResolvedValue(undefined);

      await rotator.cleanupRawFiles(now);

      // Should only process 2025-01-15
      expect(mockedFs.rm).toHaveBeenCalledTimes(1);
    });
  });

  describe('Hourly File Cleanup', () => {
    it('should delete hourly files older than retention period', async () => {
      const now = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir.mockResolvedValue(['2024-12-15', '2024-12-27', '2025-01-10', '2025-01-27'] as any);
      mockedFs.rm.mockResolvedValue(undefined);

      await rotator.cleanupHourlyFiles(now);

      // Should delete hourly directories for dates older than 30 days
      expect(mockedFs.rm).toHaveBeenCalledTimes(2);
      expect(mockedFs.rm).toHaveBeenCalledWith(path.join(testBaseDir, '2024-12-15', 'hourly'), {
        recursive: true,
        force: true,
      });
      expect(mockedFs.rm).toHaveBeenCalledWith(path.join(testBaseDir, '2024-12-27', 'hourly'), {
        recursive: true,
        force: true,
      });
    });

    it('should not delete hourly files within retention period', async () => {
      const now = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir.mockResolvedValue(['2025-01-01', '2025-01-15', '2025-01-27'] as any);
      mockedFs.rm.mockResolvedValue(undefined);

      await rotator.cleanupHourlyFiles(now);

      // Should not delete any files (all within 30 days)
      expect(mockedFs.rm).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle readdir errors', async () => {
      const now = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir.mockRejectedValue(new Error('Permission denied'));

      await expect(rotator.cleanupRawFiles(now)).rejects.toThrow('Permission denied');
    });

    it('should continue cleanup if individual rm fails', async () => {
      const now = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir
        .mockResolvedValueOnce(['2025-01-15', '2025-01-16'] as any)
        .mockResolvedValueOnce(['12-00-00.jsonl'] as any)
        .mockResolvedValueOnce(['13-00-00.jsonl'] as any);

      // First rm fails, second succeeds
      mockedFs.rm
        .mockRejectedValueOnce(new Error('File busy'))
        .mockResolvedValueOnce(undefined);

      await rotator.cleanupRawFiles(now);

      // Should attempt both deletions
      expect(mockedFs.rm).toHaveBeenCalledTimes(2);

      const stats = rotator.getStatistics();
      expect(stats.failedCleanups).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should track deleted files and directories', async () => {
      const now = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir
        .mockResolvedValueOnce(['2025-01-15', '2025-01-16'] as any)
        .mockResolvedValueOnce(['12-00-00.jsonl', '13-00-00.jsonl'] as any)
        .mockResolvedValueOnce(['14-00-00.jsonl'] as any);

      mockedFs.rm.mockResolvedValue(undefined);

      await rotator.cleanupRawFiles(now);

      const stats = rotator.getStatistics();
      expect(stats.deletedRawDirs).toBe(2);
    });

    it('should track failed cleanups', async () => {
      const now = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir
        .mockResolvedValueOnce(['2025-01-15'] as any)
        .mockResolvedValueOnce(['12-00-00.jsonl'] as any);

      mockedFs.rm.mockRejectedValue(new Error('File busy'));

      await rotator.cleanupRawFiles(now);

      const stats = rotator.getStatistics();
      expect(stats.failedCleanups).toBe(1);
    });
  });

  describe('Rotation Workflow', () => {
    it('should perform full rotation (raw + hourly cleanup)', async () => {
      const now = new Date('2025-01-27T00:00:00.000Z');

      // Mock for raw cleanup
      mockedFs.readdir
        .mockResolvedValueOnce(['2025-01-15', '2025-01-27'] as any) // date dirs
        .mockResolvedValueOnce(['12-00-00.jsonl'] as any) // 2025-01-15/raw
        .mockResolvedValueOnce(['2024-12-15', '2025-01-27'] as any); // date dirs for hourly

      mockedFs.rm.mockResolvedValue(undefined);

      await rotator.rotate(now);

      // Should delete one raw dir and one hourly dir
      expect(mockedFs.rm).toHaveBeenCalledTimes(2);

      const stats = rotator.getStatistics();
      expect(stats.deletedRawDirs).toBe(1);
      expect(stats.deletedHourlyDirs).toBe(1);
    });
  });
});
