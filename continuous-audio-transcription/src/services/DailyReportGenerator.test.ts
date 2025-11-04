/**
 * Daily Report Generator Tests
 * 日次レポート生成のテスト
 */

import { DailyReportGenerator } from './DailyReportGenerator';
import * as fs from 'fs/promises';

// Mock fs module
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('DailyReportGenerator', () => {
  let generator: DailyReportGenerator;
  const testBaseDir = '/tmp/test-transcriptions';

  beforeEach(() => {
    generator = new DailyReportGenerator({
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

  describe('Character Count', () => {
    it('should count characters from daily.txt', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      const dailyContent =
        '[12:15:30] [Speaker_00] こんにちは\n' +
        '[12:16:00] [Speaker_01] よろしくお願いします\n' +
        '[14:30:00] [Speaker_00] ありがとうございました\n';

      mockedFs.readFile.mockResolvedValue(dailyContent);

      const count = await generator.countCharacters(date);

      // Count only text content (excluding timestamps and speaker labels)
      // "こんにちは" (5) + "よろしくお願いします" (10) + "ありがとうございました" (11) = 26
      expect(count).toBe(26);
    });

    it('should return 0 when daily.txt does not exist', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      const error: any = new Error('ENOENT: no such file or directory');
      error.code = 'ENOENT';
      mockedFs.readFile.mockRejectedValue(error);

      const count = await generator.countCharacters(date);
      expect(count).toBe(0);
    });

    it('should handle empty daily.txt', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      mockedFs.readFile.mockResolvedValue('');

      const count = await generator.countCharacters(date);
      expect(count).toBe(0);
    });
  });

  describe('Report Generation', () => {
    it('should generate daily report', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');
      const uptime = 86400000; // 24 hours in milliseconds
      const errorCount = 5;

      const dailyContent =
        '[12:15:30] [Speaker_00] こんにちは\n' + '[12:16:00] [Speaker_01] よろしくお願いします\n';

      mockedFs.readFile.mockResolvedValue(dailyContent);

      const report = await generator.generateReport(date, uptime, errorCount);

      expect(report).toContain('Daily Report - 2025-01-27');
      expect(report).toContain('Characters: 15'); // "こんにちは" (5) + "よろしくお願いします" (10) = 15
      expect(report).toContain('Uptime: 24h 0m');
      expect(report).toContain('Errors: 5');
    });

    it('should format uptime correctly', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');
      const uptime = 3665000; // 1 hour, 1 minute, 5 seconds
      const errorCount = 0;

      mockedFs.readFile.mockResolvedValue('');

      const report = await generator.generateReport(date, uptime, errorCount);

      expect(report).toContain('Uptime: 1h 1m');
    });

    it('should handle zero uptime', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');
      const uptime = 0;
      const errorCount = 0;

      mockedFs.readFile.mockResolvedValue('');

      const report = await generator.generateReport(date, uptime, errorCount);

      expect(report).toContain('Uptime: 0h 0m');
    });

    it('should include all required fields', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');
      const uptime = 86400000;
      const errorCount = 10;

      const dailyContent = '[12:15:30] [Speaker_00] テスト\n';
      mockedFs.readFile.mockResolvedValue(dailyContent);

      const report = await generator.generateReport(date, uptime, errorCount);

      // Check all required fields
      expect(report).toContain('Daily Report - 2025-01-27');
      expect(report).toContain('Characters:');
      expect(report).toContain('Uptime:');
      expect(report).toContain('Errors:');
    });
  });

  describe('Statistics', () => {
    it('should track total reports generated', async () => {
      const date1 = new Date('2025-01-27T00:00:00.000Z');
      const date2 = new Date('2025-01-28T00:00:00.000Z');

      mockedFs.readFile.mockResolvedValue('');

      await generator.generateReport(date1, 0, 0);
      await generator.generateReport(date2, 0, 0);

      const stats = generator.getStatistics();
      expect(stats.totalReportsGenerated).toBe(2);
    });

    it('should track total characters counted', async () => {
      const date = new Date('2025-01-27T00:00:00.000Z');

      const dailyContent =
        '[12:15:30] [Speaker_00] こんにちは\n' + '[12:16:00] [Speaker_01] よろしくお願いします\n';

      mockedFs.readFile.mockResolvedValue(dailyContent);

      await generator.generateReport(date, 0, 0);

      const stats = generator.getStatistics();
      expect(stats.totalCharactersCounted).toBe(15); // "こんにちは" (5) + "よろしくお願いします" (10) = 15
    });
  });
});
