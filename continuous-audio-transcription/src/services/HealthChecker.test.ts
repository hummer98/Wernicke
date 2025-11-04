/**
 * Health Checker Tests
 * ヘルスチェックとアラートのテスト
 */

import { HealthChecker } from './HealthChecker';

describe('HealthChecker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker({
      transcriptionTimeoutMinutes: 5,
      errorThresholdPerHour: 10,
    });
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(checker).toBeDefined();
      const config = checker.getConfig();
      expect(config.transcriptionTimeoutMinutes).toBe(5);
      expect(config.errorThresholdPerHour).toBe(10);
    });

    it('should use default values if not provided', () => {
      const defaultChecker = new HealthChecker({});
      const config = defaultChecker.getConfig();
      expect(config.transcriptionTimeoutMinutes).toBe(5);
      expect(config.errorThresholdPerHour).toBe(10);
    });
  });

  describe('Last Transcription Time Tracking', () => {
    it('should update last transcription time', () => {
      const now = new Date('2025-01-27T12:00:00.000Z');
      checker.recordTranscriptionSuccess(now);

      const lastTime = checker.getLastTranscriptionTime();
      expect(lastTime).toEqual(now);
    });

    it('should detect timeout when no recent transcription', () => {
      const initialTime = new Date('2025-01-27T12:00:00.000Z');
      const checkTime = new Date('2025-01-27T12:06:00.000Z'); // 6 minutes later

      checker.recordTranscriptionSuccess(initialTime);
      const result = checker.checkTranscriptionTimeout(checkTime);

      expect(result.timedOut).toBe(true);
      expect(result.minutesSinceLastSuccess).toBe(6);
    });

    it('should not detect timeout when transcription is recent', () => {
      const initialTime = new Date('2025-01-27T12:00:00.000Z');
      const checkTime = new Date('2025-01-27T12:03:00.000Z'); // 3 minutes later

      checker.recordTranscriptionSuccess(initialTime);
      const result = checker.checkTranscriptionTimeout(checkTime);

      expect(result.timedOut).toBe(false);
      expect(result.minutesSinceLastSuccess).toBe(3);
    });

    it('should detect timeout when no transcription has occurred', () => {
      const checkTime = new Date('2025-01-27T12:00:00.000Z');

      const result = checker.checkTranscriptionTimeout(checkTime);

      expect(result.timedOut).toBe(true);
      expect(result.minutesSinceLastSuccess).toBe(Infinity);
    });
  });

  describe('Error Count Tracking', () => {
    it('should increment error count', () => {
      checker.recordError('Connection failed');
      checker.recordError('Timeout');

      const stats = checker.getStatistics();
      expect(stats.totalErrors).toBe(2);
      expect(stats.currentHourErrors).toBe(2);
    });

    it('should detect threshold exceeded', () => {
      // Record 11 errors (threshold is 10)
      for (let i = 0; i < 11; i++) {
        checker.recordError(`Error ${i}`);
      }

      const result = checker.checkErrorThreshold();
      expect(result.exceeded).toBe(true);
      expect(result.currentCount).toBe(11);
      expect(result.threshold).toBe(10);
    });

    it('should not detect threshold when errors are below limit', () => {
      // Record 9 errors (threshold is 10)
      for (let i = 0; i < 9; i++) {
        checker.recordError(`Error ${i}`);
      }

      const result = checker.checkErrorThreshold();
      expect(result.exceeded).toBe(false);
      expect(result.currentCount).toBe(9);
    });

    it('should reset error count', () => {
      checker.recordError('Error 1');
      checker.recordError('Error 2');

      checker.resetHourlyErrorCount();

      const stats = checker.getStatistics();
      expect(stats.currentHourErrors).toBe(0);
      expect(stats.totalErrors).toBe(2); // Total should not be reset
    });
  });

  describe('Alert Tracking', () => {
    it('should track transcription timeout alerts', () => {
      const initialTime = new Date('2025-01-27T12:00:00.000Z');
      const checkTime = new Date('2025-01-27T12:06:00.000Z');

      checker.recordTranscriptionSuccess(initialTime);
      checker.checkTranscriptionTimeout(checkTime);

      const stats = checker.getStatistics();
      expect(stats.transcriptionTimeoutAlerts).toBe(1);
    });

    it('should track error threshold alerts', () => {
      for (let i = 0; i < 11; i++) {
        checker.recordError(`Error ${i}`);
      }

      checker.checkErrorThreshold();

      const stats = checker.getStatistics();
      expect(stats.errorThresholdAlerts).toBe(1);
    });

    it('should only alert once per hour for error threshold', () => {
      for (let i = 0; i < 15; i++) {
        checker.recordError(`Error ${i}`);
      }

      checker.checkErrorThreshold();
      checker.checkErrorThreshold();
      checker.checkErrorThreshold();

      const stats = checker.getStatistics();
      // Should only alert once even after multiple checks
      expect(stats.errorThresholdAlerts).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should track all statistics', () => {
      const initialTime = new Date('2025-01-27T12:00:00.000Z');
      const checkTime = new Date('2025-01-27T12:06:00.000Z');

      // Record some activity
      checker.recordTranscriptionSuccess(initialTime);
      checker.checkTranscriptionTimeout(checkTime);

      for (let i = 0; i < 11; i++) {
        checker.recordError(`Error ${i}`);
      }
      checker.checkErrorThreshold();

      const stats = checker.getStatistics();
      expect(stats.totalErrors).toBe(11);
      expect(stats.currentHourErrors).toBe(11);
      expect(stats.transcriptionTimeoutAlerts).toBe(1);
      expect(stats.errorThresholdAlerts).toBe(1);
    });
  });
});
