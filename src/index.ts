import express from "express"
import cors from "cors"
import * as dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs"
import { Agent } from "@mastra/core/agent"
import { MastraMCPClient } from "@mastra/mcp"
import { anthropic } from "@ai-sdk/anthropic"

import { MCPWebSocketServer } from "./server/websocketServer.js"

// Get __dirname equivalent in ESM
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
    console.log(`Loading environment from ${rootEnvPath}`)
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
      console.log(`Loading environment from ${envFile}`)
      dotenv.config({ path: envFile })
      return
    }
  }
  
  console.warn("No .env file found. Using environment variables from system.")
}

// Load environment variables
loadEnvironmentVariables()

// Server configuration
const HTTP_PORT = parseInt(process.env.PORT || "3001")
const WS_PORT = parseInt(process.env.WEBSOCKET_PORT || "3002")
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY environment variable is required")
  process.exit(1)
}

// Configure allowed origins for CORS
const getAllowedOrigins = () => {
  const origins = process.env.ALLOWED_ORIGINS
  if (origins) {
    return origins.split(",").map((origin) => origin.trim())
  }
  // Default to allow all origins in development mode
  return "*"
}

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
          console.log(`Server running at http://localhost:${currentPort}`)
          resolve(currentPort)
        })
        .on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`Port ${currentPort} is already in use.`)
            if (retriesLeft > 0) {
              const nextPort = currentPort + 1
              console.log(`Trying port ${nextPort}...`)
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
 * @param {Agent} agent - The agent to use
 * @param {number} maxRetries - Maximum number of alternative ports to try
 * @returns {Promise<{server: MCPWebSocketServer, port: number}>}
 */
const startWebSocketServer = async (port: number, agent: Agent, maxRetries = 5): Promise<{server: MCPWebSocketServer, port: number}> => {
  let currentPort = port
  let retriesLeft = maxRetries
  
  while (retriesLeft >= 0) {
    try {
      const websocketServer = new MCPWebSocketServer(currentPort, agent)
      console.log(`WebSocket server started on port ${currentPort}`)
      return { server: websocketServer, port: currentPort }
    } catch (error: any) {
      if (error.code === 'EADDRINUSE' && retriesLeft > 0) {
        console.warn(`WebSocket port ${currentPort} is already in use.`)
        currentPort++
        console.log(`Trying WebSocket port ${currentPort}...`)
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

async function startServer() {
  try {
    // Get node path and MCP server path from environment or use defaults
    const nodePath = process.execPath
    const mcpServerPath = process.env.SANITY_MCP_SERVER_PATH || "/Users/even/projects/sanity/ai/mcp/sanity-mcp-server/dist/index.js"
    
    console.log("=====================================")
    console.log("Starting Sanity MCP Agent server with stdio transport (ESM)")
    console.log("=====================================")
    console.log(`Node path: ${nodePath}`)
    console.log(`MCP server path: ${mcpServerPath}`)
    console.log("=====================================")
    
    // Initialize the MCP client using stdio transport without auth for local development
    const sanityMCPClient = new MastraMCPClient({
      name: "sanity-mcp",
      server: {
        command: nodePath,
        args: [mcpServerPath],
        // No authentication is needed for local stdio transport
      },
    })

    // Connect to the MCP server
    console.log("Connecting to Sanity MCP server via stdio...")
    await sanityMCPClient.connect()
    
    // Get available tools from the MCP server
    const sanityTools = await sanityMCPClient.tools()
    
    // Enhanced logging after connection
    console.log("=====================================")
    console.log("✅ Connected to Sanity MCP server successfully!")
    console.log("=====================================")
    console.log(`Available tools (${Object.keys(sanityTools).length}):`);
    Object.keys(sanityTools).forEach(toolName => {
      console.log(`  - ${toolName}`);
    });
    console.log("=====================================")
    
    // Check if we have critical tools available
    const criticalTools = ['getDocument', 'listDocuments'];
    const missingTools = criticalTools.filter(tool => !Object.keys(sanityTools).includes(tool));
    
    if (missingTools.length > 0) {
      console.warn("⚠️ WARNING: Missing critical tools:", missingTools.join(', '));
    } else {
      console.log("✅ All critical tools are available");
    }
    console.log("=====================================")
    
    // Create a Mastra Agent with access to Sanity tools
    const agent = new Agent({
      name: "SanityContentAssistant",
      instructions: `You are a helpful Content Management Assistant for Sanity.io.
Your goal is to help content editors manage their content efficiently and accurately.

CORE PRINCIPLES:
1. FOCUS ON WHAT THE USER IS CURRENTLY LOOKING AT - Always prioritize the user's current document focus
2. Be concise and helpful in your responses
3. When suggesting changes to content, explain your reasoning
4. For bulk operations, always show a plan and ask for confirmation before executing
5. If you're unsure about something, ask for clarification

You have access to Sanity CMS tools through an MCP server connection.
Use these tools to help the user manage their Sanity content.`,
      model: anthropic("claude-3-7-sonnet-latest"),
      // Provide the MCP tools to the agent
      tools: sanityTools
    })
    
    // Log agent initialization
    console.log("=====================================")
    console.log("✅ SanityContentAssistant agent initialized")
    console.log("=====================================")
    console.log(`Agent model: Claude 3.7 Sonnet`)
    console.log(`Agent tools: ${Object.keys(sanityTools).length} tools available`)
    console.log("=====================================")
    
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
          message: response.text || response.toString(),
        })
      } catch (error) {
        console.error("Error processing message:", error)
        res.status(500).json({
          error: "Failed to process message",
          details: (error as Error).message,
        })
      }
    })

    // Start the Express server with port fallback
    const actualHttpPort = await startExpressServer(app, HTTP_PORT)
    
    // Start the WebSocket server with the Mastra agent and port fallback
    const { server: websocketServer, port: actualWsPort } = await startWebSocketServer(WS_PORT, agent)
    
    // Log the actual ports being used
    console.log(`Server is running on:`);
    console.log(`- HTTP API: http://localhost:${actualHttpPort}`);
    console.log(`- WebSocket: ws://localhost:${actualWsPort}`);

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("Shutting down gracefully...")
      
      // Disconnect MCP client
      try {
        await sanityMCPClient.disconnect()
        console.log("MCP client disconnected")
      } catch (err) {
        console.error("Error disconnecting MCP client:", err)
      }
      
      process.exit(0)
    })
  } catch (error) {
    console.error("Failed to start server:", error)
    process.exit(1)
  }
}

startServer()