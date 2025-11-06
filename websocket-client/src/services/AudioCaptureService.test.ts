/**
 * Audio Capture Service Tests
 * Task 13.1: FFmpegクラッシュハンドリングのテスト
 */

import { AudioCaptureService } from './AudioCaptureService';
import { EventEmitter } from 'events';

// Mock child_process
const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
}));

jest.mock('./BufferManager', () => ({
  BufferManager: jest.fn().mockImplementation(() => ({
    addChunk: jest.fn().mockReturnValue(false),
    flush: jest.fn().mockResolvedValue('/tmp/test.wav'),
    cleanup: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('AudioCaptureService', () => {
  let service: AudioCaptureService;
  let mockProcess: any;
  const mockConfig = {
    deviceName: 'BlackHole 2ch',
    sampleRate: 48000,
    channels: 2,
    format: 'f32le',
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    // Create mock FFmpeg process
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = jest.fn();
    mockProcess.pid = 12345;

    mockSpawn.mockReturnValue(mockProcess);

    service = new AudioCaptureService(mockConfig);
  });

  afterEach(async () => {
    await service.stop();
    jest.useRealTimers();
  });

  describe('Task 13.1: FFmpegクラッシュハンドリング', () => {
    test('should detect FFmpeg process exit', async () => {
      // Given: FFmpeg process is running
      const errorSpy = jest.fn();
      service.on('error', errorSpy);

      const startPromise = service.start();

      // Simulate FFmpeg starting successfully
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('audio data'));
      }, 100);

      jest.advanceTimersByTime(100);
      await startPromise;

      // When: FFmpeg exits with error code
      mockProcess.emit('exit', 1);

      // Then: Error event should be emitted
      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0].message).toContain('FFmpeg exited with code 1');
    });

    test('should auto-restart FFmpeg on crash (max 3 times)', async () => {
      // Given: Service is running
      const errorSpy = jest.fn();
      service.on('error', errorSpy);

      const startPromise = service.start();
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      jest.advanceTimersByTime(100);
      await startPromise;

      // When: First crash occurs
      mockProcess.emit('exit', 1);

      // Fast-forward through restart delay
      jest.advanceTimersByTime(10000);

      // Simulate successful restart
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      await Promise.resolve();

      // Then: Should track restart count
      const stats = service.getStatistics();
      expect(stats.restartCount).toBe(1);
      expect(stats.lastRestartTime).toBeDefined();
    });

    test('should emit fatal error notification after 3 failed restarts', async () => {
      // Given: Service is configured
      const errorSpy = jest.fn();
      const fatalErrorSpy = jest.fn();
      service.on('error', errorSpy);
      service.on('fatalError', fatalErrorSpy);

      const startPromise = service.start();
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      jest.advanceTimersByTime(100);
      await startPromise;

      // When: Crash occurs and restarts 3 times, then fails on 4th
      // Crash 1 -> Restart 1
      mockProcess.emit('exit', 1);
      await Promise.resolve();
      jest.advanceTimersByTime(10000); // Wait for restart delay
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      jest.advanceTimersByTime(100); // Let restart complete
      await Promise.resolve();

      // Crash 2 -> Restart 2
      mockProcess.emit('exit', 1);
      await Promise.resolve();
      jest.advanceTimersByTime(10000);
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Crash 3 -> Restart 3
      mockProcess.emit('exit', 1);
      await Promise.resolve();
      jest.advanceTimersByTime(10000);
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Crash 4 -> Should emit fatal error (restartCount = 4, exceeds max of 3)
      mockProcess.emit('exit', 1);
      await Promise.resolve();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Then: Should emit fatal error with detailed message
      expect(fatalErrorSpy).toHaveBeenCalled();
      const fatalError = fatalErrorSpy.mock.calls[0][0];
      expect(fatalError.message).toContain('maximum restart attempts');
      expect(fatalError.message).toContain('Troubleshooting');

      // Should not attempt further restarts
      const stats = service.getStatistics();
      expect(stats.restartCount).toBe(4); // 4 crashes total
    });

    test('should record restart statistics', async () => {
      // Given: Service is running
      const errorSpy = jest.fn();
      service.on('error', errorSpy);

      const startPromise = service.start();
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      jest.advanceTimersByTime(100);
      await startPromise;

      const statsBefore = service.getStatistics();
      expect(statsBefore.restartCount).toBe(0);
      expect(statsBefore.lastRestartTime).toBeUndefined();

      // When: Restart occurs
      mockProcess.emit('exit', 1);
      jest.advanceTimersByTime(10000);
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      await Promise.resolve();

      // Then: Statistics should be updated
      const statsAfter = service.getStatistics();
      expect(statsAfter.restartCount).toBe(1);
      expect(statsAfter.lastRestartTime).toBeInstanceOf(Date);
    });

    test('should log error messages when restart fails', async () => {
      // Given: Service is running
      const errorSpy = jest.fn();
      const fatalErrorSpy = jest.fn();
      service.on('error', errorSpy);
      service.on('fatalError', fatalErrorSpy);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const startPromise = service.start();
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      jest.advanceTimersByTime(100);
      await startPromise;

      // When: Crash occurs 4 times to exceed max restart attempts
      for (let i = 0; i < 4; i++) {
        mockProcess.emit('exit', 1);
        jest.advanceTimersByTime(10000);
        if (i < 3) {
          mockProcess.stdout.emit('data', Buffer.from('audio data'));
          await Promise.resolve();
        }
      }

      // Then: Should log detailed error with troubleshooting
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorLogs = consoleErrorSpy.mock.calls.map(call => call.join(' '));
      const hasDetailedError = errorLogs.some(log =>
        log.includes('FFmpeg') && log.includes('restart')
      );
      expect(hasDetailedError).toBe(true);

      consoleErrorSpy.mockRestore();
    });

    test('should maintain restart count across multiple crashes', async () => {
      // Given: Service is running
      const errorSpy = jest.fn();
      service.on('error', errorSpy);

      const startPromise = service.start();
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      jest.advanceTimersByTime(100);
      await startPromise;

      // When: Multiple crashes occur
      for (let i = 1; i <= 2; i++) {
        mockProcess.emit('exit', 1);
        jest.advanceTimersByTime(10000);
        mockProcess.stdout.emit('data', Buffer.from('audio data'));
        await Promise.resolve();

        // Then: Restart count should increment
        const stats = service.getStatistics();
        expect(stats.restartCount).toBe(i);
      }
    });

    test('should reset restart count on successful start', async () => {
      // Given: Service has crashed before (set internal restart count)
      const errorSpy = jest.fn();
      service.on('error', errorSpy);

      const startPromise = service.start();
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      jest.advanceTimersByTime(100);
      await startPromise;

      // Simulate a crash
      mockProcess.emit('exit', 1);
      jest.advanceTimersByTime(10000);
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      await Promise.resolve();

      expect(service.getStatistics().restartCount).toBe(1);

      // When: Successfully stops and starts again
      await service.stop();

      const restartPromise = service.start();
      mockProcess.stdout.emit('data', Buffer.from('audio data'));
      jest.advanceTimersByTime(100);
      await restartPromise;

      // Then: Restart count should NOT reset (only tracks auto-restarts)
      // But internal retry count should be reset
      expect(service.getRetryCount()).toBe(0);
    });
  });

  describe('Configuration', () => {
    test('should return configuration', () => {
      const config = service.getConfig();
      expect(config).toEqual(mockConfig);
    });

    test('should check if service is running', () => {
      expect(service.isRunning()).toBe(false);
    });

    test('should get process ID', () => {
      expect(service.getProcessId()).toBeNull();
    });

    test('should get retry count', () => {
      expect(service.getRetryCount()).toBe(0);
    });
  });

  describe('Statistics', () => {
    test('should return statistics', () => {
      const stats = service.getStatistics();
      expect(stats).toHaveProperty('bytesCapture');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('restartCount');
    });
  });
});
