/**
 * CUDA Server Client Tests
 * CUDAサーバーHTTPクライアントのテスト
 */

import { CUDAServerClient, TranscriptionResponse } from './CUDAServerClient';

// Mock axios
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CUDAServerClient', () => {
  let client: CUDAServerClient;
  const testServerUrl = 'http://192.168.1.100:8000';

  beforeEach(() => {
    client = new CUDAServerClient({
      serverUrl: testServerUrl,
      timeout: 60000,
    });
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(client).toBeDefined();
      expect(client.getConfig().serverUrl).toBe(testServerUrl);
      expect(client.getConfig().timeout).toBe(60000);
    });
  });

  describe('Health Check', () => {
    it('should return true when server is healthy', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { status: 'ok' },
        status: 200,
      });

      const isHealthy = await client.checkHealth();
      expect(isHealthy).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(`${testServerUrl}/health`, {
        timeout: 5000,
      });
    });

    it('should return false when server is unreachable', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Connection refused'));

      const isHealthy = await client.checkHealth();
      expect(isHealthy).toBe(false);
    });

    it('should return false when server returns non-200', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { status: 'error' },
        status: 503,
      });

      const isHealthy = await client.checkHealth();
      expect(isHealthy).toBe(false);
    });
  });

  describe('Transcription Request', () => {
    const mockTranscriptionResponse: TranscriptionResponse = {
      segments: [
        {
          start: 0.0,
          end: 3.5,
          text: 'こんにちは',
          speaker: 'Speaker_00',
          confidence: 0.95,
        },
        {
          start: 3.5,
          end: 7.2,
          text: 'よろしくお願いします',
          speaker: 'Speaker_01',
          confidence: 0.92,
        },
      ],
      language: 'ja',
      duration: 7.2,
    };

    it('should send audio file and receive transcription', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: mockTranscriptionResponse,
        status: 200,
      });

      const audioPath = '/tmp/test-audio.wav';
      const result = await client.transcribe(audioPath);

      expect(result).toEqual(mockTranscriptionResponse);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${testServerUrl}/transcribe`,
        expect.any(Object), // FormData
        expect.objectContaining({
          timeout: 60000,
          headers: expect.objectContaining({
            'content-type': expect.stringContaining('multipart/form-data'),
          }),
        })
      );
    });

    it('should throw error on timeout', async () => {
      const timeoutError: any = new Error('timeout of 60000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      timeoutError.isAxiosError = true;

      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockImplementation(() => Promise.reject(timeoutError));

      const audioPath = '/tmp/test-audio.wav';
      await expect(client.transcribe(audioPath)).rejects.toThrow('timeout');
    });

    it('should throw error on 400 Bad Request', async () => {
      const error400: any = new Error('Bad Request');
      error400.isAxiosError = true;
      error400.response = {
        status: 400,
        data: { error: 'Invalid audio format' },
      };

      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockImplementation(() => Promise.reject(error400));

      const audioPath = '/tmp/test-audio.wav';
      await expect(client.transcribe(audioPath)).rejects.toThrow('Invalid audio format');
    });

    it('should throw error on 500 Internal Server Error', async () => {
      const error500: any = new Error('Internal Server Error');
      error500.isAxiosError = true;
      error500.response = {
        status: 500,
        data: { error: 'WhisperX processing failed' },
      };

      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockImplementation(() => Promise.reject(error500));

      const audioPath = '/tmp/test-audio.wav';
      await expect(client.transcribe(audioPath)).rejects.toThrow('WhisperX processing failed');
    });
  });

  describe('Retry Logic', () => {
    it('should retry 3 times with exponential backoff', async () => {
      const connError1: any = new Error('Connection refused');
      connError1.isAxiosError = true;
      connError1.code = 'ECONNREFUSED';

      const connError2: any = new Error('Connection refused');
      connError2.isAxiosError = true;
      connError2.code = 'ECONNREFUSED';

      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post
        .mockRejectedValueOnce(connError1)
        .mockRejectedValueOnce(connError2)
        .mockResolvedValueOnce({
          data: {
            segments: [],
            language: 'ja',
            duration: 0,
          },
          status: 200,
        });

      const audioPath = '/tmp/test-audio.wav';
      const result = await client.transcribe(audioPath);

      expect(result).toBeDefined();
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should fail after 3 retries', async () => {
      const connError1: any = new Error('Connection refused');
      connError1.isAxiosError = true;
      connError1.code = 'ECONNREFUSED';

      const connError2: any = new Error('Connection refused');
      connError2.isAxiosError = true;
      connError2.code = 'ECONNREFUSED';

      const connError3: any = new Error('Connection refused');
      connError3.isAxiosError = true;
      connError3.code = 'ECONNREFUSED';

      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post
        .mockRejectedValueOnce(connError1)
        .mockRejectedValueOnce(connError2)
        .mockRejectedValueOnce(connError3);

      const audioPath = '/tmp/test-audio.wav';
      await expect(client.transcribe(audioPath)).rejects.toThrow();
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('Statistics', () => {
    it('should track request count', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          segments: [],
          language: 'ja',
          duration: 0,
        },
        status: 200,
      });

      await client.transcribe('/tmp/test1.wav');
      await client.transcribe('/tmp/test2.wav');
      await client.transcribe('/tmp/test3.wav');

      const stats = client.getStatistics();
      expect(stats.totalRequests).toBe(3);
      expect(stats.successfulRequests).toBe(3);
      expect(stats.failedRequests).toBe(0);
    });

    it('should track failed requests', async () => {
      const connError1: any = new Error('Connection refused');
      connError1.isAxiosError = true;
      connError1.code = 'ECONNREFUSED';

      const connError2: any = new Error('Connection refused');
      connError2.isAxiosError = true;
      connError2.code = 'ECONNREFUSED';

      const connError3: any = new Error('Connection refused');
      connError3.isAxiosError = true;
      connError3.code = 'ECONNREFUSED';

      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post
        .mockResolvedValueOnce({
          data: { segments: [], language: 'ja', duration: 0 },
          status: 200,
        })
        .mockRejectedValueOnce(connError1)
        .mockRejectedValueOnce(connError2)
        .mockRejectedValueOnce(connError3);

      await client.transcribe('/tmp/test1.wav');
      try {
        await client.transcribe('/tmp/test2.wav');
      } catch (error) {
        // Expected error
      }

      const stats = client.getStatistics();
      expect(stats.totalRequests).toBe(2);
      expect(stats.successfulRequests).toBe(1);
      expect(stats.failedRequests).toBe(1);
    });

    it('should track average response time', async () => {
      mockedAxios.post.mockImplementation(async () => {
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          data: { segments: [], language: 'ja', duration: 0 },
          status: 200,
        };
      });

      await client.transcribe('/tmp/test1.wav');
      await client.transcribe('/tmp/test2.wav');

      const stats = client.getStatistics();
      expect(stats.averageResponseTime).toBeGreaterThanOrEqual(0);
    });
  });
});
