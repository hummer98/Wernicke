/**
 * Webhook Notifier
 * Webhook通知機能
 */

import axios from 'axios';

export enum AlertType {
  MEMORY_EXCEEDED = 'MEMORY_EXCEEDED',
  CPU_SUSTAINED = 'CPU_SUSTAINED',
  TRANSCRIPTION_TIMEOUT = 'TRANSCRIPTION_TIMEOUT',
  ERROR_THRESHOLD_EXCEEDED = 'ERROR_THRESHOLD_EXCEEDED',
}

export interface WebhookNotifierConfig {
  webhookUrl: string; // Webhook URL (empty = disabled)
  timeout?: number; // Request timeout in milliseconds (default: 5000)
}

export interface Alert {
  type: AlertType;
  message: string;
  details: Record<string, any>;
  timestamp: Date;
}

export interface WebhookNotifierStatistics {
  totalSends: number;
  successfulSends: number;
  failedSends: number;
  alertsByType: Record<AlertType, number>;
}

/**
 * Webhook Notifier
 * Slack/Discord形式のWebhook通知を送信
 */
export class WebhookNotifier {
  private config: Required<WebhookNotifierConfig>;
  private statistics: WebhookNotifierStatistics;

  constructor(config: WebhookNotifierConfig) {
    this.config = {
      webhookUrl: config.webhookUrl,
      timeout: config.timeout ?? 5000,
    };
    this.statistics = {
      totalSends: 0,
      successfulSends: 0,
      failedSends: 0,
      alertsByType: {
        [AlertType.MEMORY_EXCEEDED]: 0,
        [AlertType.CPU_SUSTAINED]: 0,
        [AlertType.TRANSCRIPTION_TIMEOUT]: 0,
        [AlertType.ERROR_THRESHOLD_EXCEEDED]: 0,
      },
    };
  }

  /**
   * Get configuration
   */
  public getConfig(): Required<WebhookNotifierConfig> {
    return { ...this.config };
  }

  /**
   * Format alert for Slack/Discord
   */
  private formatAlert(alert: Alert): any {
    // Get color based on alert type
    const colors: Record<AlertType, string> = {
      [AlertType.MEMORY_EXCEEDED]: '#ff9900', // Orange
      [AlertType.CPU_SUSTAINED]: '#ff9900', // Orange
      [AlertType.TRANSCRIPTION_TIMEOUT]: '#ff0000', // Red
      [AlertType.ERROR_THRESHOLD_EXCEEDED]: '#ff0000', // Red
    };

    return {
      text: `[${alert.type}] ${alert.message}`,
      attachments: [
        {
          color: colors[alert.type],
          fields: [
            {
              title: 'Alert Type',
              value: alert.type,
              short: true,
            },
            {
              title: 'Timestamp',
              value: alert.timestamp.toISOString(),
              short: true,
            },
            {
              title: 'Details',
              value: JSON.stringify(alert.details, null, 2),
              short: false,
            },
          ],
        },
      ],
    };
  }

  /**
   * Send alert via webhook
   */
  public async sendAlert(alert: Alert): Promise<void> {
    // Skip if webhook URL is empty (disabled)
    if (!this.config.webhookUrl) {
      return;
    }

    this.statistics.totalSends++;
    this.statistics.alertsByType[alert.type]++;

    try {
      const payload = this.formatAlert(alert);
      await axios.post(this.config.webhookUrl, payload, {
        timeout: this.config.timeout,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      this.statistics.successfulSends++;
    } catch (error) {
      this.statistics.failedSends++;
      console.error('[WebhookNotifier] Failed to send alert:', error);
      // Do not retry - just log and continue
    }
  }

  /**
   * Get statistics
   */
  public getStatistics(): WebhookNotifierStatistics {
    return {
      ...this.statistics,
      alertsByType: { ...this.statistics.alertsByType },
    };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      totalSends: 0,
      successfulSends: 0,
      failedSends: 0,
      alertsByType: {
        [AlertType.MEMORY_EXCEEDED]: 0,
        [AlertType.CPU_SUSTAINED]: 0,
        [AlertType.TRANSCRIPTION_TIMEOUT]: 0,
        [AlertType.ERROR_THRESHOLD_EXCEEDED]: 0,
      },
    };
  }
}
