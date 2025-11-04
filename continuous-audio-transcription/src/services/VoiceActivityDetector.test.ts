/**
 * Voice Activity Detector Tests
 * 音声アクティビティ検出サービスのテスト
 */

import { VoiceActivityDetector, VADResult } from './VoiceActivityDetector';

describe('VoiceActivityDetector', () => {
  let vad: VoiceActivityDetector;

  beforeEach(() => {
    vad = new VoiceActivityDetector({
      sampleRate: 16000,
      channels: 1,
      silenceThreshold: -40, // dB
      silenceDuration: 10, // seconds
      forceVoiceAfter: 300, // 5 minutes
    });
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(vad).toBeDefined();
    });

    it('should have default thresholds', () => {
      const config = vad.getConfig();
      expect(config.silenceThreshold).toBe(-40);
      expect(config.silenceDuration).toBe(10);
      expect(config.forceVoiceAfter).toBe(300);
    });
  });

  describe('Audio Level Calculation', () => {
    it('should calculate RMS level for audio buffer', () => {
      // Generate sine wave (440Hz at -20dB)
      const buffer = generateSineWave(16000, 440, 1.0, 0.1); // 1 second, amplitude 0.1
      const result = vad.analyze(buffer);

      expect(result.averageLevel).toBeLessThan(0); // Should be negative dB
      expect(result.averageLevel).toBeGreaterThan(-100); // Should not be silence
    });

    it('should detect silence for very quiet audio', () => {
      // Generate very quiet noise
      const buffer = generateSineWave(16000, 440, 1.0, 0.001); // amplitude 0.001
      const result = vad.analyze(buffer);

      expect(result.averageLevel).toBeLessThan(-40); // Below threshold
    });

    it('should detect voice for normal audio levels', () => {
      // Generate normal speech level (-20dB to -10dB)
      const buffer = generateSineWave(16000, 440, 1.0, 0.3); // amplitude 0.3
      const result = vad.analyze(buffer);

      expect(result.averageLevel).toBeGreaterThan(-40); // Above threshold
    });

    it('should handle zero amplitude (complete silence)', () => {
      const buffer = Buffer.alloc(16000 * 2); // 1 second of silence
      const result = vad.analyze(buffer);

      expect(result.averageLevel).toBe(-Infinity); // Log of 0 is -Infinity
      expect(result.isVoiceDetected).toBe(false);
    });
  });

  describe('Voice Activity Detection', () => {
    it('should detect voice when level is above threshold', () => {
      const buffer = generateSineWave(16000, 440, 1.0, 0.3);
      const result = vad.analyze(buffer);

      expect(result.isVoiceDetected).toBe(true);
      expect(result.silenceDuration).toBe(0);
    });

    it('should detect silence when level is below threshold', () => {
      const buffer = generateSineWave(16000, 440, 1.0, 0.001);
      const result = vad.analyze(buffer);

      expect(result.isVoiceDetected).toBe(false);
    });

    it('should accumulate silence duration across multiple calls', () => {
      const silentBuffer = generateSineWave(16000, 440, 1.0, 0.001);

      // Analyze 5 seconds of silence (5 x 1-second buffers)
      for (let i = 0; i < 5; i++) {
        const result = vad.analyze(silentBuffer);
        expect(result.isVoiceDetected).toBe(false);
      }

      const result = vad.analyze(silentBuffer);
      expect(result.silenceDuration).toBeGreaterThanOrEqual(5);
    });

    it('should reset silence duration when voice is detected', () => {
      const silentBuffer = generateSineWave(16000, 440, 1.0, 0.001);
      const voiceBuffer = generateSineWave(16000, 440, 1.0, 0.3);

      // Accumulate silence
      vad.analyze(silentBuffer);
      vad.analyze(silentBuffer);

      // Detect voice - should reset silence duration
      const voiceResult = vad.analyze(voiceBuffer);
      expect(voiceResult.isVoiceDetected).toBe(true);
      expect(voiceResult.silenceDuration).toBe(0);

      // Next silence should start from 0
      const nextSilence = vad.analyze(silentBuffer);
      expect(nextSilence.silenceDuration).toBeLessThan(2);
    });
  });

  describe('Force Voice Detection', () => {
    it('should force voice detection after 5 minutes of silence', () => {
      const silentBuffer = generateSineWave(16000, 440, 1.0, 0.001);

      // Simulate 5 minutes of silence (300 seconds / 1 second per buffer = 300 calls)
      let result: VADResult | undefined;
      for (let i = 0; i < 301; i++) {
        result = vad.analyze(silentBuffer);
      }

      // After 5 minutes, should force voice detection
      expect(result).toBeDefined();
      if (result !== undefined) {
        expect(result.isVoiceDetected).toBe(true);
        expect(result.silenceDuration).toBeGreaterThanOrEqual(300);
      }
    });

    it('should not force voice detection before 5 minutes', () => {
      const silentBuffer = generateSineWave(16000, 440, 1.0, 0.001);

      // Simulate 4 minutes of silence (240 seconds)
      let result: VADResult | undefined;
      for (let i = 0; i < 240; i++) {
        result = vad.analyze(silentBuffer);
      }

      expect(result).toBeDefined();
      if (result !== undefined) {
        expect(result.isVoiceDetected).toBe(false);
      }
    });
  });

  describe('Statistics', () => {
    it('should track total analyzed duration', () => {
      const buffer = generateSineWave(16000, 440, 1.0, 0.3);

      vad.analyze(buffer);
      vad.analyze(buffer);
      vad.analyze(buffer);

      const stats = vad.getStatistics();
      expect(stats.totalAnalyzedDuration).toBeGreaterThanOrEqual(3);
    });

    it('should track voice vs silence duration', () => {
      const voiceBuffer = generateSineWave(16000, 440, 1.0, 0.3);
      const silentBuffer = generateSineWave(16000, 440, 1.0, 0.001);

      vad.analyze(voiceBuffer);
      vad.analyze(voiceBuffer);
      vad.analyze(silentBuffer);

      const stats = vad.getStatistics();
      expect(stats.voiceDuration).toBeGreaterThan(stats.silenceDuration);
    });

    it('should reset statistics', () => {
      const buffer = generateSineWave(16000, 440, 1.0, 0.3);

      vad.analyze(buffer);
      vad.reset();

      const stats = vad.getStatistics();
      expect(stats.totalAnalyzedDuration).toBe(0);
      expect(stats.voiceDuration).toBe(0);
      expect(stats.silenceDuration).toBe(0);
    });
  });
});

/**
 * Generate sine wave audio buffer
 */
function generateSineWave(
  sampleRate: number,
  frequency: number,
  duration: number,
  amplitude: number
): Buffer {
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = Buffer.alloc(numSamples * 2); // 16-bit samples

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * amplitude;
    // Convert to 16-bit PCM
    const pcmValue = Math.floor(sample * 32767);
    buffer.writeInt16LE(pcmValue, i * 2);
  }

  return buffer;
}
