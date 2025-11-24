/**
 * Voice Activity Detector
 * 音声アクティビティ検出サービス
 */

export interface VADConfig {
  sampleRate: number;
  channels: number;
  silenceThreshold: number; // dB (e.g., -40)
  silenceDuration: number; // seconds (e.g., 10)
  forceVoiceAfter: number; // seconds (e.g., 300 = 5 minutes)
}

export interface VADResult {
  isVoiceDetected: boolean;
  averageLevel: number; // dB
  silenceDuration: number; // seconds
}

export interface VADStatistics {
  totalAnalyzedDuration: number; // seconds
  voiceDuration: number; // seconds
  silenceDuration: number; // seconds
}

/**
 * Voice Activity Detector using audio level analysis
 * 音声レベル分析による音声アクティビティ検出
 */
export class VoiceActivityDetector {
  private config: VADConfig;
  private currentSilenceDuration: number = 0;
  private statistics: VADStatistics;

  constructor(config: VADConfig) {
    this.config = config;
    this.statistics = {
      totalAnalyzedDuration: 0,
      voiceDuration: 0,
      silenceDuration: 0,
    };
  }

  /**
   * Get configuration
   */
  public getConfig(): VADConfig {
    return { ...this.config };
  }

  /**
   * Analyze audio buffer and detect voice activity
   */
  public analyze(buffer: Buffer): VADResult {
    // Calculate audio level (RMS in dB)
    const averageLevel = this.calculateRMSLevel(buffer);

    // Calculate buffer duration (f32le = 4 bytes per sample)
    const bufferDuration = buffer.length / (this.config.sampleRate * this.config.channels * 4);

    // Update statistics
    this.statistics.totalAnalyzedDuration += bufferDuration;

    // Check if voice is detected
    let isVoiceDetected = averageLevel > this.config.silenceThreshold;

    if (isVoiceDetected) {
      // Voice detected - reset silence duration
      this.currentSilenceDuration = 0;
      this.statistics.voiceDuration += bufferDuration;
    } else {
      // Silence detected - accumulate duration
      this.currentSilenceDuration += bufferDuration;
      this.statistics.silenceDuration += bufferDuration;

      // Force voice detection after long silence (5 minutes)
      if (this.currentSilenceDuration >= this.config.forceVoiceAfter) {
        isVoiceDetected = true;
      }
    }

    return {
      isVoiceDetected,
      averageLevel,
      silenceDuration: this.currentSilenceDuration,
    };
  }

  /**
   * Calculate RMS (Root Mean Square) level in dB
   */
  private calculateRMSLevel(buffer: Buffer): number {
    // f32le = 4 bytes per sample (32-bit float)
    const numSamples = buffer.length / 4;

    if (numSamples === 0) {
      return -Infinity;
    }

    let sumSquares = 0;
    for (let i = 0; i < numSamples; i++) {
      // Read 32-bit float (little-endian)
      const sample = buffer.readFloatLE(i * 4);
      // sample is already normalized to [-1, 1] for f32le
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / numSamples);

    if (rms === 0) {
      return -Infinity;
    }

    // Convert to dB (20 * log10(rms))
    return 20 * Math.log10(rms);
  }

  /**
   * Get statistics
   */
  public getStatistics(): VADStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset internal state and statistics
   */
  public reset(): void {
    this.currentSilenceDuration = 0;
    this.statistics = {
      totalAnalyzedDuration: 0,
      voiceDuration: 0,
      silenceDuration: 0,
    };
  }
}
