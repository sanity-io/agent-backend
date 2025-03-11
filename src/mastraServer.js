/**
 * Main entry point for the Sanity MCP Agent server using Mastra.ai
 */

// Core imports
import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Utility imports
import { createLogger, LogLevel } from "./utils/logger.js";
import { 
  normalizeError, 
  tryCatch, 
  ConnectionError 
} from "./utils/errorHandler.js";

// Mastra imports
import { Agent, Tool } from "./mastra/core.js";
import { MastraMCPClient } from "@mastra/mcp";
import { anthropic } from "@ai-sdk/anthropic";

// WebSocket server import
import { MCPWebSocketServer } from "./server/websocketServer.js";

// Print startup info for debugging
console.log("Starting server with Node.js version:", process.version);
console.log("Current working directory:", process.cwd());

// Create logger
const logger = createLogger('Server', {
  level: LogLevel.INFO
});

// Set up __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Set up HTTP server
 */
const app = express();

// Load environment variables
const loadEnvironmentVariables = () => {
  const envPath = path.resolve(__dirname, "../.env");
  logger.info(`Loading environment from ${envPath}`);
  
  try {
    dotenv.config({ path: envPath });
    console.log("Environment variables loaded:");
    console.log("- PORT:", process.env.PORT);
    console.log("- WEBSOCKET_PORT:", process.env.WEBSOCKET_PORT);
    console.log("- ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "Set" : "Not set");
    console.log("- ANTHROPIC_MODEL_NAME:", process.env.ANTHROPIC_MODEL_NAME);
    console.log("- SANITY_MCP_SERVER_PATH:", process.env.SANITY_MCP_SERVER_PATH);
  } catch (error) {
    logger.error(`Failed to load environment variables: ${error}`);
    process.exit(1);
  }
};

// Configure CORS
const getAllowedOrigins = () => {
  const defaultOrigins = [
    'http://localhost:3333',
    'http://localhost:3000',
    'https://localhost:3333',
    'https://localhost:3000'
  ];
  
  const configuredOrigins = process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) : 
    [];
  
  return [...defaultOrigins, ...configuredOrigins];
};

// Configure express middleware
const configureExpress = () => {
  app.use(cors({
    origin: getAllowedOrigins(),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));
  
  app.use(express.json());
  
  // Simple health check route
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      message: 'Sanity MCP Agent running',
      version: '0.1.0'
    });
  });
};

/**
 * Start HTTP server on specified port with retries
 */
const startExpressServer = (app, port, maxRetries = 5) => {
  return new Promise((resolve, reject) => {
    const tryPort = (currentPort, retriesLeft) => {
      const server = app.listen(currentPort, () => {
        logger.info(`HTTP server running on port ${currentPort}`);
        resolve(currentPort);
      });
      
      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.warn(`Port ${currentPort} is already in use`);
          
          if (retriesLeft > 0) {
            const nextPort = currentPort + 1;
            logger.info(`Trying next port: ${nextPort}`);
            tryPort(nextPort, retriesLeft - 1);
          } else {
            reject(new ConnectionError(`Could not find available port after ${maxRetries} attempts`, {
              code: 'PORT_EXHAUSTED',
              details: { startPort: port, attempts: maxRetries }
            }));
          }
        } else {
          reject(normalizeError(error));
        }
      });
    };
    
    tryPort(port, maxRetries);
  });
};

/**
 * Start a WebSocket server on a specific port
 * @param {number} port - The port to use (no fallback)
 * @param {Agent} agent - The agent to use
 * @returns {Promise<{server: any, port: number}>}
 */
const startWebSocketServer = async (port, agent) => {
  try {
    const websocketServer = new MCPWebSocketServer(port, agent);
    logger.info(`WebSocket server started on port ${port}`);
    return { server: websocketServer, port };
  } catch (error) {
    console.error('Error starting WebSocket server:', error);
    throw error;
  }
};

/**
 * Main server startup function
 */
async function startServer() {
  try {
    console.log("=== Starting Sanity MCP Agent server ===");
    logger.info('Starting Sanity MCP Agent server...');
    
    // Load environment variables first
    loadEnvironmentVariables();
    
    // Initialize MCP client
    const mcpServerPath = process.env.SANITY_MCP_SERVER_PATH;
    if (!mcpServerPath) {
      logger.error("MCP server path not defined in environment variables");
      logger.error("Please ensure SANITY_MCP_SERVER_PATH is set in your .env file");
      process.exit(1);
    }
    
    console.log("MCP server path:", mcpServerPath);
    
    // Configure express
    configureExpress();
    
    // Start the HTTP server on the configured port (default: 3001)
    const HTTP_PORT = parseInt(process.env.PORT || '3001');
    const WS_PORT = parseInt(process.env.WEBSOCKET_PORT || '3002');
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const ANTHROPIC_MODEL_NAME = process.env.ANTHROPIC_MODEL_NAME || 'claude-3-7-sonnet-latest';
    
    if (!ANTHROPIC_API_KEY) {
      logger.error("ANTHROPIC_API_KEY is not set in environment variables");
      logger.error("Please ensure ANTHROPIC_API_KEY is set in your .env file");
      process.exit(1);
    }
    
    try {
      // Start HTTP server
      const actualPort = await startExpressServer(app, HTTP_PORT);
      logger.info(`HTTP server running on http://localhost:${actualPort}`);
      
      // Connect to the MCP server
      logger.info("Connecting to Sanity MCP server...")
      console.log("Connecting to MCP server...");
      
      // Initialize the MCP client - use exact reference implementation from Mastra.ai
      const mcpClient = new MastraMCPClient({
        name: "sanity-mcp",
        server: {
          command: "node",
          args: [mcpServerPath],
        },
      });
      
      try {
        // Connect to the MCP server
        await mcpClient.connect();
        console.log("Connected to MCP server successfully");
        
        // Enhanced logging after connection
        logger.info("=====================================")
        logger.info("✅ Connected to Sanity MCP server successfully!")
        logger.info("=====================================")
        
        // Get available tools
        console.log("Getting tools...");
        const toolFunctions = await mcpClient.tools();
        const numTools = Object.keys(toolFunctions).length;
        console.log(`========================================`);
        console.log(`Found ${numTools} tools from MCP server`);
        console.log(`========================================`);
        
        // Log all tool names for visibility
        console.log("Available tools:");
        Object.keys(toolFunctions).forEach((toolName, index) => {
          console.log(`${index + 1}. ${toolName}`);
        });
        console.log(`========================================`);
        
        logger.debug(`Available tools: ${numTools}`);
        Object.keys(toolFunctions).forEach((toolName) => {
          logger.debug(`  - ${toolName}`);
        });
        logger.info("=====================================");
        
        // Create a Mastra Agent - match the format expected by our Agent implementation
        console.log("Creating Sanity Mastra Agent...");
        const agent = new Agent({
          name: "SanityContentAssistant",
          systemMessage: `You are a helpful Content Management Assistant for Sanity.io.
Your goal is to help content editors manage their content efficiently and accurately.

CORE PRINCIPLES:
1. FOCUS ON WHAT THE USER IS CURRENTLY LOOKING AT - Always prioritize the user's current document focus
2. Be concise and helpful in your responses
3. When suggesting changes to content, explain your reasoning
4. For bulk operations, always show a plan and ask for confirmation before executing
5. If you're unsure about something, ask for clarification`,
          model: anthropic(ANTHROPIC_MODEL_NAME),
          // Create proper Tool instances
          tools: Object.entries(toolFunctions).map(([name, func]) => 
            new Tool({
              name,
              description: `MCP tool: ${name}`,
              parameters: {
                type: 'object',
                properties: {},
                required: []
              },
              handler: async (params) => func(params)
            })
          ),
        });
        console.log("Sanity Mastra Agent created");
        
        // Log agent initialization
        logger.info("=====================================")
        logger.info("✅ Sanity Mastra agent initialized")
        logger.info("=====================================")
        logger.info(`Agent model: ${ANTHROPIC_MODEL_NAME}`)
        logger.info("=====================================")
        
        // Start the WebSocket server on the fixed WS_PORT with no fallback
        console.log("Starting WebSocket server...");
        try {
          const { server: websocketServer, port: actualWsPort } = await startWebSocketServer(WS_PORT, agent);
          console.log(`WebSocket server running on port ${actualWsPort}`);
          
          logger.info("=====================================")
          logger.info("✅ WebSocket server started on port " + actualWsPort)
          logger.info("=====================================")
          logger.info("Server is ready for connections!")
          logger.info("=====================================")
          
          // Set up graceful shutdown
          const shutdown = async () => {
            logger.info("Shutting down gracefully...");
            
            // Disconnect MCP client
            try {
              await mcpClient.disconnect();
              logger.info("MCP client disconnected");
            } catch (err) {
              logger.error("Error disconnecting MCP client:", {
                error: err instanceof Error ? err.message : String(err),
              });
            }
            
            process.exit(0);
          };
          
          process.on('SIGINT', shutdown);
          process.on('SIGTERM', shutdown);
          
        } catch (wsError) {
          logger.error("Failed to start WebSocket server", {
            error: wsError instanceof Error ? wsError.message : String(wsError),
          });
          process.exit(1);
        }
        
      } catch (mcpError) {
        logger.error("Failed to connect to MCP server", {
          error: mcpError instanceof Error ? mcpError.message : String(mcpError),
        });
        process.exit(1);
      }
      
    } catch (serverError) {
      logger.error("Failed to start HTTP server", {
        error: serverError instanceof Error ? serverError.message : String(serverError),
      });
      process.exit(1);
    }
    
  } catch (error) {
    logger.error("Unexpected error during server startup", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Start the server
startServer().catch(error => {
  console.error("Failed to start server:", error);
  process.exit(1);
}); 