/**
 * Sanity MCP Client implementation using the official Model Context Protocol SDK
 * 
 * This is a simplified version that uses dynamic imports to avoid type errors.
 * In a production environment, proper types would be added.
 */
import { spawn, ChildProcess } from 'child_process';
import { createLogger } from '../utils/logger.js';
import path from 'path';

// Create logger for this module
const logger = createLogger('SanityMCPClient');

// Default MCP server path based on typical location
const DEFAULT_MCP_SERVER_PATH = "/Users/even/projects/sanity/ai/mcp/sanity-mcp-server/dist/index.js";

/**
 * Client for communicating with a Sanity MCP server
 */
export class SanityMCPClient {
  private process: ChildProcess | null = null;
  private session: any = null;
  private toolCache: Record<string, Function> = {};
  private mcp: any = null;
  
  /**
   * Create a new Sanity MCP Client
   * @param options Configuration options for the MCP client
   */
  constructor(private options: {
    nodePath?: string;
    serverPath?: string;
    timeout?: number;
  } = {}) {
    // Set defaults
    this.options.nodePath = this.options.nodePath || process.execPath;
    this.options.serverPath = this.options.serverPath || DEFAULT_MCP_SERVER_PATH;
    this.options.timeout = this.options.timeout || 30000; // 30 seconds default timeout
  }
  
  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    try {
      logger.info('Starting MCP server process...');
      logger.info(`Node path: ${this.options.nodePath}`);
      logger.info(`Server path: ${this.options.serverPath}`);
      
      // Direct spawn approach as fallback if SDK import fails
      try {
        // Import the MCP SDK dynamically
        this.mcp = await import('@modelcontextprotocol/mcp-sdk');
        
        // Configure server parameters
        const serverParams = new this.mcp.StdioServerParameters(
          this.options.nodePath!, 
          [this.options.serverPath!]
        );
        
        // Start the server process with the SDK
        const { read, write, process } = await this.mcp.stdio(serverParams);
        this.process = process;
        
        // Create a session
        this.session = new this.mcp.ClientSession(read, write);
        
        // Wait for the session to initialize
        await this.session.initialize();
      } catch (importError) {
        // Fallback to direct process spawn if SDK import fails
        logger.warn(`Failed to import MCP SDK: ${importError instanceof Error ? importError.message : String(importError)}`);
        logger.warn('Falling back to direct process spawn');
        
        // Spawn the process directly
        this.process = spawn(this.options.nodePath!, [this.options.serverPath!]);
        
        // Create a simple session wrapper (would need custom JSON-RPC implementation)
        this.session = {
          initialize: async () => {
            logger.warn('Using simplified MCP client without SDK');
            return Promise.resolve();
          },
          metadata: async () => {
            return { tools: [] };
          },
          execute: async (toolName: string, params: any) => {
            throw new Error('Tool execution not implemented in fallback mode');
          },
          close: async () => {
            return Promise.resolve();
          }
        };
        
        // Initialize the session
        await this.session.initialize();
      }
      
      logger.info('Connected to MCP server');
    } catch (error) {
      logger.error('Failed to connect to MCP server', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  
  /**
   * Get the available tools from the MCP server
   * @returns A record of tool functions
   */
  async tools(): Promise<Record<string, Function>> {
    if (!this.session) {
      throw new Error('Not connected to MCP server');
    }
    
    try {
      // Return cached tools if available
      if (Object.keys(this.toolCache).length > 0) {
        return this.toolCache;
      }
      
      // Get metadata to discover available tools
      const metadata = await this.session.metadata();
      
      // Create function wrappers for each tool
      for (const tool of metadata.tools) {
        this.toolCache[tool.name] = this.createToolFunction(tool.name);
      }
      
      return this.toolCache;
    } catch (error) {
      logger.error('Failed to get tools', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  
  /**
   * Create a function wrapper for a tool
   * @param toolName The name of the tool
   * @returns A function that executes the tool
   */
  private createToolFunction(toolName: string): Function {
    return async (params: any): Promise<any> => {
      if (!this.session) {
        throw new Error('Not connected to MCP server');
      }
      
      try {
        // Call the tool and return the result
        const result = await this.session.execute(toolName, params);
        return result;
      } catch (error) {
        logger.error(`Error executing tool ${toolName}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };
  }
  
  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    try {
      if (this.session) {
        await this.session.close();
        this.session = null;
      }
      
      if (this.process) {
        this.process.kill();
        this.process = null;
      }
      
      this.toolCache = {};
      
      logger.info('Disconnected from MCP server');
    } catch (error) {
      logger.error('Error disconnecting from MCP server', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
} 