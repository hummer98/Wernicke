/**
 * FileSystem Utility Tests
 * ファイルシステム管理ユーティリティのテスト
 */

import { FileSystem } from './FileSystem';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('FileSystem', () => {
  const testBaseDir = path.join(os.tmpdir(), 'test-transcriptions');

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true });
    }
  });

  describe('Directory Creation', () => {
    it('should create transcription directory structure', () => {
      const date = new Date('2024-01-15');
      FileSystem.createTranscriptionDirectories(testBaseDir, date);

      const dailyDir = path.join(testBaseDir, '2024-01-15');
      const rawDir = path.join(dailyDir, 'raw');
      const hourlyDir = path.join(dailyDir, 'hourly');

      expect(fs.existsSync(dailyDir)).toBe(true);
      expect(fs.existsSync(rawDir)).toBe(true);
      expect(fs.existsSync(hourlyDir)).toBe(true);
    });

    it('should set correct permissions on directories', () => {
      const date = new Date();
      FileSystem.createTranscriptionDirectories(testBaseDir, date);

      const dailyDir = path.join(testBaseDir, date.toISOString().split('T')[0] ?? '');
      const stats = fs.statSync(dailyDir);

      // Check that directory is readable, writable, and executable by owner
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o700);
    });

    it('should not fail if directories already exist', () => {
      const date = new Date();

      FileSystem.createTranscriptionDirectories(testBaseDir, date);
      FileSystem.createTranscriptionDirectories(testBaseDir, date);

      const dailyDir = path.join(testBaseDir, date.toISOString().split('T')[0] ?? '');
      expect(fs.existsSync(dailyDir)).toBe(true);
    });

    it('should create nested date directories correctly', () => {
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2024-01-16');

      FileSystem.createTranscriptionDirectories(testBaseDir, date1);
      FileSystem.createTranscriptionDirectories(testBaseDir, date2);

      expect(fs.existsSync(path.join(testBaseDir, '2024-01-15'))).toBe(true);
      expect(fs.existsSync(path.join(testBaseDir, '2024-01-16'))).toBe(true);
    });
  });

  describe('Disk Space Check', () => {
    it('should return free space in GB', () => {
      const freeSpace = FileSystem.getFreeDiskSpaceGB(testBaseDir);

      expect(freeSpace).toBeGreaterThan(0);
      expect(Number.isFinite(freeSpace)).toBe(true);
    });

    it('should check if sufficient disk space is available', () => {
      const result = FileSystem.hasSufficientSpace(testBaseDir, 0.1);

      expect(result).toBe(true);
    });

    it('should detect insufficient disk space', () => {
      const result = FileSystem.hasSufficientSpace(testBaseDir, 999999);

      expect(result).toBe(false);
    });
  });

  describe('File Rotation Utilities', () => {
    it('should find files older than retention days', () => {
      // Create test files with different dates
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40); // 40 days ago
      const oldDir = path.join(testBaseDir, oldDate.toISOString().split('T')[0] ?? '');
      fs.mkdirSync(oldDir, { recursive: true });
      fs.writeFileSync(path.join(oldDir, 'test.jsonl'), 'test');

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5); // 5 days ago
      const recentDir = path.join(testBaseDir, recentDate.toISOString().split('T')[0] ?? '');
      fs.mkdirSync(recentDir, { recursive: true });
      fs.writeFileSync(path.join(recentDir, 'test.jsonl'), 'test');

      const oldFiles = FileSystem.findOldDirectories(testBaseDir, 30);

      expect(oldFiles.length).toBe(1);
      expect(oldFiles[0]).toContain(oldDate.toISOString().split('T')[0]);
    });

    it('should return empty array when no old files exist', () => {
      const recentDate = new Date();
      const recentDir = path.join(testBaseDir, recentDate.toISOString().split('T')[0] ?? '');
      fs.mkdirSync(recentDir, { recursive: true });

      const oldFiles = FileSystem.findOldDirectories(testBaseDir, 30);

      expect(oldFiles.length).toBe(0);
    });

    it('should calculate directory size correctly', () => {
      const testDir = path.join(testBaseDir, 'test');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'file1.txt'), 'a'.repeat(1000));
      fs.writeFileSync(path.join(testDir, 'file2.txt'), 'b'.repeat(2000));

      const size = FileSystem.getDirectorySize(testDir);

      expect(size).toBe(3000);
    });

    it('should return 0 for empty directory', () => {
      const testDir = path.join(testBaseDir, 'empty');
      fs.mkdirSync(testDir, { recursive: true });

      const size = FileSystem.getDirectorySize(testDir);

      expect(size).toBe(0);
    });

    it('should delete old directories successfully', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);
      const oldDir = path.join(testBaseDir, oldDate.toISOString().split('T')[0] ?? '');
      fs.mkdirSync(oldDir, { recursive: true });
      fs.writeFileSync(path.join(oldDir, 'test.txt'), 'test');

      const deletedCount = FileSystem.deleteOldDirectories(testBaseDir, 30);

      expect(deletedCount).toBe(1);
      expect(fs.existsSync(oldDir)).toBe(false);
    });
  });

  describe('Path Utilities', () => {
    it('should generate correct daily directory path', () => {
      const date = new Date('2024-01-15');
      const dailyPath = FileSystem.getDailyDirectoryPath(testBaseDir, date);

      expect(dailyPath).toBe(path.join(testBaseDir, '2024-01-15'));
    });

    it('should generate correct raw directory path', () => {
      const date = new Date('2024-01-15');
      const rawPath = FileSystem.getRawDirectoryPath(testBaseDir, date);

      expect(rawPath).toBe(path.join(testBaseDir, '2024-01-15', 'raw'));
    });

    it('should generate correct hourly directory path', () => {
      const date = new Date('2024-01-15');
      const hourlyPath = FileSystem.getHourlyDirectoryPath(testBaseDir, date);

      expect(hourlyPath).toBe(path.join(testBaseDir, '2024-01-15', 'hourly'));
    });
  });

  describe('Permission Settings', () => {
    it('should set file permissions to 600', () => {
      const testFile = path.join(testBaseDir, 'test.txt');
      fs.mkdirSync(testBaseDir, { recursive: true });
      fs.writeFileSync(testFile, 'test');

      FileSystem.setFilePermissions(testFile, 0o600);

      const stats = fs.statSync(testFile);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('should set directory permissions to 700', () => {
      const testDir = path.join(testBaseDir, 'test');
      fs.mkdirSync(testDir, { recursive: true });

      FileSystem.setFilePermissions(testDir, 0o700);

      const stats = fs.statSync(testDir);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o700);
    });
  });
});
