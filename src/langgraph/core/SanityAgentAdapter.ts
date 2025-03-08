/**
 * Adapter for migrating from Mastra to LangChain/LangGraph
 * This is a simplified proof-of-concept to get started
 */
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { MastraMCPClient } from "@mastra/mcp";
import { createSanityTools } from "../tools/SanityToolWrapper.js";
import { SanityAgentState, createInitialState } from "../state/types.js";
import { createLogger } from "../../utils/logger.js";

// Create logger for this module
const logger = createLogger("SanityAgentAdapter");

/**
 * Simple adapter that wraps LangChain components to provide a similar
 * interface as the Mastra agent
 */
export class SanityAgentAdapter {
  private model: ChatAnthropic;
  private tools: any[] = [];
  private systemPrompt: string;
  private state: SanityAgentState;
  
  /**
   * Create a new Sanity Agent Adapter
   * @param anthropicApiKey Anthropic API key for Claude
   * @param mcpClient MCP client for Sanity tools
   */
  constructor(
    private anthropicApiKey: string,
    private mcpClient: MastraMCPClient
  ) {
    // Initialize the model
    this.model = new ChatAnthropic({
      apiKey: anthropicApiKey,
      modelName: "claude-3-7-sonnet-20240229",
    });
    
    // Initialize system prompt
    this.systemPrompt = `
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
    `;
    
    // Initialize state
    this.state = createInitialState();
  }
  
  /**
   * Initialize the adapter by loading tools
   */
  async initialize(): Promise<void> {
    try {
      // Load Sanity tools
      logger.info("Loading Sanity tools...");
      this.tools = await createSanityTools(this.mcpClient);
      logger.info(`Loaded ${this.tools.length} Sanity tools`);
      
      // Add system message to conversation history
      this.state.messages.push(new SystemMessage(this.systemPrompt));
    } catch (error) {
      logger.error("Failed to initialize SanityAgentAdapter", {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Process a user message and generate a response
   * @param message The user message content
   * @returns The assistant's response
   */
  async generate(message: string): Promise<string> {
    try {
      // Add user message to conversation history
      const userMessage = new HumanMessage(message);
      this.state.messages.push(userMessage);
      
      // Update last activity timestamp
      this.state.sessionInfo.lastActivity = new Date().toISOString();
      
      // Send to model
      logger.info("Generating response...");
      const response = await this.model.invoke(this.state.messages);
      
      // Add assistant message to conversation history
      this.state.messages.push(response);
      
      // Update last activity timestamp again
      this.state.sessionInfo.lastActivity = new Date().toISOString();
      
      // Return the response text
      return response.content.toString();
    } catch (error) {
      logger.error("Error generating response", {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return error message
      return `I encountered an error processing your request: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  
  /**
   * Get the current state
   * @returns The current agent state
   */
  getState(): SanityAgentState {
    return this.state;
  }
  
  /**
   * Set the state (e.g., when restoring from a saved session)
   * @param state The state to set
   */
  setState(state: SanityAgentState): void {
    this.state = state;
  }
  
  /**
   * Get available tools
   * @returns The list of available tools
   */
  getTools(): any[] {
    return this.tools;
  }
} 