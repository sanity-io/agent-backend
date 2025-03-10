/**
 * Test for the SanityAgentAdapter
 */
import { expect, describe, it, vi, beforeEach } from 'vitest';
import { SanityAgentAdapter } from '../core/SanityAgentAdapter.js';
import { SimpleMCPClient } from '../../mcp/SimpleMCPClient.js';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

// Mock SimpleMCPClient
vi.mock('../../mcp/SimpleMCPClient.js', () => {
  return {
    SimpleMCPClient: vi.fn().mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        getTools: vi.fn().mockReturnValue([
          {
            name: 'getDocument',
            description: 'Get a document',
            schema: {
              type: 'object',
              properties: {
                id: { type: 'string' }
              },
              required: ['id']
            },
            func: vi.fn().mockResolvedValue({ _id: 'doc123', title: 'Test Document' })
          },
          {
            name: 'listDocuments',
            description: 'List documents',
            schema: { type: 'object', properties: {} },
            func: vi.fn().mockResolvedValue([{ _id: 'doc123', title: 'Test Document' }])
          },
          {
            name: 'createDocument',
            description: 'Create a document',
            schema: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                data: { type: 'object' }
              },
              required: ['type', 'data']
            },
            func: vi.fn().mockResolvedValue({ _id: 'doc456', title: 'New Document' })
          }
        ]),
        disconnect: vi.fn().mockResolvedValue(undefined)
      };
    }),
  };
});

// Mock ChatAnthropic
vi.mock('@langchain/anthropic', () => {
  return {
    ChatAnthropic: vi.fn().mockImplementation(() => {
      return {
        invoke: vi.fn().mockResolvedValue(
          new AIMessage('This is a test response from the assistant.')
        ),
      };
    }),
  };
});

describe('SanityAgentAdapter', () => {
  let adapter: SanityAgentAdapter;
  let mcpClient: SimpleMCPClient;
  
  beforeEach(async () => {
    // Create a new MCP client mock with the required server parameter
    mcpClient = new SimpleMCPClient({
      serverPath: 'test-server.js',
      nodePath: 'node'
    });
    
    // Create a new adapter with mocked dependencies
    adapter = new SanityAgentAdapter('test-api-key', mcpClient);
    
    // Initialize the adapter
    await adapter.initialize();
  });
  
  it('should initialize with system prompt and tools', async () => {
    // Check that the state has the system message
    const state = adapter.getState();
    expect(state.messages.length).toBeGreaterThan(0);
    expect(state.messages[0]).toBeInstanceOf(SystemMessage);
    
    // Check that tools were loaded
    const tools = adapter.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });
  
  it('should generate a response for a user message', async () => {
    // Generate a response
    const response = await adapter.generate('Hello, can you help me with my Sanity content?');
    
    // Check that the response is a string
    expect(typeof response).toBe('string');
    expect(response).toBe('This is a test response from the assistant.');
    
    // Check that the messages have been updated
    const state = adapter.getState();
    expect(state.messages.length).toBe(3); // System + User + Assistant
    expect(state.messages[1]).toBeInstanceOf(HumanMessage);
    expect(state.messages[2]).toBeInstanceOf(AIMessage);
  });
  
  it('should update state timestamps', async () => {
    // Get initial timestamp
    const initialState = adapter.getState();
    const initialTimestamp = initialState.sessionInfo.lastActivity;
    
    // Wait a small amount of time
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Generate a response
    await adapter.generate('Update the timestamp please');
    
    // Get the updated state
    const updatedState = adapter.getState();
    const updatedTimestamp = updatedState.sessionInfo.lastActivity;
    
    // Check that the timestamp has been updated
    expect(updatedTimestamp).not.toBe(initialTimestamp);
    expect(new Date(updatedTimestamp).getTime()).toBeGreaterThan(new Date(initialTimestamp).getTime());
  });
}); 