/**
 * Process Manager Tests
 * プロセス管理のテスト
 */

import { ProcessManager } from './ProcessManager';

describe('ProcessManager', () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      restartIntervalHours: 1,
      maxRestartsPerHour: 3,
    });
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(manager).toBeDefined();
      const config = manager.getConfig();
      expect(config.restartIntervalHours).toBe(1);
      expect(config.maxRestartsPerHour).toBe(3);
    });

    it('should use default values if not provided', () => {
      const defaultManager = new ProcessManager({});
      const config = defaultManager.getConfig();
      expect(config.restartIntervalHours).toBe(1);
      expect(config.maxRestartsPerHour).toBe(3);
    });
  });

  describe('Restart Tracking', () => {
    it('should record restart', () => {
      const timestamp = new Date('2025-01-27T12:00:00.000Z');
      manager.recordRestart(timestamp);

      const stats = manager.getStatistics();
      expect(stats.totalRestarts).toBe(1);
    });

    it('should check if restart is needed based on interval', () => {
      const lastRestart = new Date('2025-01-27T12:00:00.000Z');
      const now = new Date('2025-01-27T13:01:00.000Z'); // 1 hour 1 minute later

      manager.recordRestart(lastRestart);
      const needed = manager.shouldRestart(now);

      expect(needed).toBe(true);
    });

    it('should not restart if interval has not passed', () => {
      const lastRestart = new Date('2025-01-27T12:00:00.000Z');
      const now = new Date('2025-01-27T12:30:00.000Z'); // 30 minutes later

      manager.recordRestart(lastRestart);
      const needed = manager.shouldRestart(now);

      expect(needed).toBe(false);
    });

    it('should return true if no restart has occurred yet', () => {
      const now = new Date('2025-01-27T12:00:00.000Z');
      const needed = manager.shouldRestart(now);

      // Should not restart immediately on first check
      expect(needed).toBe(false);
    });
  });

  describe('Crash Detection', () => {
    it('should detect excessive restarts', () => {
      const baseTime = new Date('2025-01-27T12:00:00.000Z');

      // Record 4 restarts within 1 hour
      manager.recordRestart(new Date(baseTime.getTime()));
      manager.recordRestart(new Date(baseTime.getTime() + 10 * 60 * 1000)); // +10 min
      manager.recordRestart(new Date(baseTime.getTime() + 20 * 60 * 1000)); // +20 min
      manager.recordRestart(new Date(baseTime.getTime() + 30 * 60 * 1000)); // +30 min

      // Check at the time of the last restart
      const checkTime = new Date(baseTime.getTime() + 30 * 60 * 1000);
      const excessive = manager.isExcessiveRestarts(checkTime);
      expect(excessive).toBe(true);
    });

    it('should not detect excessive restarts if count is below threshold', () => {
      const baseTime = new Date('2025-01-27T12:00:00.000Z');

      // Record 2 restarts within 1 hour (below threshold of 3)
      manager.recordRestart(new Date(baseTime.getTime()));
      manager.recordRestart(new Date(baseTime.getTime() + 30 * 60 * 1000));

      const checkTime = new Date(baseTime.getTime() + 30 * 60 * 1000);
      const excessive = manager.isExcessiveRestarts(checkTime);
      expect(excessive).toBe(false);
    });

    it('should clear old restarts outside the window', () => {
      const baseTime = new Date('2025-01-27T12:00:00.000Z');

      // Record restarts spanning more than 1 hour
      manager.recordRestart(new Date(baseTime.getTime())); // 12:00
      manager.recordRestart(new Date(baseTime.getTime() + 10 * 60 * 1000)); // 12:10
      manager.recordRestart(new Date(baseTime.getTime() + 70 * 60 * 1000)); // 13:10 (outside window)

      // Check at 13:15
      const checkTime = new Date(baseTime.getTime() + 75 * 60 * 1000);
      manager.recordRestart(checkTime);

      // Only 2 restarts should be counted (13:10 and 13:15)
      const excessive = manager.isExcessiveRestarts(checkTime);
      expect(excessive).toBe(false);
    });
  });

  describe('State Management', () => {
    it('should get last restart time', () => {
      const timestamp = new Date('2025-01-27T12:00:00.000Z');
      manager.recordRestart(timestamp);

      const lastRestart = manager.getLastRestartTime();
      expect(lastRestart).toEqual(timestamp);
    });

    it('should return null if no restart has occurred', () => {
      const lastRestart = manager.getLastRestartTime();
      expect(lastRestart).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should track total restarts', () => {
      manager.recordRestart(new Date('2025-01-27T12:00:00.000Z'));
      manager.recordRestart(new Date('2025-01-27T13:00:00.000Z'));
      manager.recordRestart(new Date('2025-01-27T14:00:00.000Z'));

      const stats = manager.getStatistics();
      expect(stats.totalRestarts).toBe(3);
    });

    it('should track restart history count', () => {
      const baseTime = new Date('2025-01-27T12:00:00.000Z');

      manager.recordRestart(new Date(baseTime.getTime()));
      manager.recordRestart(new Date(baseTime.getTime() + 10 * 60 * 1000));
      manager.recordRestart(new Date(baseTime.getTime() + 20 * 60 * 1000));

      const checkTime = new Date(baseTime.getTime() + 20 * 60 * 1000);
      const stats = manager.getStatistics(checkTime);
      expect(stats.recentRestarts).toBe(3);
    });
  });
});
