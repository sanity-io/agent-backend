/**
 * Main entry point for the Sanity MCP Agent server
 */

// Core imports
import express from "express"
import cors from "cors"
import * as dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs"

// Utility imports
import { createLogger, LogLevel } from "./utils/logger.js"
import { 
  normalizeError, 
  tryCatch, 
  ConnectionError 
} from "./utils/errorHandler.js"

// Print startup info for debugging
console.log("Starting server with Node.js version:", process.version);
console.log("Current working directory:", process.cwd());

// Use the SimpleMCPClient for a proper ESM implementation
import { SimpleMCPClient } from "./mcp/SimpleMCPClient.js";
import { SanityAgentAdapter } from "./langgraph/core/SanityAgentAdapter.js";

// Create logger
const logger = createLogger('Server', {
  level: process.env.MASTRA_LOG_LEVEL 
    ? (process.env.MASTRA_LOG_LEVEL.toLowerCase() === 'debug' ? LogLevel.DEBUG : LogLevel.INFO)
    : LogLevel.INFO
})

// Set up __dirname for ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Load environment variables from available .env files
 * Following ESM patterns for file loading
 */
const loadEnvironmentVariables = () => {
  // First try the root .env file
  const rootEnvPath = path.resolve(__dirname, "../.env")
  if (fs.existsSync(rootEnvPath)) {
    logger.info(`Loading environment from ${rootEnvPath}`)
    dotenv.config({ path: rootEnvPath })
    return
  }
  
  // If not found, try alternatives in config/environments
  const envFiles = [
    path.resolve(__dirname, "../config/environments/.env"),
    path.resolve(__dirname, "../config/environments/.env.development"),
    path.resolve(__dirname, "../config/environments/.env.production")
  ]
  
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      logger.info(`Loading environment from ${envFile}`)
      dotenv.config({ path: envFile })
      return
    }
  }
  
  logger.warn("No .env file found. Using environment variables from system.")
}

// Load environment variables
loadEnvironmentVariables()

// Server configuration
const HTTP_PORT = parseInt(process.env.PORT || "3005") // Use 3005 as default for HTTP
const WS_PORT = parseInt(process.env.WEBSOCKET_PORT || "3002") // Keep WebSocket on 3002
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

console.log("Environment variables loaded:");
console.log("- HTTP_PORT:", HTTP_PORT);
console.log("- WS_PORT:", WS_PORT);
console.log("- ANTHROPIC_API_KEY:", ANTHROPIC_API_KEY ? "Set" : "Not set");

if (!ANTHROPIC_API_KEY) {
  logger.error("ANTHROPIC_API_KEY environment variable is required")
  process.exit(1)
}

// Configure allowed origins for CORS
const getAllowedOrigins = () => {
  const origins = process.env.ALLOWED_ORIGINS
  if (origins) {
    return origins.split(",").map((origin) => origin.trim())
  }
  // Default to allow all origins in development mode
  logger.warn("No ALLOWED_ORIGINS specified, defaulting to allow all origins (*)")
  return "*"
}

// Set up global error handlers
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  try {
    logger.fatal('Uncaught exception in server', { 
      error: normalizeError(error)
    })
  } catch (logError) {
    console.error('Error while handling uncaught exception:', logError)
    console.error('Original error:', error)
  }
  // Always exit on uncaught exceptions
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  try {
    const errorInfo = reason instanceof Error 
      ? { message: reason.message, stack: reason.stack, name: reason.name }
      : { message: String(reason) }
      
    logger.error('Unhandled promise rejection', { error: errorInfo })
  } catch (logError) {
    console.error('Error handling unhandled rejection:', logError)
    console.error('Original rejection reason:', reason)
  }
})

/**
 * Attempt to start a server on a port, with automatic fallback to next port if busy
 * @param {Express.Application} app - The Express app
 * @param {number} port - The port to attempt to use
 * @param {number} maxRetries - Maximum number of alternative ports to try
 * @returns {Promise<number>} - The port the server started on
 */
const startExpressServer = (app: express.Application, port: number, maxRetries = 5): Promise<number> => {
  return new Promise((resolve, reject) => {
    const tryPort = (currentPort: number, retriesLeft: number) => {
      const server = app.listen(currentPort)
        .on('listening', () => {
          logger.info(`Server running at http://localhost:${currentPort}`)
          resolve(currentPort)
        })
        .on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            logger.warn(`Port ${currentPort} is already in use.`)
            if (retriesLeft > 0) {
              const nextPort = currentPort + 1
              logger.info(`Trying port ${nextPort}...`)
              server.close()
              tryPort(nextPort, retriesLeft - 1)
            } else {
              reject(new Error(`Failed to find an available port after ${maxRetries} attempts.`))
            }
          } else {
            reject(err)
          }
        })
    }
    
    tryPort(port, maxRetries)
  })
}

/**
 * Start a WebSocket server on a specific port
 * @param {number} port - The port to use (no fallback)
 * @param {SanityAgentAdapter} agent - The agent to use
 * @returns {Promise<{server: any, port: number}>}
 */
const startWebSocketServer = async (port: number, agent: any): Promise<{server: any, port: number}> => {
  try {
    // Dynamic import to avoid issues
    const { LangGraphWebSocketServer } = await import("./server/langGraphWebSocketServer.js");
    const websocketServer = new LangGraphWebSocketServer(port, agent);
    logger.info(`WebSocket server started on port ${port}`);
    return { server: websocketServer, port };
  } catch (error: any) {
    console.error('Error starting WebSocket server:', error);
    throw error;
  }
}

/**
 * Main server startup function
 */
async function startServer() {
  try {
    console.log("=== Starting Sanity MCP Agent server ===");
    logger.info('Starting Sanity MCP Agent server...')
    
    // Get MCP server path from environment or use the default in SimpleMCPClient
    const mcpServerPath = process.env.SANITY_MCP_SERVER_PATH;
    console.log("MCP server path:", mcpServerPath || "Using default path");
    
    logger.info("=====================================")
    logger.info("Starting Sanity MCP Agent server")
    logger.info("=====================================")
    logger.info(`Node path: ${process.execPath}`)
    if (mcpServerPath) {
      logger.info(`MCP server path: ${mcpServerPath}`)
    } else {
      logger.info("Using default MCP server path")
    }
    logger.info("=====================================")
    
    try {
      // Initialize the MCP client using our simple implementation
      console.log("Creating SimpleMCPClient instance...");
      const simpleMCPClient = new SimpleMCPClient({
        serverPath: mcpServerPath,
      });
      console.log("SimpleMCPClient instance created");

      // Connect to the MCP server
      logger.info("Connecting to Sanity MCP server...")
      console.log("Connecting to MCP server...");
      await simpleMCPClient.connect();
      console.log("Connected to MCP server successfully");
      
      // Enhanced logging after connection
      logger.info("=====================================")
      logger.info("✅ Connected to Sanity MCP server successfully!")
      logger.info("=====================================")
      
      console.log("Getting tools...");
      const tools = simpleMCPClient.getTools();
      console.log(`Got ${tools.length} tools from MCP server`);
      
      logger.debug(`Available tools: ${tools.length}`);
      tools.forEach((tool) => {
        logger.debug(`  - ${tool.name}: ${tool.description || 'No description'}`);
      });
      logger.info("=====================================")
      
      // Create a LangGraph agent adapter
      console.log("Creating SanityAgentAdapter instance...");
      const agent = new SanityAgentAdapter(ANTHROPIC_API_KEY!, simpleMCPClient);
      console.log("SanityAgentAdapter instance created");
      
      // Initialize the agent
      console.log("Initializing agent...");
      await agent.initialize();
      console.log("Agent initialized successfully");
      
      // Log agent initialization
      logger.info("=====================================")
      logger.info("✅ Sanity LangGraph agent initialized")
      logger.info("=====================================")
      logger.info(`Agent model: Claude 3.7 Sonnet`)
      logger.info(`Agent tools: ${agent.getTools().length} tools available`)
      logger.info("=====================================")
      
      // Start the WebSocket server on the fixed WS_PORT with no fallback
      console.log("Starting WebSocket server...");
      try {
        const { server: websocketServer, port: actualWsPort } = await startWebSocketServer(WS_PORT, agent);
        console.log(`WebSocket server running on port ${actualWsPort}`);
      
        // Create Express server for REST API
        console.log("Creating Express server...");
        const app = express();

        // Configure CORS
        app.use(
          cors({
            origin: getAllowedOrigins(),
            methods: ["GET", "POST", "OPTIONS"],
            allowedHeaders: ["Content-Type", "Authorization"],
          })
        );

        // Route for health check
        app.get("/health", (req, res) => {
          res.json({ status: "healthy", message: "Sanity MCP agent server is running" });
        });

        // Process messages from the REST API endpoint
        app.post("/api/chat", express.json(), async (req, res) => {
          try {
            const { content } = req.body;

            if (!content) {
              return res.status(400).json({ error: "Message content is required" });
            }

            // Process the message through the agent
            const response = await agent.generate(content);

            // Return the agent's response
            res.json({
              message: response,
            });
          } catch (error) {
            logger.error("Error processing message:", {
              error: error instanceof Error ? error.message : String(error)
            });
            res.status(500).json({
              error: "Failed to process message",
              details: error instanceof Error ? error.message : "Unknown error",
            });
          }
        });

        // Start the Express server on a different port range with fallback
        console.log("Starting Express server...");
        const actualHttpPort = await startExpressServer(app, HTTP_PORT);
        console.log(`Express server running on port ${actualHttpPort}`);
        
        // Log the actual ports being used
        logger.info(`Server is running on:`);
        logger.info(`- HTTP API: http://localhost:${actualHttpPort}`);
        logger.info(`- WebSocket: ws://localhost:${actualWsPort}`);

        // Handle graceful shutdown
        process.on("SIGINT", async () => {
          logger.info("Shutting down gracefully...");
          
          // Disconnect MCP client
          try {
            await simpleMCPClient.disconnect();
            logger.info("MCP client disconnected");
          } catch (err) {
            logger.error("Error disconnecting MCP client:", {
              error: err instanceof Error ? err.message : String(err)
            });
          }
          
          process.exit(0);
        });
      } catch (wsError) {
        logger.error("Failed to start WebSocket server on the required port. Aborting startup.", {
          error: wsError instanceof Error ? wsError.message : String(wsError)
        });
        throw new Error(`WebSocket server failed to start on port ${WS_PORT}. This port is required for operation.`);
      }
    } catch (error) {
      console.error("Error in server initialization:", error);
      throw error;
    }
  } catch (error) {
    console.error("FATAL ERROR:", error);
    logger.fatal("Failed to start server:", {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : String(error)
    });
    process.exit(1);
  }
}

// Start the server
console.log("Calling startServer()");
startServer().catch(error => {
  console.error("FATAL STARTUP ERROR:", error);
  logger.fatal("Fatal error during server startup:", {
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : String(error)
  });
  process.exit(1);
});