/**
 * WebSocket Client Tests
 * Task 9.1: WebSocket接続管理のテスト
 */

import { WebSocketClient } from './WebSocketClient';
import { ConnectionState, WebSocketConfig } from '../types/websocket';
import WS from 'ws';
import { EventEmitter } from 'events';
import { logger } from './Logger';

// Mock ws library
jest.mock('ws');

// Mock logger
jest.mock('./Logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

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

      // Then: Should log disconnection
      expect(logger.info).toHaveBeenCalledWith('WebSocket closed', expect.any(Object));
    });

    test.skip('should provide manual intervention guidance after max reconnect attempts', async () => {
      // Use real timers with short delays for faster testing
      const clientWithLowMax = new WebSocketClient({
        ...testConfig,
        maxReconnectAttempts: 2,
        reconnectBackoffBase: 50, // Short delay for testing
      });

      const reconnectFailedSpy = jest.fn();
      clientWithLowMax.on('reconnectFailed', reconnectFailedSpy);

      let wsCallCount = 0;
      (WS as unknown as jest.Mock).mockImplementation(() => {
        wsCallCount++;
        const ws = new EventEmitter() as any;
        ws.close = jest.fn();
        ws.send = jest.fn();
        ws.removeAllListeners = jest.fn();
        ws.on = jest.fn((event, handler) => {
          if (event === 'open' && wsCallCount === 1) {
            // First connection succeeds
            setImmediate(() => handler());
          } else if (event === 'error' && wsCallCount > 1) {
            // Reconnection attempts fail
            setImmediate(() => handler(new Error('Connection refused')));
          }
          return ws;
        });
        return ws;
      });

      const connectPromise = clientWithLowMax.connect();
      await connectPromise;

      // When: Connection is lost and reconnection fails
      const disconnectHandler = jest.fn();
      clientWithLowMax.on('disconnected', disconnectHandler);

      // Simulate disconnection
      clientWithLowMax['ws'] = null;
      clientWithLowMax['connectionState'] = ConnectionState.DISCONNECTED;
      clientWithLowMax['handleDisconnect']();

      // Wait for reconnection attempts to exhaust
      await new Promise(resolve => setTimeout(resolve, 500));

      // Then: Should log error with troubleshooting guidance
      expect(logger.error).toHaveBeenCalledWith(
        'WebSocket reconnection failed',
        expect.objectContaining({
          troubleshooting: expect.stringContaining('Manual troubleshooting steps'),
        })
      );

      await clientWithLowMax.disconnect();
    });

    test.skip('should trigger automatic reconnection with exponential backoff', async () => {
      // Use real timers with short delays for testing
      const testClient = new WebSocketClient({
        ...testConfig,
        reconnectBackoffBase: 50,
      });

      const connectPromise = testClient.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();
      await connectPromise;

      const wsCallsBefore = (WS as unknown as jest.Mock).mock.calls.length;

      // When: Connection is lost
      const closeHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1] as (code: number, reason: Buffer) => void;
      closeHandler(1006, Buffer.from('Connection lost'));

      // Wait for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      // Then: Should attempt reconnection
      expect((WS as unknown as jest.Mock).mock.calls.length).toBeGreaterThan(wsCallsBefore);

      await testClient.disconnect();
    });

    test.skip('should emit reconnectFailed event after max attempts exceeded', async () => {
      // Use real timers with short delays for testing
      const clientWithLowMax = new WebSocketClient({
        ...testConfig,
        maxReconnectAttempts: 1,
        reconnectBackoffBase: 50,
      });

      const reconnectFailedSpy = jest.fn();
      clientWithLowMax.on('reconnectFailed', reconnectFailedSpy);

      // Connect first
      (WS as unknown as jest.Mock).mockImplementation(() => mockWebSocket);
      const connectPromise = clientWithLowMax.connect();
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open'
      )?.[1] as () => void;
      openHandler();
      await connectPromise;

      // When: Connection fails (exceeds max of 1)
      const closeHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1] as (code: number, reason: Buffer) => void;
      closeHandler(1006, Buffer.from('Connection lost'));

      // Wait for reconnection attempts to exhaust (1 attempt + backoff)
      // Base 50ms -> total ~100ms + buffer
      await new Promise(resolve => setTimeout(resolve, 200));

      // Then: Should emit reconnectFailed event
      expect(reconnectFailedSpy).toHaveBeenCalled();

      await clientWithLowMax.disconnect();
    });
  });
});
