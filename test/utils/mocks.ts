/**
 * Reusable mocks and test utilities for the MCP Agent tests
 */
import { vi } from 'vitest';

// Mock WebSocket class
export const createMockWebSocket = () => ({
  on: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1, // OPEN
});

// Mock WebSocketServer
export const createMockWebSocketServer = (mockWs: any) => ({
  on: vi.fn((event, callback) => {
    if (event === 'connection') {
      // Simulate a connection
      callback(mockWs);
    }
  }),
  close: vi.fn(),
});

// Mock Agent
export const createMockAgent = () => ({
  generate: vi.fn().mockResolvedValue({ content: 'Mock agent response' }),
  getState: vi.fn().mockReturnValue({}),
  setState: vi.fn(),
  addTool: vi.fn(),
});

// Mock Document Reference
export const createMockDocumentReference = (id: string) => ({
  id,
  type: 'mockType',
  title: `Mock Document ${id}`,
  path: `/path/to/${id}`,
  lastModified: new Date().toISOString(),
});

// Utility to create a mock WebSocket message
export const createMockMessage = (type: string, payload: Record<string, any> = {}, requestId?: string) => ({
  type,
  payload,
  requestId,
});

// Session ID generator for tests
export const generateTestSessionId = () => `test-session-${Date.now()}`; 