/**
 * Transcription Processor Tests
 * 音声処理とCUDA連携を統合するプロセッサーのテスト
 */

import { TranscriptionProcessor } from './TranscriptionProcessor';
import { BufferManager } from './BufferManager';
import { CUDAServerClient } from './CUDAServerClient';

// Mock dependencies
jest.mock('./BufferManager');
jest.mock('./CUDAServerClient');

describe('TranscriptionProcessor', () => {
  let processor: TranscriptionProcessor;
  let mockBufferManager: jest.Mocked<BufferManager>;
  let mockCUDAClient: jest.Mocked<CUDAServerClient>;

  beforeEach(() => {
    // Create mocked instances
    mockBufferManager = new BufferManager({
      bufferDuration: 30,
      sampleRate: 16000,
      channels: 1,
      format: 's16le',
      tempDir: '/tmp/test-buffers',
      enableVAD: true,
    }) as jest.Mocked<BufferManager>;

    mockCUDAClient = new CUDAServerClient({
      serverUrl: 'http://localhost:8000',
      timeout: 60000,
    }) as jest.Mocked<CUDAServerClient>;

    processor = new TranscriptionProcessor(mockBufferManager, mockCUDAClient);
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(processor).toBeDefined();
    });

    it('should have zero consecutive failures initially', () => {
      const stats = processor.getStatistics();
      expect(stats.consecutiveFailures).toBe(0);
    });
  });

  describe('Process Buffer with VAD', () => {
    it('should skip transcription when no voice detected', async () => {
      const audioChunk = Buffer.alloc(16000 * 2 * 30); // 30 seconds of silence

      // Mock buffer manager
      mockBufferManager.addChunk.mockReturnValue(true); // Buffer is full
      mockBufferManager.flush.mockResolvedValue(null); // VAD detected silence
      mockBufferManager.getStatistics.mockReturnValue({
        totalBytesProcessed: audioChunk.length,
        flushCount: 0,
        bufferFillPercentage: 0,
        skippedBuffers: 1,
      });

      // Add chunk and process
      const isFull = mockBufferManager.addChunk(audioChunk);
      expect(isFull).toBe(true);

      const result = await processor.processBuffer();

      expect(result).toBeNull(); // No transcription result
      expect(mockBufferManager.flush).toHaveBeenCalled();
      expect(mockCUDAClient.transcribe).not.toHaveBeenCalled();
    });

    it('should send transcription request when voice detected', async () => {
      const audioChunk = Buffer.alloc(16000 * 2 * 30); // 30 seconds of audio

      // Mock buffer manager
      mockBufferManager.addChunk.mockReturnValue(true); // Buffer is full
      mockBufferManager.flush.mockResolvedValue('/tmp/test-buffers/12-34-56-789.wav');
      mockBufferManager.deleteFile.mockResolvedValue(undefined);

      // Mock CUDA client
      mockCUDAClient.transcribe.mockResolvedValue({
        segments: [
          {
            start: 0.0,
            end: 5.0,
            text: 'こんにちは',
            speaker: 'Speaker_00',
            confidence: 0.95,
          },
        ],
        language: 'ja',
        duration: 5.0,
      });

      // Add chunk and process
      mockBufferManager.addChunk(audioChunk);
      const result = await processor.processBuffer();

      expect(result).toBeDefined();
      expect(result?.segments).toHaveLength(1);
      if (result && result.segments[0]) {
        expect(result.segments[0].text).toBe('こんにちは');
      }
      expect(mockBufferManager.flush).toHaveBeenCalled();
      expect(mockCUDAClient.transcribe).toHaveBeenCalledWith(
        '/tmp/test-buffers/12-34-56-789.wav'
      );
      expect(mockBufferManager.deleteFile).toHaveBeenCalledWith(
        '/tmp/test-buffers/12-34-56-789.wav'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle server timeout and skip buffer', async () => {
      const audioChunk = Buffer.alloc(16000 * 2 * 30);

      // Mock buffer manager
      mockBufferManager.addChunk.mockReturnValue(true);
      mockBufferManager.flush.mockResolvedValue('/tmp/test-buffers/12-34-56-789.wav');
      mockBufferManager.deleteFile.mockResolvedValue(undefined);

      // Mock CUDA client timeout
      mockCUDAClient.transcribe.mockRejectedValue(new Error('Request timeout after 60000ms'));

      mockBufferManager.addChunk(audioChunk);
      const result = await processor.processBuffer();

      expect(result).toBeNull(); // Timeout results in null
      expect(mockBufferManager.deleteFile).toHaveBeenCalledWith(
        '/tmp/test-buffers/12-34-56-789.wav'
      );

      const stats = processor.getStatistics();
      expect(stats.consecutiveFailures).toBe(1);
    });

    it('should track consecutive failures', async () => {
      const audioChunk = Buffer.alloc(16000 * 2 * 30);

      mockBufferManager.addChunk.mockReturnValue(true);
      mockBufferManager.flush.mockResolvedValue('/tmp/test-buffers/12-34-56-789.wav');
      mockBufferManager.deleteFile.mockResolvedValue(undefined);
      mockCUDAClient.transcribe.mockRejectedValue(new Error('Connection failed'));

      // First failure
      mockBufferManager.addChunk(audioChunk);
      await processor.processBuffer();
      expect(processor.getStatistics().consecutiveFailures).toBe(1);

      // Second failure
      mockBufferManager.addChunk(audioChunk);
      await processor.processBuffer();
      expect(processor.getStatistics().consecutiveFailures).toBe(2);

      // Third failure
      mockBufferManager.addChunk(audioChunk);
      await processor.processBuffer();
      expect(processor.getStatistics().consecutiveFailures).toBe(3);
    });

    it('should send alert after 3 consecutive failures', async () => {
      const audioChunk = Buffer.alloc(16000 * 2 * 30);
      const alertCallback = jest.fn();

      processor.setAlertCallback(alertCallback);

      mockBufferManager.addChunk.mockReturnValue(true);
      mockBufferManager.flush.mockResolvedValue('/tmp/test-buffers/12-34-56-789.wav');
      mockBufferManager.deleteFile.mockResolvedValue(undefined);
      mockCUDAClient.transcribe.mockRejectedValue(new Error('Connection failed'));

      // Three consecutive failures
      for (let i = 0; i < 3; i++) {
        mockBufferManager.addChunk(audioChunk);
        await processor.processBuffer();
      }

      expect(alertCallback).toHaveBeenCalledTimes(1);
      expect(alertCallback).toHaveBeenCalledWith({
        message: '3 consecutive transcription failures detected',
        consecutiveFailures: 3,
        lastError: 'Connection failed',
      });
    });

    it('should reset consecutive failures on success', async () => {
      const audioChunk = Buffer.alloc(16000 * 2 * 30);

      mockBufferManager.addChunk.mockReturnValue(true);
      mockBufferManager.flush.mockResolvedValue('/tmp/test-buffers/12-34-56-789.wav');
      mockBufferManager.deleteFile.mockResolvedValue(undefined);

      // First failure
      mockCUDAClient.transcribe.mockRejectedValueOnce(new Error('Connection failed'));
      mockBufferManager.addChunk(audioChunk);
      await processor.processBuffer();
      expect(processor.getStatistics().consecutiveFailures).toBe(1);

      // Success
      mockCUDAClient.transcribe.mockResolvedValueOnce({
        segments: [],
        language: 'ja',
        duration: 0,
      });
      mockBufferManager.addChunk(audioChunk);
      await processor.processBuffer();
      expect(processor.getStatistics().consecutiveFailures).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should track total processed buffers', async () => {
      const audioChunk = Buffer.alloc(16000 * 2 * 30);

      mockBufferManager.addChunk.mockReturnValue(true);
      mockBufferManager.flush.mockResolvedValue('/tmp/test-buffers/12-34-56-789.wav');
      mockBufferManager.deleteFile.mockResolvedValue(undefined);
      mockCUDAClient.transcribe.mockResolvedValue({
        segments: [],
        language: 'ja',
        duration: 0,
      });

      // Process 3 buffers
      for (let i = 0; i < 3; i++) {
        mockBufferManager.addChunk(audioChunk);
        await processor.processBuffer();
      }

      const stats = processor.getStatistics();
      expect(stats.totalProcessed).toBe(3);
      expect(stats.totalSkipped).toBe(0);
      expect(stats.totalFailed).toBe(0);
    });

    it('should track skipped buffers', async () => {
      const audioChunk = Buffer.alloc(16000 * 2 * 30);

      mockBufferManager.addChunk.mockReturnValue(true);
      mockBufferManager.flush.mockResolvedValue(null); // VAD detected silence

      // Process 3 silent buffers
      for (let i = 0; i < 3; i++) {
        mockBufferManager.addChunk(audioChunk);
        await processor.processBuffer();
      }

      const stats = processor.getStatistics();
      expect(stats.totalProcessed).toBe(3);
      expect(stats.totalSkipped).toBe(3);
    });

    it('should track failed requests', async () => {
      const audioChunk = Buffer.alloc(16000 * 2 * 30);

      mockBufferManager.addChunk.mockReturnValue(true);
      mockBufferManager.flush.mockResolvedValue('/tmp/test-buffers/12-34-56-789.wav');
      mockBufferManager.deleteFile.mockResolvedValue(undefined);
      mockCUDAClient.transcribe.mockRejectedValue(new Error('Connection failed'));

      // Process 2 failing buffers
      for (let i = 0; i < 2; i++) {
        mockBufferManager.addChunk(audioChunk);
        await processor.processBuffer();
      }

      const stats = processor.getStatistics();
      expect(stats.totalProcessed).toBe(2);
      expect(stats.totalFailed).toBe(2);
    });
  });
});
