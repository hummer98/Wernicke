/**
 * BufferManager Tests
 * バッファ管理サービスのテスト
 */

import { BufferManager } from './BufferManager';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('BufferManager', () => {
  let bufferManager: BufferManager;
  const tempDir = '/tmp/transcription-buffers';

  beforeEach(() => {
    bufferManager = new BufferManager({
      bufferDuration: 30, // 30 seconds
      sampleRate: 16000,
      channels: 1,
      format: 's16le',
      tempDir: tempDir,
    });
  });

  afterEach(async () => {
    await bufferManager.cleanup();
    // Clean up temp directory
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        await fs.unlink(path.join(tempDir, file));
      }
    } catch (error) {
      // Ignore if directory doesn't exist
    }
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(bufferManager).toBeDefined();
      expect(bufferManager.getBufferSize()).toBe(0);
    });

    it('should calculate correct buffer capacity', () => {
      // 30 seconds * 16000 Hz * 1 channel * 2 bytes = 960000 bytes
      const capacity = bufferManager.getBufferCapacity();
      expect(capacity).toBe(30 * 16000 * 1 * 2);
    });

    it('should create temp directory if not exists', async () => {
      const stats = await fs.stat(tempDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('Buffer Accumulation', () => {
    it('should accumulate audio chunks', () => {
      const chunk1 = Buffer.alloc(1000);
      const chunk2 = Buffer.alloc(2000);

      bufferManager.addChunk(chunk1);
      expect(bufferManager.getBufferSize()).toBe(1000);

      bufferManager.addChunk(chunk2);
      expect(bufferManager.getBufferSize()).toBe(3000);
    });

    it('should not exceed buffer capacity', () => {
      const capacity = bufferManager.getBufferCapacity();
      const largeChunk = Buffer.alloc(capacity + 1000);

      bufferManager.addChunk(largeChunk);
      expect(bufferManager.getBufferSize()).toBeLessThanOrEqual(capacity);
    });

    it('should return false when buffer is not full', () => {
      const smallChunk = Buffer.alloc(1000);
      const isFull = bufferManager.addChunk(smallChunk);
      expect(isFull).toBe(false);
    });

    it('should return true when buffer is full', () => {
      const capacity = bufferManager.getBufferCapacity();
      const fullChunk = Buffer.alloc(capacity);
      const isFull = bufferManager.addChunk(fullChunk);
      expect(isFull).toBe(true);
    });
  });

  describe('Buffer Flushing', () => {
    it('should flush buffer to file with timestamp filename', async () => {
      const chunk = Buffer.alloc(10000);
      bufferManager.addChunk(chunk);

      const filePath = await bufferManager.flush();
      expect(filePath).not.toBeNull();

      if (filePath !== null) {
        // Check filename format: HH-MM-SS-mmm.wav
        const filename = path.basename(filePath);
        expect(filename).toMatch(/^\d{2}-\d{2}-\d{2}-\d{3}\.wav$/);

        // Check file exists
        const stats = await fs.stat(filePath);
        expect(stats.isFile()).toBe(true);
      }
    });

    it('should write WAV header to flushed file', async () => {
      const chunk = Buffer.alloc(10000);
      bufferManager.addChunk(chunk);

      const filePath = await bufferManager.flush();
      expect(filePath).not.toBeNull();

      if (filePath !== null) {
        const fileContent = await fs.readFile(filePath);

        // Check WAV header signature
        expect(fileContent.toString('ascii', 0, 4)).toBe('RIFF');
        expect(fileContent.toString('ascii', 8, 12)).toBe('WAVE');
      }
    });

    it('should clear buffer after flush', async () => {
      const chunk = Buffer.alloc(10000);
      bufferManager.addChunk(chunk);

      await bufferManager.flush();
      expect(bufferManager.getBufferSize()).toBe(0);
    });

    it('should release memory after flush', async () => {
      const chunk = Buffer.alloc(10000);
      bufferManager.addChunk(chunk);

      await bufferManager.flush();

      // Internal buffer should be nullified
      // We test this indirectly by checking buffer size
      expect(bufferManager.getBufferSize()).toBe(0);
    });

    it('should throw error when flushing empty buffer', async () => {
      await expect(bufferManager.flush()).rejects.toThrow('Buffer is empty');
    });
  });

  describe('File Management', () => {
    it('should delete temp file after processing', async () => {
      const chunk = Buffer.alloc(10000);
      bufferManager.addChunk(chunk);

      const filePath = await bufferManager.flush();
      expect(filePath).not.toBeNull();

      if (filePath !== null) {
        expect(await fileExists(filePath)).toBe(true);

        await bufferManager.deleteFile(filePath);
        expect(await fileExists(filePath)).toBe(false);
      }
    });

    it('should get list of pending files', async () => {
      // Create multiple buffers
      for (let i = 0; i < 3; i++) {
        const chunk = Buffer.alloc(10000);
        bufferManager.addChunk(chunk);
        await bufferManager.flush();
        // Wait 1ms to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      const files = await bufferManager.getPendingFiles();
      expect(files.length).toBe(3);
    });

    it('should cleanup all temp files', async () => {
      // Create multiple buffers
      for (let i = 0; i < 3; i++) {
        const chunk = Buffer.alloc(10000);
        bufferManager.addChunk(chunk);
        await bufferManager.flush();
      }

      await bufferManager.cleanup();
      const files = await bufferManager.getPendingFiles();
      expect(files.length).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should track total bytes processed', async () => {
      const chunk1 = Buffer.alloc(10000);
      const chunk2 = Buffer.alloc(20000);

      bufferManager.addChunk(chunk1);
      bufferManager.addChunk(chunk2);

      const stats = bufferManager.getStatistics();
      expect(stats.totalBytesProcessed).toBe(30000);
    });

    it('should track flush count', async () => {
      for (let i = 0; i < 3; i++) {
        const chunk = Buffer.alloc(10000);
        bufferManager.addChunk(chunk);
        await bufferManager.flush();
      }

      const stats = bufferManager.getStatistics();
      expect(stats.flushCount).toBe(3);
    });

    it('should track current buffer fill percentage', () => {
      const capacity = bufferManager.getBufferCapacity();
      const chunk = Buffer.alloc(capacity / 2);

      bufferManager.addChunk(chunk);

      const stats = bufferManager.getStatistics();
      expect(stats.bufferFillPercentage).toBeCloseTo(50, 1);
    });
  });
});

/**
 * Helper function to check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
