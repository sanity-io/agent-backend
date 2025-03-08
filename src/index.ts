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

// LangGraph imports
import { LangChainMCP } from "./mcp/LangChainMCP.js"
import { SanityAgentAdapter } from "./langgraph/core/SanityAgentAdapter.js"

// WebSocket server
import { LangGraphWebSocketServer } from "./server/langGraphWebSocketServer.js"

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
const HTTP_PORT = parseInt(process.env.PORT || "3001")
const WS_PORT = parseInt(process.env.WEBSOCKET_PORT || "3002")
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

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
 * Start a WebSocket server with port fallback
 * @param {number} port - The port to attempt to use
 * @param {SanityAgentAdapter} agent - The agent to use
 * @param {number} maxRetries - Maximum number of alternative ports to try
 * @returns {Promise<{server: LangGraphWebSocketServer, port: number}>}
 */
const startWebSocketServer = async (port: number, agent: SanityAgentAdapter, maxRetries = 5): Promise<{server: LangGraphWebSocketServer, port: number}> => {
  let currentPort = port
  let retriesLeft = maxRetries
  
  while (retriesLeft >= 0) {
    try {
      const websocketServer = new LangGraphWebSocketServer(currentPort, agent)
      logger.info(`WebSocket server started on port ${currentPort}`)
      return { server: websocketServer, port: currentPort }
    } catch (error: any) {
      if (error.code === 'EADDRINUSE' && retriesLeft > 0) {
        logger.warn(`WebSocket port ${currentPort} is already in use.`)
        currentPort++
        logger.info(`Trying WebSocket port ${currentPort}...`)
        retriesLeft--
      } else {
        if (retriesLeft <= 0) {
          throw new Error(`Failed to find an available WebSocket port after ${maxRetries} attempts.`)
        } else {
          throw error
        }
      }
    }
  }
  
  // This should never be reached due to the while loop and error throwing
  throw new Error("Failed to start WebSocket server")
}

/**
 * Main server startup function
 */
async function startServer() {
  try {
    logger.info('Starting Sanity MCP Agent server...')
    
    // Get MCP server path from environment or use the default in LangChainMCP
    const mcpServerPath = process.env.SANITY_MCP_SERVER_PATH;
    
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
    
    // Initialize the MCP client using langchain-mcp-adapters
    const langchainMCP = new LangChainMCP({
      serverPath: mcpServerPath,
    })

    // Connect to the MCP server
    logger.info("Connecting to Sanity MCP server...")
    await langchainMCP.connect()
    
    // Enhanced logging after connection
    logger.info("=====================================")
    logger.info("✅ Connected to Sanity MCP server successfully!")
    logger.info("=====================================")
    logger.debug(`Available tools: ${langchainMCP.getTools().length}`);
    langchainMCP.getTools().forEach(tool => {
      logger.debug(`  - ${tool.name}: ${tool.description}`);
    });
    logger.info("=====================================")
    
    // Create a LangGraph agent adapter
    const agent = new SanityAgentAdapter(ANTHROPIC_API_KEY!, langchainMCP);
    
    // Initialize the agent
    await agent.initialize();
    
    // Log agent initialization
    logger.info("=====================================")
    logger.info("✅ Sanity LangGraph agent initialized")
    logger.info("=====================================")
    logger.info(`Agent model: Claude 3.7 Sonnet`)
    logger.info(`Agent tools: ${agent.getTools().length} tools available`)
    logger.info("=====================================")
    
    // Create Express server for REST API
    const app = express()

    // Configure CORS
    app.use(
      cors({
        origin: getAllowedOrigins(),
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    )

    // Route for health check
    app.get("/health", (req, res) => {
      res.json({ status: "healthy", message: "Sanity MCP agent server is running" })
    })

    // Process messages from the REST API endpoint
    app.post("/api/chat", express.json(), async (req, res) => {
      try {
        const { content } = req.body

        if (!content) {
          return res.status(400).json({ error: "Message content is required" })
        }

        // Process the message through the agent
        const response = await agent.generate(content)

        // Return the agent's response
        res.json({
          message: response,
        })
      } catch (error) {
        logger.error("Error processing message:", {
          error: error instanceof Error ? error.message : String(error)
        });
        res.status(500).json({
          error: "Failed to process message",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    })

    // Start the Express server with port fallback
    const actualHttpPort = await startExpressServer(app, HTTP_PORT)
    
    // Start the WebSocket server with the LangGraph agent and port fallback
    const { server: websocketServer, port: actualWsPort } = await startWebSocketServer(WS_PORT, agent)
    
    // Log the actual ports being used
    logger.info(`Server is running on:`);
    logger.info(`- HTTP API: http://localhost:${actualHttpPort}`);
    logger.info(`- WebSocket: ws://localhost:${actualWsPort}`);

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      logger.info("Shutting down gracefully...")
      
      // Disconnect MCP client
      try {
        await langchainMCP.disconnect()
        logger.info("MCP client disconnected")
      } catch (err) {
        logger.error("Error disconnecting MCP client:", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
      
      process.exit(0)
    })
  } catch (error) {
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
startServer().catch(error => {
  logger.fatal("Fatal error during server startup:", {
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : String(error)
  });
  process.exit(1);
});