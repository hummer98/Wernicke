/**
 * Webhook Notifier Tests
 * Webhook通知機能のテスト
 */

import { WebhookNotifier, AlertType } from './WebhookNotifier';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhookNotifier', () => {
  let notifier: WebhookNotifier;
  const testWebhookUrl = 'https://hooks.slack.com/services/TEST/WEBHOOK/URL';

  beforeEach(() => {
    notifier = new WebhookNotifier({
      webhookUrl: testWebhookUrl,
      timeout: 5000,
    });
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(notifier).toBeDefined();
      const config = notifier.getConfig();
      expect(config.webhookUrl).toBe(testWebhookUrl);
      expect(config.timeout).toBe(5000);
    });

    it('should use default timeout if not provided', () => {
      const defaultNotifier = new WebhookNotifier({ webhookUrl: testWebhookUrl });
      const config = defaultNotifier.getConfig();
      expect(config.timeout).toBe(5000);
    });

    it('should allow empty webhook URL (disabled)', () => {
      const disabledNotifier = new WebhookNotifier({ webhookUrl: '' });
      const config = disabledNotifier.getConfig();
      expect(config.webhookUrl).toBe('');
    });
  });

  describe('Alert Sending', () => {
    it('should send memory alert', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      await notifier.sendAlert({
        type: AlertType.MEMORY_EXCEEDED,
        message: 'Memory usage exceeded 2GB',
        details: { currentMB: 3072, thresholdMB: 2048 },
        timestamp: new Date('2025-01-27T12:00:00.000Z'),
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        testWebhookUrl,
        expect.objectContaining({
          text: expect.stringContaining('Memory usage exceeded 2GB'),
        }),
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('should send CPU alert', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      await notifier.sendAlert({
        type: AlertType.CPU_SUSTAINED,
        message: 'CPU usage sustained above 50% for 5 minutes',
        details: { durationMinutes: 5, averagePercent: 75 },
        timestamp: new Date('2025-01-27T12:00:00.000Z'),
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should send transcription timeout alert', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      await notifier.sendAlert({
        type: AlertType.TRANSCRIPTION_TIMEOUT,
        message: 'No transcription for 5 minutes',
        details: { minutesSinceLastSuccess: 5 },
        timestamp: new Date('2025-01-27T12:00:00.000Z'),
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should send error threshold alert', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      await notifier.sendAlert({
        type: AlertType.ERROR_THRESHOLD_EXCEEDED,
        message: '11 errors in current hour',
        details: { currentCount: 11, threshold: 10 },
        timestamp: new Date('2025-01-27T12:00:00.000Z'),
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should format alert as Slack/Discord compatible JSON', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      await notifier.sendAlert({
        type: AlertType.MEMORY_EXCEEDED,
        message: 'Test alert',
        details: { test: 'value' },
        timestamp: new Date('2025-01-27T12:00:00.000Z'),
      });

      const payload = mockedAxios.post.mock.calls[0]?.[1];
      expect(payload).toHaveProperty('text');
      expect(payload).toHaveProperty('attachments');
    });
  });

  describe('Error Handling', () => {
    it('should handle send failure and log error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      await notifier.sendAlert({
        type: AlertType.MEMORY_EXCEEDED,
        message: 'Test alert',
        details: {},
        timestamp: new Date('2025-01-27T12:00:00.000Z'),
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WebhookNotifier] Failed to send alert'),
        expect.any(Error)
      );

      const stats = notifier.getStatistics();
      expect(stats.failedSends).toBe(1);

      consoleSpy.mockRestore();
    });

    it('should not send when webhook URL is empty', async () => {
      const disabledNotifier = new WebhookNotifier({ webhookUrl: '' });

      await disabledNotifier.sendAlert({
        type: AlertType.MEMORY_EXCEEDED,
        message: 'Test alert',
        details: {},
        timestamp: new Date('2025-01-27T12:00:00.000Z'),
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    it('should track successful sends', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      await notifier.sendAlert({
        type: AlertType.MEMORY_EXCEEDED,
        message: 'Test alert 1',
        details: {},
        timestamp: new Date('2025-01-27T12:00:00.000Z'),
      });

      await notifier.sendAlert({
        type: AlertType.CPU_SUSTAINED,
        message: 'Test alert 2',
        details: {},
        timestamp: new Date('2025-01-27T12:01:00.000Z'),
      });

      const stats = notifier.getStatistics();
      expect(stats.totalSends).toBe(2);
      expect(stats.successfulSends).toBe(2);
      expect(stats.failedSends).toBe(0);
    });

    it('should track failed sends', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      await notifier.sendAlert({
        type: AlertType.MEMORY_EXCEEDED,
        message: 'Test alert',
        details: {},
        timestamp: new Date('2025-01-27T12:00:00.000Z'),
      });

      const stats = notifier.getStatistics();
      expect(stats.totalSends).toBe(1);
      expect(stats.successfulSends).toBe(0);
      expect(stats.failedSends).toBe(1);

      consoleSpy.mockRestore();
    });

    it('should track alert types', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      await notifier.sendAlert({
        type: AlertType.MEMORY_EXCEEDED,
        message: 'Memory alert',
        details: {},
        timestamp: new Date('2025-01-27T12:00:00.000Z'),
      });

      await notifier.sendAlert({
        type: AlertType.MEMORY_EXCEEDED,
        message: 'Another memory alert',
        details: {},
        timestamp: new Date('2025-01-27T12:01:00.000Z'),
      });

      await notifier.sendAlert({
        type: AlertType.CPU_SUSTAINED,
        message: 'CPU alert',
        details: {},
        timestamp: new Date('2025-01-27T12:02:00.000Z'),
      });

      const stats = notifier.getStatistics();
      expect(stats.alertsByType.MEMORY_EXCEEDED).toBe(2);
      expect(stats.alertsByType.CPU_SUSTAINED).toBe(1);
    });
  });
});
