/**
 * Core LangGraph implementation for Sanity Agent
 */
import { StateGraph } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Anthropic } from "@langchain/anthropic";
import { DynamicTool } from "@langchain/core/tools";
import { RunnableSequence } from "@langchain/core/runnables";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { MastraMCPClient } from "@mastra/mcp";
import { SanityAgentState, createInitialState } from "../state/types.js";
import { createSanityTools } from "../tools/SanityToolWrapper.js";

/**
 * Create the LangGraph-based Sanity agent
 * @param anthropicApiKey The Anthropic API key for Claude
 * @param mcpClient The MCP client for Sanity tools
 * @returns The configured StateGraph for the Sanity agent
 */
export async function createSanityAgentGraph(
  anthropicApiKey: string,
  mcpClient: MastraMCPClient
): Promise<StateGraph<SanityAgentState>> {
  // Create the model
  const model = new Anthropic({
    apiKey: anthropicApiKey,
    modelName: "claude-3-7-sonnet-20240229",
  });
  
  // Create Sanity tools
  const tools = await createSanityTools(mcpClient);
  
  // Create the base system prompt
  const systemPrompt = ChatPromptTemplate.fromTemplate(`
  You are a helpful Content Management Assistant for Sanity.io.
  Your goal is to help content editors manage their content efficiently and accurately.
  
  CORE PRINCIPLES:
  1. FOCUS ON WHAT THE USER IS CURRENTLY LOOKING AT - Always prioritize the user's current document focus
  2. Be concise and helpful in your responses
  3. When suggesting changes to content, explain your reasoning
  4. For bulk operations, always show a plan and ask for confirmation before executing
  5. If you're unsure about something, ask for clarification
  
  You have access to Sanity CMS tools through the Sanity MCP connection.
  Use these tools to help the user manage their Sanity content.
  `);
  
  // Create node for formatting user input
  const userInputNode = (state: SanityAgentState) => {
    // Get the last message
    const lastMessage = state.messages[state.messages.length - 1];
    
    // Make sure it's a user message
    if (!(lastMessage instanceof HumanMessage)) {
      throw new Error("Last message is not from a user");
    }
    
    return { messages: [lastMessage] };
  };
  
  // Create node for generating agent response
  const agentNode = RunnableSequence.from([
    systemPrompt,
    model,
  ]);
  
  // Create node for updating state with agent response
  const saveResponseNode = (state: SanityAgentState, { result }: { result: AIMessage }) => {
    return {
      ...state,
      messages: [...state.messages, result],
      sessionInfo: {
        ...state.sessionInfo,
        lastActivity: new Date().toISOString(),
      },
    };
  };
  
  // Create the graph
  const workflow = new StateGraph<SanityAgentState>({
    channels: {
      messages: {
        value: (x: SanityAgentState) => x.messages,
        default: () => [],
      },
      currentDocuments: {
        value: (x: SanityAgentState) => x.currentDocuments,
        default: () => [],
      },
      userFocus: {
        value: (x: SanityAgentState) => x.userFocus,
        default: () => ({}),
      },
      toolResults: {
        value: (x: SanityAgentState) => x.toolResults,
        default: () => [],
      },
      metadata: {
        value: (x: SanityAgentState) => x.metadata,
        default: () => ({}),
      },
      sessionInfo: {
        value: (x: SanityAgentState) => x.sessionInfo,
        default: () => ({
          id: `session-${Date.now()}`,
          startedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
        }),
      },
    },
  });
  
  // Add the nodes to the graph
  workflow.addNode("userInput", userInputNode);
  workflow.addNode("agent", agentNode);
  workflow.addNode("saveResponse", saveResponseNode);
  
  // Define the edges
  workflow.addEdge("userInput", "agent");
  workflow.addEdge("agent", "saveResponse");
  workflow.setEntryPoint("userInput");
  
  // Define the exit point
  workflow.setFinishPoint("saveResponse");
  
  // Add conditional branching for tool calls later
  
  // Compile the workflow
  return workflow.compile();
}

/**
 * Create a runnable agent from the graph
 * @param anthropicApiKey The Anthropic API key
 * @param mcpClient The Sanity MCP client
 * @returns A runnable that takes a user message and returns a state
 */
export async function createSanityAgent(
  anthropicApiKey: string,
  mcpClient: MastraMCPClient
) {
  const graph = await createSanityAgentGraph(anthropicApiKey, mcpClient);
  
  const agent = graph.getMessenger();
  
  return {
    /**
     * Process a user message through the agent
     * @param message The user message
     * @param sessionId Optional session ID for continuity
     * @returns The updated state
     */
    generate: async (message: string, sessionId?: string) => {
      // Create initial state or load saved state
      const initialState = createInitialState(sessionId);
      
      // Add the user message
      initialState.messages.push(new HumanMessage(message));
      
      // Update the last activity timestamp
      initialState.sessionInfo.lastActivity = new Date().toISOString();
      
      // Process the message through the graph
      const result = await agent.invoke(initialState);
      
      return result;
    }
  };
} 