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

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../.env") })

// If .env not found in root, try looking in config/environments
if (!process.env.SANITY_PROJECT_ID) {
  const envFiles = [
    path.resolve(__dirname, "../config/environments/.env"),
    path.resolve(__dirname, "../config/environments/.env.development"),
    path.resolve(__dirname, "../config/environments/.env.production")
  ]
  
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      console.log(`Loading environment from ${envFile}`)
      dotenv.config({ path: envFile })
      break
    }
  }
}

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

    // Start the Express server
    app.listen(HTTP_PORT, () => {
      console.log(`Server running at http://localhost:${HTTP_PORT}`)
    })

    // Start the WebSocket server with the Mastra agent
    const websocketServer = new MCPWebSocketServer(WS_PORT, agent)
    console.log(`WebSocket server started on port ${WS_PORT}`)

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