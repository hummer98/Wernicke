/**
 * Weekly Report Generator Tests
 * 週次レポート生成のテスト
 */

import { WeeklyReportGenerator } from './WeeklyReportGenerator';
import * as fs from 'fs/promises';

// Mock fs module
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('WeeklyReportGenerator', () => {
  let generator: WeeklyReportGenerator;
  const testBaseDir = '/tmp/test-transcriptions';

  beforeEach(() => {
    generator = new WeeklyReportGenerator({
      baseDir: testBaseDir,
    });
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(generator).toBeDefined();
      const config = generator.getConfig();
      expect(config.baseDir).toBe(testBaseDir);
    });
  });

  describe('Storage Calculation', () => {
    it('should calculate total storage usage', async () => {
      // Mock readdir to return date directories
      mockedFs.readdir
        .mockResolvedValueOnce(['2025-01-20', '2025-01-21', '2025-01-22'] as any) // date dirs
        .mockResolvedValueOnce(['raw', 'hourly'] as any) // 2025-01-20 subdirs
        .mockResolvedValueOnce(['12-00-00.jsonl', '13-00-00.jsonl'] as any) // raw files
        .mockResolvedValueOnce(['12.txt', '13.txt'] as any) // hourly files
        .mockResolvedValueOnce(['raw', 'hourly'] as any) // 2025-01-21 subdirs
        .mockResolvedValueOnce(['14-00-00.jsonl'] as any) // raw files
        .mockResolvedValueOnce(['14.txt'] as any) // hourly files
        .mockResolvedValueOnce(['raw'] as any); // 2025-01-22 subdirs (no hourly)
        mockedFs.readdir.mockResolvedValueOnce(['15-00-00.jsonl'] as any); // raw files

      // Mock stat to return file sizes
      mockedFs.stat.mockImplementation((path: any) => {
        const filename = path.split('/').pop();
        if (filename.endsWith('.jsonl')) {
          return Promise.resolve({ size: 1024, isFile: () => true } as any);
        } else if (filename.endsWith('.txt')) {
          return Promise.resolve({ size: 512, isFile: () => true } as any);
        }
        return Promise.resolve({ size: 0, isDirectory: () => true } as any);
      });

      const storage = await generator.calculateStorage();

      // 4 JSONL files (1024 each) + 3 TXT files (512 each) = 4096 + 1536 = 5632 bytes
      expect(storage).toBe(5632);
    });

    it('should return 0 when directory does not exist', async () => {
      const error: any = new Error('ENOENT: no such file or directory');
      error.code = 'ENOENT';
      mockedFs.readdir.mockRejectedValue(error);

      const storage = await generator.calculateStorage();
      expect(storage).toBe(0);
    });

    it('should skip non-date directories', async () => {
      mockedFs.readdir
        .mockResolvedValueOnce(['2025-01-20', 'invalid-dir', '.DS_Store'] as any)
        .mockResolvedValueOnce(['raw'] as any) // 2025-01-20 subdirs
        .mockResolvedValueOnce(['12-00-00.jsonl'] as any); // raw files

      mockedFs.stat.mockResolvedValue({ size: 1024, isFile: () => true } as any);

      const storage = await generator.calculateStorage();
      expect(storage).toBe(1024);
    });
  });

  describe('Report Generation', () => {
    it('should generate weekly report', async () => {
      const startDate = new Date('2025-01-20T00:00:00.000Z');
      const endDate = new Date('2025-01-27T00:00:00.000Z');
      const errorCount = 15;

      mockedFs.readdir.mockResolvedValue([] as any);
      mockedFs.stat.mockResolvedValue({ size: 0 } as any);

      const report = await generator.generateReport(startDate, endDate, errorCount);

      expect(report).toContain('Weekly Report');
      expect(report).toContain('2025-01-20');
      expect(report).toContain('2025-01-27');
      expect(report).toContain('Storage:');
      expect(report).toContain('Errors:');
    });

    it('should format storage size in KB', async () => {
      const startDate = new Date('2025-01-20T00:00:00.000Z');
      const endDate = new Date('2025-01-27T00:00:00.000Z');
      const errorCount = 0;

      mockedFs.readdir
        .mockResolvedValueOnce(['2025-01-20'] as any)
        .mockResolvedValueOnce(['raw'] as any)
        .mockResolvedValueOnce(['12-00-00.jsonl'] as any);

      mockedFs.stat.mockResolvedValue({ size: 2048, isFile: () => true } as any);

      const report = await generator.generateReport(startDate, endDate, errorCount);

      expect(report).toContain('Storage: 2.00 KB');
    });

    it('should format storage size in MB', async () => {
      const startDate = new Date('2025-01-20T00:00:00.000Z');
      const endDate = new Date('2025-01-27T00:00:00.000Z');
      const errorCount = 0;

      mockedFs.readdir
        .mockResolvedValueOnce(['2025-01-20'] as any)
        .mockResolvedValueOnce(['raw'] as any)
        .mockResolvedValueOnce(['12-00-00.jsonl'] as any);

      mockedFs.stat.mockResolvedValue({ size: 2 * 1024 * 1024, isFile: () => true } as any);

      const report = await generator.generateReport(startDate, endDate, errorCount);

      expect(report).toContain('Storage: 2.00 MB');
    });

    it('should include all required fields', async () => {
      const startDate = new Date('2025-01-20T00:00:00.000Z');
      const endDate = new Date('2025-01-27T00:00:00.000Z');
      const errorCount = 20;

      mockedFs.readdir.mockResolvedValue([] as any);

      const report = await generator.generateReport(startDate, endDate, errorCount);

      expect(report).toContain('Weekly Report');
      expect(report).toContain('Storage:');
      expect(report).toContain('Errors:');
      expect(report).toContain('Generated at:');
    });
  });

  describe('Statistics', () => {
    it('should track total reports generated', async () => {
      const startDate = new Date('2025-01-20T00:00:00.000Z');
      const endDate = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readdir.mockResolvedValue([] as any);

      await generator.generateReport(startDate, endDate, 0);
      await generator.generateReport(startDate, endDate, 0);

      const stats = generator.getStatistics();
      expect(stats.totalReportsGenerated).toBe(2);
    });
  });
});
