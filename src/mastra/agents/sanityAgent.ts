import { Agent, Memory as MastraMemory } from "../../mastra/core.js"
import { openai } from "@ai-sdk/openai"
import { anthropic } from "@ai-sdk/anthropic"
import { loadSanityTools } from "../tools/sanityTools.js"
import { SanityMCPClient } from "../../mcp/SanityMCPClient.js"
import { Tool } from "../../mastra/core.js"

// Define document reference interface (metadata only, no content)
export interface DocumentReference {
  id: string;
  type?: string;
  title?: string;
  path?: string; // Optional path within the document (for field-level context)
  lastModified?: string;
}

export interface SanityAgentState {
  // Current document selection with metadata (no content)
  currentSelection: DocumentReference[];
  
  // Last known user focus (document and path)
  userFocus: {
    documentId?: string;
    path?: string;
    lastUpdated?: string;
    lastQueryAnswered?: string; // Type of last query explicitly answered
  };
  
  // Current execution plan (if any)
  plan: {
    id: string; // Unique ID for the plan
    steps: string[];
    currentStep: number;
    status: "planning" | "executing" | "completed" | "paused" | "cancelled";
    createdAt: string;
    updatedAt: string;
    requiresConfirmation: boolean;
  } | null;
  
  // Trust level (0-100) - determines how much autonomy the agent has
  trustLevel: number;
  
  // Whether we're in sandbox mode (testing changes without publishing)
  sandboxMode: boolean;
  
  // Session information
  session: {
    id: string;
    startedAt: string;
    lastActivity: string;
  };
}

const DEFAULT_STATE: SanityAgentState = {
  currentSelection: [],
  userFocus: {},
  plan: null,
  trustLevel: 0, // Start with no trust (always ask for confirmation)
  sandboxMode: true, // Start in sandbox mode by default
  session: {
    id: `session-${Date.now()}`,
    startedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  }
}

// Create the agent configuration
export async function createSanityAgent(mcpClient?: SanityMCPClient): Promise<Agent> {
  let tools = await loadSanityTools()
  
  // If an MCP client is provided, add its tools
  if (mcpClient) {
    try {
      // Get MCP tools directly as functions
      const mcpToolFunctions = await mcpClient.tools();
      console.log(`Adding ${Object.keys(mcpToolFunctions).length} tools from MCP client`);
      
      // Convert each MCP tool function to a Mastra Tool
      for (const [toolName, toolFunc] of Object.entries(mcpToolFunctions)) {
        const tool = new Tool({
          name: toolName,
          description: `MCP tool: ${toolName}`,
          parameters: {
            type: 'object',
            properties: {},
            required: []
          },
          handler: async (params) => {
            return await toolFunc(params);
          }
        });
        
        tools.push(tool);
      }
    } catch (error) {
      console.error("Error adding MCP tools:", error);
    }
  }

  // Create a memory instance with strict limits
  const memory = new MastraMemory({
    // Keep conversation history minimal
    messagesToRemember: 5, 
    // Set a lower token limit to ensure we don't exceed Claude's maximum
    maxTokens: 50000,
    // Enable summarization to keep context compact
    summarize: true,
    summarizeAfter: 3
  })

  const agent = new Agent({
    name: "SanityContentAssistant",
    memory,
    systemMessage: `You are a helpful Content Management Assistant for Sanity.io.
Your goal is to help content editors manage their content efficiently and accurately.

CORE PRINCIPLES:
1. FOCUS ON WHAT THE USER IS CURRENTLY LOOKING AT - Always prioritize the user's current document focus
2. Be concise and helpful in your responses
3. When suggesting changes to content, explain your reasoning
4. For bulk operations, always show a plan and ask for confirmation before executing
5. If you're unsure about something, ask for clarification

USER FOCUS AWARENESS:
- When the user changes focus to a document, acknowledge it immediately
- When the user asks "what am I looking at?", describe the currently focused document in detail
- If a system message tells you the user is focusing on a document, treat this as critical context
- Refer to the document the user is currently focusing on in your responses
- If the user has no focused document or you don't know what they're focusing on, admit this

DOCUMENT HANDLING:
- Use the getDocument tool to retrieve content only when needed
- Do not try to memorize document content - fetch it when required
- Focus only on documents relevant to the current task
- Reference documents by their ID and metadata
- When updating documents, only request the specific fields that need changes

CONVERSATION MANAGEMENT:
- Keep responses focused and to the point
- Avoid repeating document content unnecessarily
- Summarize document content rather than including it verbatim when possible
- Always acknowledge when the user has changed their focus to a new document`,
    model: anthropic("claude-3-7-sonnet-latest"),
    tools: tools,
  })

  // Try to set the initial state using setState
  try {
    if (typeof agent.setState === 'function') {
      agent.setState(DEFAULT_STATE);
    } else {
      // Fallback: attach state directly if setState is not available
      (agent as any).state = DEFAULT_STATE;
      console.log("Note: Using fallback method to set agent state");
    }
  } catch (error) {
    console.warn("Could not set agent state:", error);
    // Continue without setting state - the agent will still function
  }

  return agent
}
