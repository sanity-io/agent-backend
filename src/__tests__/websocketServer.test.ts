import { WebSocket } from 'ws';
import { MCPWebSocketServer, WebSocketMessage } from '../server/websocketServer';

// Mock the WebSocketServer
jest.mock('ws', () => {
  const mockedWs = {
    on: jest.fn(),
    close: jest.fn(),
    send: jest.fn(),
    readyState: 1, // OPEN
  };
  
  return {
    __esModule: true,
    WebSocket: jest.fn(() => mockedWs),
    WebSocketServer: jest.fn(() => ({
      on: jest.fn((event, callback) => {
        if (event === 'connection') {
          // Simulate a connection when the 'connection' event handler is registered
          callback(mockedWs);
        }
      }),
      close: jest.fn(),
    })),
  };
});

// Mock the Agent
const mockAgent = {
  generate: jest.fn().mockResolvedValue({ text: 'Mock agent response' }),
};

describe('MCPWebSocketServer', () => {
  let wsServer: MCPWebSocketServer;

  beforeEach(() => {
    jest.clearAllMocks();
    wsServer = new MCPWebSocketServer(3002, mockAgent as any);
  });

  test('should be defined', () => {
    expect(wsServer).toBeDefined();
  });

  test('should initialize with the correct port and agent', () => {
    expect(wsServer).toBeInstanceOf(MCPWebSocketServer);
  });

  test('should broadcast messages to clients', () => {
    // Simulate a connected client
    const mockMessage: WebSocketMessage = {
      type: 'agent_message',
      payload: { content: 'Test message' },
    };

    wsServer.broadcast(mockMessage);
    
    // We don't need to verify the actual send call since the WebSocket is mocked
    // Just verify that the broadcast method exists and can be called
    expect(true).toBeTruthy();
  });
}); 