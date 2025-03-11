/**
 * Simple MCP Client for connecting to a Sanity MCP server via stdio
 * 
 * TypeScript ESM implementation that actually spawns the MCP server process
 */
import { spawn, ChildProcess } from 'child_process';
import { createLogger } from '../utils/logger.js';
import { createInterface, Interface } from 'readline';
import fs from 'fs';
import path from 'path';

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

/**
 * A simple MCP client that uses stdio to communicate with a Sanity MCP server
 * 
 * This implementation spawns the MCP server as a child process and communicates with it via stdio
 */
export class SimpleMCPClient {
  private process: ChildProcess | null = null;
  private connected = false;
  private tools: Tool[] = [];
  private messageId = 0;
  private pending: Map<number, { resolve: Function, reject: Function }> = new Map();
  private stdin: NodeJS.WritableStream | null = null;
  private stdout: Interface | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  
  /**
   * Create a new Simple MCP Client
   * @param options Configuration options
   */
  constructor(private options: {
    serverPath?: string;
    nodePath?: string;
    timeout?: number;
  } = {}) {
    // Set defaults
    this.options.nodePath = this.options.nodePath || process.execPath;
    this.options.timeout = this.options.timeout || 30000; // 30 seconds default timeout
    
    logger.info("Created simple MCP client");
    
    // Log the server path for debugging
    if (this.options.serverPath) {
      logger.info(`MCP server path: ${this.options.serverPath}`);
      
      // Check if the file exists
      if (!fs.existsSync(this.options.serverPath)) {
        logger.error(`MCP server path does not exist: ${this.options.serverPath}`);
      } else {
        logger.info(`MCP server file exists at: ${path.resolve(this.options.serverPath)}`);
      }
    } else {
      logger.warn("No MCP server path provided");
    }
  }
  
  /**
   * Connect to the MCP server by spawning it as a child process
   */
  async connect(): Promise<void> {
    if (!this.options.serverPath) {
      logger.warn("No server path provided, using mock tools instead");
      this.connected = true;
      return this.setupMockTools();
    }

    try {
      logger.info(`Connecting to MCP server: ${this.options.nodePath} ${this.options.serverPath}`);
      
      // Spawn the MCP server process
      this.process = spawn(this.options.nodePath!, [this.options.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
        detached: false // Ensure the child process is attached to parent
      });
      
      if (!this.process.stdin || !this.process.stdout) {
        throw new Error("Failed to open stdio streams to MCP server");
      }
      
      this.stdin = this.process.stdin;
      this.stdout = createInterface({ input: this.process.stdout });
      
      // Handle stderr for debugging
      if (this.process.stderr) {
        this.process.stderr.on('data', (data) => {
          const message = data.toString().trim();
          logger.info(`MCP server stderr: ${message}`);
          
          // If we see connected successfully message, we can consider the connection established
          if (message.includes('MCP Server connected successfully')) {
            logger.info("MCP server reported successful connection");
          }
        });
      }
      
      // Set up error handling
      this.process.on('error', (err) => {
        logger.error(`MCP server process error: ${err.message}`);
        this.handleDisconnect(err);
      });
      
      this.process.on('exit', (code, signal) => {
        logger.info(`MCP server process exited with code ${code} and signal ${signal}`);
        this.handleDisconnect(new Error(`Process exited with code ${code}`));
      });
      
      // Set up message handling
      this.stdout.on('line', (line) => {
        try {
          logger.debug(`Received line from MCP server: ${line}`);
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (err) {
          logger.error(`Failed to parse message: ${line}, Error: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
      
      // Initialize the connection with a timeout
      this.connectionTimeout = setTimeout(() => {
        if (!this.connected) {
          logger.error(`Connection to MCP server timed out after ${this.options.timeout}ms`);
          this.handleDisconnect(new Error("Connection timeout"));
        }
      }, this.options.timeout!);
      
      // Send system.listMethods to discover available tools
      logger.info("Sending system.listMethods to discover available tools");
      try {
        const response = await this.sendRequest({
          jsonrpc: "2.0",
          id: this.messageId++,
          method: "system.listMethods",
          params: []
        });
        
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        
        if (Array.isArray(response.result)) {
          logger.info(`Discovered ${response.result.length} methods from MCP server`);
          
          // Create tool wrappers for each method
          this.tools = response.result.map((method: string) => this.createToolWrapper(method));
        } else {
          logger.warn("Failed to get methods list from MCP server, using mock tools");
          await this.setupMockTools();
        }
      } catch (error) {
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        
        logger.error(`Failed to get methods from MCP server: ${error instanceof Error ? error.message : String(error)}`);
        logger.warn("Falling back to mock tools");
        await this.setupMockTools();
      }
      
      this.connected = true;
      logger.info("Connected to MCP server");
    } catch (error) {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      
      logger.error(`Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`);
      logger.warn("Falling back to mock tools");
      await this.setupMockTools();
    }
  }
  
  /**
   * Send a request to the MCP server
   * @param request The request to send
   * @returns The response from the server
   */
  private async sendRequest(request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.stdin || !this.process) {
        return reject(new Error("Not connected to MCP server"));
      }
      
      // Store the promise callbacks
      this.pending.set(request.id, { resolve, reject });
      
      try {
        // Send the request
        const requestString = JSON.stringify(request) + '\n';
        logger.debug(`Sending request: ${requestString}`);
        this.stdin.write(requestString);
      } catch (err) {
        this.pending.delete(request.id);
        reject(err);
      }
    });
  }
  
  /**
   * Handle a message from the MCP server
   * @param message The message to handle
   */
  private handleMessage(message: any) {
    if (message.id !== undefined && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id)!;
      this.pending.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message || "Unknown error"));
      } else {
        resolve(message);
      }
    } else if (message.method === 'ready') {
      logger.info("MCP server is ready");
    } else {
      logger.debug(`Received unhandled message: ${JSON.stringify(message)}`);
    }
  }
  
  /**
   * Handle disconnection from the MCP server
   * @param error The error that caused the disconnection
   */
  private handleDisconnect(error: Error) {
    logger.error(`Disconnected from MCP server: ${error.message}`);
    
    // Reject all pending requests
    for (const [id, { reject }] of this.pending.entries()) {
      reject(error);
      this.pending.delete(id);
    }
    
    this.connected = false;
    
    // Clean up resources
    if (this.stdout) {
      this.stdout.close();
      this.stdout = null;
    }
    
    if (this.stdin) {
      this.stdin.end();
      this.stdin = null;
    }
    
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch (err) {
        logger.error(`Error killing process: ${err instanceof Error ? err.message : String(err)}`);
        
        try {
          // Try with SIGKILL if SIGTERM fails
          this.process.kill('SIGKILL');
        } catch (killErr) {
          logger.error(`Failed to force kill process: ${killErr instanceof Error ? killErr.message : String(killErr)}`);
        }
      }
      this.process = null;
    }
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }
  
  /**
   * Create a tool wrapper for an MCP method
   * @param method The method name
   * @returns A tool wrapper
   */
  private createToolWrapper(method: string): Tool {
    return {
      name: method,
      description: `Execute the ${method} method on the MCP server`,
      schema: {
        type: "object",
        properties: {}
      },
      func: async (params: any) => {
        try {
          const response = await this.sendRequest({
            jsonrpc: "2.0",
            id: this.messageId++,
            method,
            params: [params]
          });
          
          return response.result;
        } catch (error) {
          logger.error(`Error executing tool ${method}: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      }
    };
  }
  
  /**
   * Set up mock tools for development and testing
   */
  private async setupMockTools(): Promise<void> {
    logger.info("Setting up mock tools");
    
    this.tools = [
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
    
    this.connected = true;
  }
  
  /**
   * Get the available tools from the MCP server
   * @returns Array of tools
   */
  getTools(): Tool[] {
    if (!this.connected) {
      throw new Error("Not connected to MCP server");
    }
    
    return this.tools;
  }
  
  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    logger.info("Disconnecting from MCP server");
    
    if (this.process) {
      // Try to send a clean shutdown message
      if (this.connected && this.stdin) {
        try {
          this.stdin.write(JSON.stringify({
            jsonrpc: "2.0",
            id: this.messageId++,
            method: "system.terminate",
            params: []
          }) + '\n');
          
          // Give it a moment to terminate gracefully
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          logger.error(`Failed to send terminate message: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      
      // Clean up resources
      if (this.stdout) {
        this.stdout.close();
        this.stdout = null;
      }
      
      if (this.stdin) {
        this.stdin.end();
        this.stdin = null;
      }
      
      // Kill the process
      try {
        this.process.kill('SIGTERM');
        
        // Give it a moment to terminate gracefully
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // If process is still running, force kill
        if (this.process) {
          try {
            this.process.kill('SIGKILL');
          } catch (err) {
            logger.error(`Failed to force kill process: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        logger.error(`Error killing process: ${err instanceof Error ? err.message : String(err)}`);
      }
      this.process = null;
    }
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    this.connected = false;
    this.tools = [];
    
    logger.info("Disconnected from MCP server");
  }

  /**
   * Execute a tool with the given parameters
   * @param name Tool name
   * @param params Tool parameters
   * @returns Tool execution result
   */
  async executeTool(name: string, params: any): Promise<any> {
    // Find the tool by name
    const tool = this.tools.find(t => t.name === name);
    
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    
    try {
      // Log the tool execution
      logger.debug(`Executing tool ${name} with params: ${JSON.stringify(params)}`);
      
      // Execute the tool
      return await tool.func(params);
    } catch (error) {
      logger.error(`Error executing tool ${name}: ${error}`);
      throw error;
    }
  }
} 