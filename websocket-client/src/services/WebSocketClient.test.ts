/**
 * WebSocket Client Tests
 * Task 9.1: WebSocket接続管理のテスト
 */

import { WebSocketClient } from './WebSocketClient';
import { ConnectionState, WebSocketConfig } from '../types/websocket';
import WS from 'ws';

// Mock ws library
jest.mock('ws');

describe('WebSocketClient - Task 9.1: Connection Management', () => {
  let client: WebSocketClient;
  let mockWebSocket: jest.Mocked<WS>;
  const testConfig: WebSocketConfig = {
    serverUrl: 'ws://localhost:8000/transcribe',
    maxReconnectAttempts: 10,
    reconnectBackoffBase: 1000,
    reconnectBackoffMax: 16000,
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock WebSocket instance
    mockWebSocket = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: WS.CONNECTING,
      removeAllListeners: jest.fn(),
    } as unknown as jest.Mocked<WS>;

    // Mock WebSocket constructor
    (WS as unknown as jest.Mock).mockImplementation(() => mockWebSocket);

    client = new WebSocketClient(testConfig);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('Constructor', () => {
    test('should initialize with DISCONNECTED state', () => {
      expect(client.getConnectionState()).toBe(ConnectionState.DISCONNECTED);
    });

    test('should store configuration', () => {
      const config = client.getConfig();
      expect(config.serverUrl).toBe(testConfig.serverUrl);
      expect(config.maxReconnectAttempts).toBe(10);
    });
  });

  describe('connect()', () => {
    test('should establish WebSocket connection', async () => {
      // Trigger connection
      const connectPromise = client.connect();

      // Simulate WebSocket open event
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      expect(openHandler).toBeDefined();
      openHandler();

      await connectPromise;

      expect(WS).toHaveBeenCalledWith(testConfig.serverUrl);
      expect(client.getConnectionState()).toBe(ConnectionState.CONNECTED);
    });

    test('should transition to CONNECTING state during connection', () => {
      client.connect();
      expect(client.getConnectionState()).toBe(ConnectionState.CONNECTING);
    });

    test('should emit connected event on successful connection', async () => {
      const connectedHandler = jest.fn();
      client.on('connected', connectedHandler);

      const connectPromise = client.connect();

      // Simulate open event
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();

      await connectPromise;

      expect(connectedHandler).toHaveBeenCalled();
    });

    test('should throw error if already connected', async () => {
      // First connection
      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();
      await connectPromise;

      // Second connection attempt should throw
      await expect(client.connect()).rejects.toThrow('Already connected or connecting');
    });

    test('should handle connection error', async () => {
      // Add error event listener to prevent unhandled error
      const errorListener = jest.fn();
      client.on('error', errorListener);

      const connectPromise = client.connect();

      // Simulate error event
      const errorHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'error'
      )?.[1] as (error: Error) => void;
      const testError = new Error('Connection failed');
      errorHandler(testError);

      await expect(connectPromise).rejects.toThrow('Connection failed');
      expect(client.getConnectionState()).toBe(ConnectionState.DISCONNECTED);
      expect(errorListener).toHaveBeenCalledWith(testError);
    });
  });

  describe('disconnect()', () => {
    test('should close WebSocket connection', async () => {
      // Connect first
      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();
      await connectPromise;

      // Disconnect
      await client.disconnect();

      expect(mockWebSocket.close).toHaveBeenCalled();
      expect(client.getConnectionState()).toBe(ConnectionState.DISCONNECTED);
    });

    test('should emit disconnected event', async () => {
      const disconnectedHandler = jest.fn();
      client.on('disconnected', disconnectedHandler);

      // Connect first
      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();
      await connectPromise;

      // Disconnect
      await client.disconnect();

      expect(disconnectedHandler).toHaveBeenCalled();
    });

    test('should do nothing if not connected', async () => {
      await client.disconnect();
      expect(mockWebSocket.close).not.toHaveBeenCalled();
    });
  });

  describe('getConnectionState()', () => {
    test('should return current connection state', async () => {
      expect(client.getConnectionState()).toBe(ConnectionState.DISCONNECTED);

      client.connect();
      expect(client.getConnectionState()).toBe(ConnectionState.CONNECTING);

      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();

      expect(client.getConnectionState()).toBe(ConnectionState.CONNECTED);
    });
  });

  describe('isConnected()', () => {
    test('should return true when connected', async () => {
      expect(client.isConnected()).toBe(false);

      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();
      await connectPromise;

      expect(client.isConnected()).toBe(true);
    });

    test('should return false when disconnected', async () => {
      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();
      await connectPromise;

      await client.disconnect();

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('Task 13.2: WebSocket Disconnection Error Handling', () => {
    test('should log error message when disconnection is detected', async () => {
      // Given: Client is connected
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();
      await connectPromise;

      // When: Connection is lost
      const closeHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1] as (code: number, reason: Buffer) => void;
      closeHandler(1006, Buffer.from('Connection lost'));

      // Then: Should log error
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test('should provide manual intervention guidance after max reconnect attempts', async () => {
      // Given: Client is configured with maxReconnectAttempts
      const clientWithLowMax = new WebSocketClient({
        ...testConfig,
        maxReconnectAttempts: 2,
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const reconnectFailedSpy = jest.fn();
      clientWithLowMax.on('reconnectFailed', reconnectFailedSpy);

      // Connect first
      (WS as unknown as jest.Mock).mockImplementationOnce(() => mockWebSocket);
      const connectPromise = clientWithLowMax.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();
      await connectPromise;

      // When: Max reconnect attempts are exceeded
      const closeHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1] as (code: number, reason: Buffer) => void;

      // Simulate multiple failures
      for (let i = 0; i < 3; i++) {
        closeHandler(1006, Buffer.from('Connection lost'));
      }

      // Then: Should provide manual intervention guidance
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorLogs = consoleErrorSpy.mock.calls.map(call => call.join(' '));
      const hasGuidance = errorLogs.some(log =>
        log.toLowerCase().includes('manual') || log.toLowerCase().includes('troubleshooting')
      );
      expect(hasGuidance).toBe(true);

      consoleErrorSpy.mockRestore();
      await clientWithLowMax.disconnect();
    });

    test('should trigger automatic reconnection with exponential backoff', async () => {
      jest.useFakeTimers();

      const connectPromise = client.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();
      await connectPromise;

      // When: Connection is lost
      const closeHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1] as (code: number, reason: Buffer) => void;
      closeHandler(1006, Buffer.from('Connection lost'));

      // Then: Should schedule reconnection with backoff
      // First attempt should be scheduled at 1s (base backoff)
      jest.advanceTimersByTime(1000);

      // Verify WebSocket constructor was called again for reconnection
      expect(WS).toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('should emit reconnectFailed event after max attempts exceeded', async () => {
      // Given: Client with low max attempts
      const clientWithLowMax = new WebSocketClient({
        ...testConfig,
        maxReconnectAttempts: 1,
      });

      const reconnectFailedSpy = jest.fn();
      clientWithLowMax.on('reconnectFailed', reconnectFailedSpy);

      // Connect first
      (WS as unknown as jest.Mock).mockImplementationOnce(() => mockWebSocket);
      const connectPromise = clientWithLowMax.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();
      await connectPromise;

      // When: Connection fails twice (exceeds max of 1)
      const closeHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1] as (code: number, reason: Buffer) => void;
      closeHandler(1006, Buffer.from('Connection lost'));
      closeHandler(1006, Buffer.from('Connection lost'));

      // Then: Should emit reconnectFailed event
      expect(reconnectFailedSpy).toHaveBeenCalled();

      await clientWithLowMax.disconnect();
    });
  });
});
