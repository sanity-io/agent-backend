/**
 * Simple MCP Client for demonstration purposes
 * 
 * TypeScript ESM implementation
 */
import { createLogger } from '../utils/logger.js';

// Create logger for this module
const logger = createLogger('SimpleMCPClient');

/**
 * Tool interface for consistency
 */
export interface Tool {
  name: string;
  description: string;
  schema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  func: (params: any) => Promise<any>;
}

// Mock tools with documentation
const dummyTools: Tool[] = [
  {
    name: "getDocument",
    description: "Get a document by ID",
    schema: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "The ID of the document to retrieve"
        }
      },
      required: ["documentId"]
    },
    func: async (params) => {
      return { id: params.documentId, title: "Sample Document", type: "article" };
    }
  },
  {
    name: "listDocuments",
    description: "List documents matching a query",
    schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Document type to filter by"
        },
        limit: {
          type: "number",
          description: "Maximum number of documents to return"
        }
      }
    },
    func: async (params) => {
      return [
        { id: "doc1", title: "First Document", type: params.type || "article" },
        { id: "doc2", title: "Second Document", type: params.type || "article" }
      ];
    }
  },
  {
    name: "updateDocument",
    description: "Update a document by ID",
    schema: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "The ID of the document to update"
        },
        content: {
          type: "object",
          description: "The content to update"
        }
      },
      required: ["documentId", "content"]
    },
    func: async (params) => {
      return { id: params.documentId, updated: true, content: params.content };
    }
  }
];

/**
 * A simplified version of a MCP client that doesn't have any dependencies
 * 
 * This is for demonstration purposes only and doesn't actually connect to an MCP server
 */
export class SimpleMCPClient {
  private connected = false;
  
  /**
   * Create a new Simple MCP Client
   * @param options Configuration options
   */
  constructor(private options: {
    serverPath?: string;
    nodePath?: string;
    timeout?: number;
  } = {}) {
    logger.info("Created simple MCP client");
  }
  
  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    logger.info("Connected to mock MCP server");
    this.connected = true;
  }
  
  /**
   * Get the available tools
   * @returns Array of tools
   */
  getTools(): Tool[] {
    if (!this.connected) {
      throw new Error("Not connected to MCP server");
    }
    
    return dummyTools;
  }
  
  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    logger.info("Disconnected from mock MCP server");
    this.connected = false;
  }
} 