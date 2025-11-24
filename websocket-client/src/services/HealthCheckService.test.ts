/**
 * Health Check Service Tests
 * Task 14.2: クライアント側ヘルスチェック機能
 */

import { HealthCheckService } from './HealthCheckService';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HealthCheckService - Task 14.2: Client-side Health Check', () => {
  let service: HealthCheckService;
  const healthCheckUrl = 'http://localhost:8000/health';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    service = new HealthCheckService(healthCheckUrl);
  });

  afterEach(() => {
    service.stop();
    jest.useRealTimers();
  });

  describe('Task 14.2.1: 60秒ごとのヘルスチェック実行', () => {
    test('should execute health check every 60 seconds', async () => {
      // Given: HealthCheckService is started
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          status: 'healthy',
          active_sessions: 0,
          gpu_vram_used_mb: 4096,
          gpu_vram_total_mb: 12288,
        },
      });

      service.start();

      // When: 60 seconds pass
      expect(mockedAxios.get).toHaveBeenCalledTimes(1); // Initial check

      // Advance time by 60 seconds
      jest.advanceTimersByTime(60000);
      await Promise.resolve(); // Let promises resolve

      // Then: Health check should be called again
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(mockedAxios.get).toHaveBeenCalledWith(healthCheckUrl);
    });

    test('should continue checking even after errors', async () => {
      // Given: First health check fails
      mockedAxios.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          status: 200,
          data: { status: 'healthy' },
        });

      service.start();

      // When: Time advances past the first error
      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      // Then: Should continue checking
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('Task 14.2.2: サーバー応答のログ記録', () => {
    test('should log successful health check responses', async () => {
      // Given: Health check succeeds
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          status: 'healthy',
          active_sessions: 2,
          gpu_vram_used_mb: 4096,
          gpu_vram_total_mb: 12288,
        },
      });

      // When: Health check is performed
      service.start();
      await Promise.resolve();

      // Then: Response should be logged
      expect(consoleLogSpy).toHaveBeenCalled();
      const logMessages = consoleLogSpy.mock.calls.map(call => call.join(' '));
      const hasHealthLog = logMessages.some(
        log => log.includes('Health check') && log.includes('healthy')
      );
      expect(hasHealthLog).toBe(true);

      consoleLogSpy.mockRestore();
    });

    test('should log GPU VRAM information', async () => {
      // Given: Health check returns GPU info
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          status: 'healthy',
          active_sessions: 0,
          gpu_vram_used_mb: 4096,
          gpu_vram_total_mb: 12288,
        },
      });

      // When: Health check is performed
      service.start();
      await Promise.resolve();

      // Then: GPU VRAM info should be logged
      expect(consoleLogSpy).toHaveBeenCalled();
      const logMessages = consoleLogSpy.mock.calls.map(call => call.join(' '));
      const hasGPULog = logMessages.some(
        log => log.includes('GPU') || log.includes('VRAM') || log.includes('4096')
      );
      expect(hasGPULog).toBe(true);

      consoleLogSpy.mockRestore();
    });
  });

  describe('Task 14.2.3: 異常検出時の警告ログ', () => {
    test('should log warning when server returns 503', async () => {
      // Given: Server returns unhealthy status
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockedAxios.get.mockResolvedValue({
        status: 503,
        data: {
          status: 'unhealthy',
          reason: 'GPU/CUDA is not available',
          active_sessions: 0,
        },
      });

      // When: Health check is performed
      service.start();
      await Promise.resolve();

      // Then: Warning should be logged
      expect(consoleWarnSpy).toHaveBeenCalled();
      const warnMessages = consoleWarnSpy.mock.calls.map(call => call.join(' '));
      const hasUnhealthyWarning = warnMessages.some(
        log => log.includes('unhealthy') || log.includes('warning')
      );
      expect(hasUnhealthyWarning).toBe(true);

      consoleWarnSpy.mockRestore();
    });

    test('should log error when health check fails', async () => {
      // Given: Health check request fails
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockedAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      // When: Health check is performed
      service.start();
      await Promise.resolve();

      // Then: Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorMessages = consoleErrorSpy.mock.calls.map(call => call.join(' '));
      const hasErrorLog = errorMessages.some(
        log => log.includes('Health check') && (log.includes('error') || log.includes('failed'))
      );
      expect(hasErrorLog).toBe(true);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Task 14.2.4: ヘルスチェック統計の記録', () => {
    test('should track total health checks performed', async () => {
      // Given: Multiple health checks are performed
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: { status: 'healthy' },
      });

      service.start();
      await Promise.resolve();

      // When: Time advances for multiple checks
      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      // Then: Statistics should reflect total checks
      const stats = service.getStatistics();
      expect(stats.totalChecks).toBe(3);
    });

    test('should track successful and failed checks', async () => {
      // Given: Mix of successful and failed checks
      mockedAxios.get
        .mockResolvedValueOnce({ status: 200, data: { status: 'healthy' } })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ status: 503, data: { status: 'unhealthy' } });

      service.start();
      await Promise.resolve();

      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      // Then: Statistics should track successes and failures
      const stats = service.getStatistics();
      expect(stats.totalChecks).toBe(3);
      expect(stats.successfulChecks).toBe(2); // 200 and 503 both received responses
      expect(stats.failedChecks).toBe(1); // Network error
    });

    test('should track last check time', async () => {
      // Given: Health check is performed
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: { status: 'healthy' },
      });

      const beforeStart = new Date();

      // When: Service starts
      service.start();
      await Promise.resolve();

      // Then: Last check time should be recorded
      const stats = service.getStatistics();
      expect(stats.lastCheckTime).toBeInstanceOf(Date);
      expect(stats.lastCheckTime!.getTime()).toBeGreaterThanOrEqual(beforeStart.getTime());
    });

    test('should track consecutive failures', async () => {
      // Given: Multiple consecutive failures
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      service.start();
      await Promise.resolve();

      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      // Then: Should track consecutive failures
      const stats = service.getStatistics();
      expect(stats.consecutiveFailures).toBe(3);
    });

    test('should reset consecutive failures on success', async () => {
      // Given: Failures followed by success
      mockedAxios.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({ status: 200, data: { status: 'healthy' } });

      service.start();
      await Promise.resolve();

      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      // Then: Consecutive failures should reset to 0
      const stats = service.getStatistics();
      expect(stats.consecutiveFailures).toBe(0);
    });
  });

  describe('Service Control', () => {
    test('should start and stop health checks', () => {
      // Given: Service is created
      expect(service.isRunning()).toBe(false);

      // When: Service is started
      service.start();

      // Then: Service should be running
      expect(service.isRunning()).toBe(true);

      // When: Service is stopped
      service.stop();

      // Then: Service should not be running
      expect(service.isRunning()).toBe(false);
    });

    test('should not start if already running', () => {
      // Given: Service is already running
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: { status: 'healthy' },
      });

      service.start();
      const initialCallCount = mockedAxios.get.mock.calls.length;

      // When: Start is called again
      service.start();

      // Then: Should not create duplicate checks
      expect(mockedAxios.get.mock.calls.length).toBe(initialCallCount);
    });
  });
});
