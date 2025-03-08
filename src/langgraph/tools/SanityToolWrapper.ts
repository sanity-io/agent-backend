/**
 * Tool wrapper for Sanity MCP tools to work with LangGraph
 */
import { DynamicTool } from "@langchain/core/tools";
import { SanityMCPClient } from "../../mcp/SanityMCPClient.js";

/**
 * Create a dynamic tool wrapper for a Sanity MCP tool
 * @param mcpClient The MCP client instance
 * @param toolName The name of the tool in the MCP client
 * @param description Optional description override
 * @returns A DynamicTool that wraps the Sanity tool
 */
export function createSanityTool(
  mcpClient: SanityMCPClient,
  toolName: string,
  description?: string
): DynamicTool {
  return new DynamicTool({
    name: toolName,
    description: description || `Execute the ${toolName} tool on Sanity`,
    func: async (input: string) => {
      try {
        // Parse input as JSON
        const parsedInput = JSON.parse(input);
        
        // Get the Sanity tools
        const tools = await mcpClient.tools();
        
        // Check if tool exists
        if (!(toolName in tools)) {
          throw new Error(`Tool ${toolName} not found in MCP client`);
        }
        
        // Call the tool function safely
        const result = await tools[toolName](parsedInput);
        
        // Return result as a string
        return JSON.stringify(result, null, 2);
      } catch (error) {
        console.error(`Error executing tool ${toolName}:`, error);
        return JSON.stringify({ 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
  });
}

/**
 * Create a set of tool wrappers for all available tools in the MCP client
 * @param mcpClient The MCP client instance
 * @returns An array of dynamic tools for each Sanity tool
 */
export async function createSanityTools(mcpClient: SanityMCPClient): Promise<DynamicTool[]> {
  // Get all available tools from the MCP client
  const tools = await mcpClient.tools();
  
  // Create a wrapper for each tool
  return Object.keys(tools).map(toolName => {
    return createSanityTool(mcpClient, toolName);
  });
} 