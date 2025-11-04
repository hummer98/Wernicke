/**
 * FileSystem Utility
 * ファイルシステム管理ユーティリティ
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * FileSystem utility class
 * ファイルシステム管理ユーティリティクラス
 */
export class FileSystem {
  /**
   * Create transcription directory structure
   * 文字起こしディレクトリ構造を作成
   */
  public static createTranscriptionDirectories(baseDir: string, date: Date): void {
    const dailyDir = this.getDailyDirectoryPath(baseDir, date);
    const rawDir = this.getRawDirectoryPath(baseDir, date);
    const hourlyDir = this.getHourlyDirectoryPath(baseDir, date);

    // Create directories with proper permissions
    if (!fs.existsSync(dailyDir)) {
      fs.mkdirSync(dailyDir, { recursive: true, mode: 0o700 });
    }
    if (!fs.existsSync(rawDir)) {
      fs.mkdirSync(rawDir, { recursive: true, mode: 0o700 });
    }
    if (!fs.existsSync(hourlyDir)) {
      fs.mkdirSync(hourlyDir, { recursive: true, mode: 0o700 });
    }

    // Ensure permissions are set correctly (in case directories already existed)
    this.setFilePermissions(dailyDir, 0o700);
    this.setFilePermissions(rawDir, 0o700);
    this.setFilePermissions(hourlyDir, 0o700);
  }

  /**
   * Get free disk space in GB
   * ディスク空き容量をGBで取得
   */
  public static getFreeDiskSpaceGB(dirPath: string): number {
    // If directory doesn't exist, use parent directory for space check
    let checkPath = dirPath;
    while (!fs.existsSync(checkPath) && checkPath !== path.dirname(checkPath)) {
      checkPath = path.dirname(checkPath);
    }

    const stats = fs.statfsSync(checkPath);
    const freeBytes = stats.bavail * stats.bsize;
    return freeBytes / (1024 * 1024 * 1024); // Convert to GB
  }

  /**
   * Check if sufficient disk space is available
   * 十分なディスク空き容量があるかチェック
   */
  public static hasSufficientSpace(dirPath: string, requiredGB: number): boolean {
    const freeGB = this.getFreeDiskSpaceGB(dirPath);
    return freeGB >= requiredGB;
  }

  /**
   * Find directories older than retention days
   * 保持期間を超えた古いディレクトリを検索
   */
  public static findOldDirectories(baseDir: string, retentionDays: number): string[] {
    if (!fs.existsSync(baseDir)) {
      return [];
    }

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const oldDirectories: string[] = [];

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Check if directory name is a date (YYYY-MM-DD)
        const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entry.name);
        if (dateMatch !== null) {
          const dirDate = new Date(entry.name);
          if (dirDate < cutoffDate) {
            oldDirectories.push(path.join(baseDir, entry.name));
          }
        }
      }
    }

    return oldDirectories;
  }

  /**
   * Calculate total size of directory in bytes
   * ディレクトリの合計サイズをバイトで計算
   */
  public static getDirectorySize(dirPath: string): number {
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    let totalSize = 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += this.getDirectorySize(fullPath);
      } else {
        const stats = fs.statSync(fullPath);
        totalSize += stats.size;
      }
    }

    return totalSize;
  }

  /**
   * Delete old directories
   * 古いディレクトリを削除
   */
  public static deleteOldDirectories(baseDir: string, retentionDays: number): number {
    const oldDirectories = this.findOldDirectories(baseDir, retentionDays);
    let deletedCount = 0;

    for (const dirPath of oldDirectories) {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true });
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Get daily directory path
   * 日次ディレクトリパスを取得
   */
  public static getDailyDirectoryPath(baseDir: string, date: Date): string {
    const dateStr = date.toISOString().split('T')[0] ?? '';
    return path.join(baseDir, dateStr);
  }

  /**
   * Get raw directory path
   * rawディレクトリパスを取得
   */
  public static getRawDirectoryPath(baseDir: string, date: Date): string {
    return path.join(this.getDailyDirectoryPath(baseDir, date), 'raw');
  }

  /**
   * Get hourly directory path
   * hourlyディレクトリパスを取得
   */
  public static getHourlyDirectoryPath(baseDir: string, date: Date): string {
    return path.join(this.getDailyDirectoryPath(baseDir, date), 'hourly');
  }

  /**
   * Set file or directory permissions
   * ファイルまたはディレクトリのパーミッションを設定
   */
  public static setFilePermissions(filePath: string, mode: number): void {
    fs.chmodSync(filePath, mode);
  }
}
