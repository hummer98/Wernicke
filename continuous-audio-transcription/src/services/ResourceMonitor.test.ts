/**
 * Resource Monitor Tests
 * システムリソース監視のテスト
 */

import { ResourceMonitor } from './ResourceMonitor';
import * as os from 'os';

// Mock os module
jest.mock('os');
const mockedOs = os as jest.Mocked<typeof os>;

describe('ResourceMonitor', () => {
  let monitor: ResourceMonitor;

  beforeEach(() => {
    monitor = new ResourceMonitor({
      memoryThresholdMB: 2048, // 2GB
      cpuThresholdPercent: 50,
      cpuCheckDurationMinutes: 5,
      checkIntervalMs: 60000, // 1 minute
    });
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(monitor).toBeDefined();
      const config = monitor.getConfig();
      expect(config.memoryThresholdMB).toBe(2048);
      expect(config.cpuThresholdPercent).toBe(50);
      expect(config.cpuCheckDurationMinutes).toBe(5);
      expect(config.checkIntervalMs).toBe(60000);
    });

    it('should use default values if not provided', () => {
      const defaultMonitor = new ResourceMonitor({});
      const config = defaultMonitor.getConfig();
      expect(config.memoryThresholdMB).toBe(2048);
      expect(config.cpuThresholdPercent).toBe(50);
      expect(config.cpuCheckDurationMinutes).toBe(5);
      expect(config.checkIntervalMs).toBe(60000);
    });
  });

  describe('Memory Monitoring', () => {
    it('should get current memory usage', () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        rss: 1024 * 1024 * 1024, // 1GB
        heapTotal: 512 * 1024 * 1024,
        heapUsed: 256 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      })) as any;

      const usage = monitor.getMemoryUsage();
      expect(usage.rss).toBe(1024); // 1024 MB
      expect(usage.heapTotal).toBe(512);
      expect(usage.heapUsed).toBe(256);

      process.memoryUsage = originalMemoryUsage;
    });

    it('should detect memory threshold exceeded', () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        rss: 3 * 1024 * 1024 * 1024, // 3GB (exceeds 2GB threshold)
        heapTotal: 2 * 1024 * 1024 * 1024,
        heapUsed: 1.5 * 1024 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      })) as any;

      const result = monitor.checkMemory();
      expect(result.exceeded).toBe(true);
      expect(result.currentMB).toBe(3072); // 3GB in MB
      expect(result.thresholdMB).toBe(2048);

      process.memoryUsage = originalMemoryUsage;
    });

    it('should not detect threshold when memory is below limit', () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        rss: 1024 * 1024 * 1024, // 1GB (below 2GB threshold)
        heapTotal: 512 * 1024 * 1024,
        heapUsed: 256 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      })) as any;

      const result = monitor.checkMemory();
      expect(result.exceeded).toBe(false);
      expect(result.currentMB).toBe(1024);

      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('CPU Monitoring', () => {
    it('should calculate CPU usage', () => {
      // Mock os.cpus()
      mockedOs.cpus.mockReturnValue([
        {
          model: 'Intel Core i7',
          speed: 2400,
          times: { user: 100000, nice: 0, sys: 50000, idle: 850000, irq: 0 },
        },
        {
          model: 'Intel Core i7',
          speed: 2400,
          times: { user: 120000, nice: 0, sys: 60000, idle: 820000, irq: 0 },
        },
      ] as os.CpuInfo[]);

      const usage = monitor.getCPUUsage();
      expect(usage).toBeGreaterThanOrEqual(0);
      expect(usage).toBeLessThanOrEqual(100);
    });

    it('should detect sustained high CPU usage', () => {
      // Simulate 5 consecutive checks with high CPU
      mockedOs.cpus.mockReturnValue([
        {
          model: 'Intel Core i7',
          speed: 2400,
          times: { user: 700000, nice: 0, sys: 300000, idle: 0, irq: 0 }, // 100% usage
        },
      ] as os.CpuInfo[]);

      // Record 5 samples (one per minute)
      for (let i = 0; i < 5; i++) {
        monitor.recordCPUSample();
      }

      const result = monitor.checkCPU();
      expect(result.sustained).toBe(true);
      expect(result.durationMinutes).toBe(5);
    });

    it('should not detect sustained high CPU if duration is too short', () => {
      mockedOs.cpus.mockReturnValue([
        {
          model: 'Intel Core i7',
          speed: 2400,
          times: { user: 700000, nice: 0, sys: 300000, idle: 0, irq: 0 },
        },
      ] as os.CpuInfo[]);

      // Record only 3 samples (3 minutes)
      for (let i = 0; i < 3; i++) {
        monitor.recordCPUSample();
      }

      const result = monitor.checkCPU();
      expect(result.sustained).toBe(false);
    });

    it('should reset CPU history when CPU usage drops', () => {
      // First, simulate high CPU
      mockedOs.cpus.mockReturnValue([
        {
          model: 'Intel Core i7',
          speed: 2400,
          times: { user: 700000, nice: 0, sys: 300000, idle: 0, irq: 0 },
        },
      ] as os.CpuInfo[]);

      for (let i = 0; i < 3; i++) {
        monitor.recordCPUSample();
      }

      // Then, simulate low CPU
      mockedOs.cpus.mockReturnValue([
        {
          model: 'Intel Core i7',
          speed: 2400,
          times: { user: 100000, nice: 0, sys: 50000, idle: 850000, irq: 0 },
        },
      ] as os.CpuInfo[]);

      monitor.recordCPUSample();

      const result = monitor.checkCPU();
      expect(result.sustained).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should track total checks', () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        rss: 1024 * 1024 * 1024,
        heapTotal: 512 * 1024 * 1024,
        heapUsed: 256 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      })) as any;

      mockedOs.cpus.mockReturnValue([
        {
          model: 'Intel Core i7',
          speed: 2400,
          times: { user: 100000, nice: 0, sys: 50000, idle: 850000, irq: 0 },
        },
      ] as os.CpuInfo[]);

      monitor.checkMemory();
      monitor.recordCPUSample();
      monitor.checkMemory();
      monitor.recordCPUSample();

      const stats = monitor.getStatistics();
      expect(stats.totalMemoryChecks).toBe(2);
      expect(stats.totalCPUChecks).toBe(2);

      process.memoryUsage = originalMemoryUsage;
    });

    it('should track memory alerts', () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        rss: 3 * 1024 * 1024 * 1024, // 3GB
        heapTotal: 2 * 1024 * 1024 * 1024,
        heapUsed: 1.5 * 1024 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      })) as any;

      monitor.checkMemory();
      monitor.checkMemory();

      const stats = monitor.getStatistics();
      expect(stats.memoryAlerts).toBe(2);

      process.memoryUsage = originalMemoryUsage;
    });

    it('should track CPU alerts', () => {
      mockedOs.cpus.mockReturnValue([
        {
          model: 'Intel Core i7',
          speed: 2400,
          times: { user: 700000, nice: 0, sys: 300000, idle: 0, irq: 0 },
        },
      ] as os.CpuInfo[]);

      for (let i = 0; i < 5; i++) {
        monitor.recordCPUSample();
      }

      monitor.checkCPU();

      const stats = monitor.getStatistics();
      expect(stats.cpuAlerts).toBe(1);
    });
  });
});
