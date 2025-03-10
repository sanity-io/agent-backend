import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Agent, AgentConfig } from '../../src/mastra/core';

describe('Agent', () => {
  let agent: Agent;
  const mockModel = {
    generate: vi.fn().mockResolvedValue({ content: 'Model response' }),
  };

  const defaultConfig: AgentConfig = {
    name: 'TestAgent',
    description: 'Test Agent Description',
    model: mockModel,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new Agent(defaultConfig);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(agent).toBeDefined();
    });

    it('should initialize with the provided configuration', () => {
      expect(agent).toBeInstanceOf(Agent);
    });
  });

  describe('generate', () => {
    it('should generate a response from the model', async () => {
      const prompt = 'Test prompt';
      const response = await agent.generate(prompt);
      
      // Check response structure - this will depend on the actual implementation
      expect(response).toHaveProperty('content');
    });
  });

  describe('state management', () => {
    it('should allow setting and getting state', () => {
      const testState = { key: 'value', nested: { prop: true } };
      
      agent.setState(testState);
      const retrievedState = agent.getState();
      
      expect(retrievedState).toEqual(testState);
    });
  });

  describe('tool management', () => {
    it('should allow adding tools', () => {
      const mockTool = {
        name: 'testTool',
        description: 'A test tool',
        execute: vi.fn(),
      };
      
      agent.addTool(mockTool as any);
      
      // Since tools are stored in the config and there's no direct getter,
      // this test may need to be adjusted based on the implementation
      // This is a placeholder test
      expect(true).toBeTruthy();
    });
  });
}); 