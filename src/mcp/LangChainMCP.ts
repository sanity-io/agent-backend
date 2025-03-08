/**
 * LangChain MCP Client implementation using the official langchain-mcp-adapters package
 */
import { StdioServerParameters, stdio } from '@modelcontextprotocol/mcp-sdk';
import { ClientSession } from '@modelcontextprotocol/mcp-sdk';
import { MCPToolkit } from 'langchain-mcp-adapters';
import { BaseTool } from '@langchain/core/tools';
import { createLogger } from '../utils/logger.js';
import { ChildProcess } from 'child_process';

// Create logger for this module
const logger = createLogger('LangChainMCP');

// Default MCP server path based on typical location
const DEFAULT_MCP_SERVER_PATH = "/Users/even/projects/sanity/ai/mcp/sanity-mcp-server/dist/index.js";

/**
 * Client for communicating with a Sanity MCP server using langchain-mcp-adapters
 */
export class LangChainMCP {
  private process: ChildProcess | null = null;
  private session: ClientSession | null = null;
  private toolkit: MCPToolkit | null = null;
  private tools: BaseTool[] = [];
  
  /**
   * Create a new LangChain MCP Client
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
      
      try {
        // Set up server parameters
        const serverParams = new StdioServerParameters(
          this.options.nodePath!, 
          [this.options.serverPath!]
        );
        
        // Start the server process with the SDK
        const { read, write, process } = await stdio(serverParams);
        this.process = process;
        
        // Create a session
        this.session = new ClientSession(read, write);
        
        // Create the MCP toolkit
        this.toolkit = new MCPToolkit({ session: this.session });
        
        // Initialize the toolkit
        await this.toolkit.initialize();
        
        // Load the tools
        this.tools = this.toolkit.getTools();
        
        logger.info(`Loaded ${this.tools.length} tools from MCP server`);
      } catch (importError) {
        logger.error(`Failed to initialize MCP client: ${importError instanceof Error ? importError.message : String(importError)}`);
        throw importError;
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
   * @returns An array of LangChain tools
   */
  getTools(): BaseTool[] {
    if (!this.toolkit) {
      throw new Error('Not connected to MCP server');
    }
    
    return this.tools;
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
      
      this.toolkit = null;
      this.tools = [];
      
      logger.info('Disconnected from MCP server');
    } catch (error) {
      logger.error('Error disconnecting from MCP server', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
} 