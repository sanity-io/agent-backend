/**
 * Standalone MCP Client implementation for LangGraph
 */
import { spawn, ChildProcess } from 'child_process';
import { createLogger } from '../../utils/logger.js';

// Create logger for this module
const logger = createLogger('MCPClient');

/**
 * Interface for MCP tool execution result
 */
export interface MCPToolResult {
  result: any;
  error?: string;
}

/**
 * Standalone MCP Client implementation for Sanity
 */
export class SanityMCPClient {
  private process: ChildProcess | null = null;
  private toolCache: Record<string, Function> = {};
  private ready = false;
  private messageQueue: { resolve: (value: any) => void; reject: (reason: any) => void; message: any }[] = [];
  private messageId = 0;
  private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }> = new Map();
  
  /**
   * Create a new MCP Client
   * @param options Configuration options
   */
  constructor(private options: {
    nodePath?: string;
    serverPath: string;
    timeout?: number;
  }) {
    // Set defaults
    this.options.nodePath = this.options.nodePath || process.execPath;
    this.options.timeout = this.options.timeout || 30000; // 30 seconds default timeout
  }
  
  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        logger.info('Starting MCP server process...');
        logger.info(`Node path: ${this.options.nodePath}`);
        logger.info(`Server path: ${this.options.serverPath}`);
        
        // Spawn the MCP server process
        this.process = spawn(this.options.nodePath!, [this.options.serverPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        // Handle stdout for JSON-RPC communication
        if (this.process.stdout) {
          this.process.stdout.on('data', (data) => {
            try {
              const messages = data.toString().trim().split('\n');
              
              for (const message of messages) {
                if (!message) continue;
                
                const parsed = JSON.parse(message);
                
                // Handle response messages
                if ('id' in parsed && this.pendingRequests.has(parsed.id)) {
                  const { resolve, reject } = this.pendingRequests.get(parsed.id)!;
                  this.pendingRequests.delete(parsed.id);
                  
                  if ('error' in parsed) {
                    reject(new Error(parsed.error.message || 'Unknown error'));
                  } else if ('result' in parsed) {
                    resolve(parsed.result);
                  }
                }
                // Handle server ready notification
                else if (parsed.method === 'ready') {
                  this.ready = true;
                  logger.info('MCP server is ready');
                  
                  // Process queued messages
                  while (this.messageQueue.length > 0) {
                    const { resolve, reject, message } = this.messageQueue.shift()!;
                    this.sendMessage(message).then(resolve).catch(reject);
                  }
                  
                  resolve();
                }
              }
            } catch (error) {
              logger.error('Error processing MCP server output', {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          });
        }
        
        // Handle stderr for logging
        if (this.process.stderr) {
          this.process.stderr.on('data', (data) => {
            logger.debug(`MCP server stderr: ${data.toString().trim()}`);
          });
        }
        
        // Handle process exit
        this.process.on('exit', (code) => {
          logger.warn(`MCP server process exited with code ${code}`);
          this.ready = false;
          this.process = null;
          
          // Reject all pending requests
          for (const [id, { reject }] of this.pendingRequests.entries()) {
            reject(new Error(`MCP server process exited with code ${code}`));
            this.pendingRequests.delete(id);
          }
        });
        
        // Handle process errors
        this.process.on('error', (error) => {
          logger.error('MCP server process error', {
            error: error.message,
          });
          reject(error);
        });
        
        // Set a timeout for the connection
        const timeout = setTimeout(() => {
          if (!this.ready) {
            logger.error(`MCP server connection timed out after ${this.options.timeout}ms`);
            reject(new Error(`MCP server connection timed out after ${this.options.timeout}ms`));
          }
        }, this.options.timeout);
        
        // Clear the timeout when ready
        this.process.stdout!.once('data', () => {
          clearTimeout(timeout);
        });
      } catch (error) {
        logger.error('Failed to start MCP server process', {
          error: error instanceof Error ? error.message : String(error),
        });
        reject(error);
      }
    });
  }
  
  /**
   * Send a message to the MCP server
   * @param message The message to send
   * @returns The response from the server
   */
  private async sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ready || !this.process) {
        // Queue the message if not ready
        this.messageQueue.push({ resolve, reject, message });
        return;
      }
      
      try {
        // Add message ID
        const id = this.messageId++;
        const messageWithId = { ...message, id };
        
        // Store the promise callbacks
        this.pendingRequests.set(id, { resolve, reject });
        
        // Send the message
        const messageString = JSON.stringify(messageWithId) + '\n';
        this.process.stdin!.write(messageString);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Discover available tools from the MCP server
   * @returns A record of tool functions
   */
  async tools(): Promise<Record<string, Function>> {
    // Return cached tools if available
    if (Object.keys(this.toolCache).length > 0) {
      return this.toolCache;
    }
    
    try {
      // Get available tools from server
      const availableTools = await this.sendMessage({
        jsonrpc: '2.0',
        method: 'system.listMethods',
        params: [],
      });
      
      // Create tool functions
      for (const toolName of availableTools) {
        this.toolCache[toolName] = this.createToolFunction(toolName);
      }
      
      return this.toolCache;
    } catch (error) {
      logger.error('Failed to discover tools', {
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
    return async (params: any): Promise<MCPToolResult> => {
      try {
        const result = await this.sendMessage({
          jsonrpc: '2.0',
          method: toolName,
          params: [params],
        });
        
        return { result };
      } catch (error) {
        return {
          result: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
  }
  
  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.process) {
      logger.info('Disconnecting from MCP server...');
      
      // Send a terminate message if possible
      if (this.ready) {
        try {
          await this.sendMessage({
            jsonrpc: '2.0',
            method: 'system.terminate',
            params: [],
          });
        } catch (error) {
          logger.warn('Error sending terminate message to MCP server', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      
      // Kill the process
      this.process.kill();
      this.process = null;
      this.ready = false;
      this.toolCache = {};
      
      logger.info('Disconnected from MCP server');
    }
  }
} 