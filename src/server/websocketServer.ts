import { WebSocket, WebSocketServer } from "ws"
import { Agent } from "@mastra/core/agent"
import { createLogger } from "../utils/logger.js"
import { tryCatch, normalizeError, ConnectionError, isRecoverableConnectionError } from "../utils/errorHandler.js"

// Create a logger for the WebSocket server
const logger = createLogger('WebSocketServer');

// Define document reference interface (metadata only, no content)
export interface DocumentReference {
  id: string;
  type?: string;
  title?: string;
  path?: string; // Optional path within the document (for field-level context)
  lastModified?: string;
}

// Define state interface
export interface MCPAgentState {
  // Current document selection with metadata (no content)
  currentSelection: DocumentReference[];
  
  // Last known user focus (document and path)
  userFocus: {
    documentId?: string;
    path?: string;
    lastUpdated?: string;
    lastQueryAnswered?: string; // Type of last query explicitly answered
  };
  
  // Session information
  session: {
    id: string;
    startedAt: string;
    lastActivity: string;
  };
}

// Maximum number of documents to keep in selection
const MAX_DOCUMENTS = 10;

// Maximum reconnection attempts
const MAX_RECONNECT_ATTEMPTS = 3;

// Reconnection delay in ms (exponential backoff)
const RECONNECT_BASE_DELAY = 1000;

// Define message types for communication
export type MessageType =
  | "user_message" // User's chat message
  | "agent_message" // Agent's response
  | "document_set_update" // Update to relevant document set
  | "document_focus" // User's focus on a specific document/field
  | "thinking_state" // Agent is processing/thinking about something
  | "error" // Error message
  | "ping" // Heartbeat ping
  | "pong" // Heartbeat pong
  | "reconnect" // Client reconnection with session info

// Define WebSocket message interface
export interface WebSocketMessage {
  type: MessageType
  payload: Record<string, any>
  requestId?: string // For correlation if needed
  sessionId?: string // For reconnection support
}

// Client interface with metadata
interface Client {
  ws: WebSocket
  id: string
  sessionId?: string
  lastActive: number
  isAlive: boolean
  reconnectAttempts?: number
}

// State preservation by session ID (for reconnection)
interface SessionState {
  agentState: MCPAgentState
  lastClientId?: string
  createdAt: Date
  lastActive: Date
}

// Main WebSocket server class
export class MCPWebSocketServer {
  private server: WebSocketServer
  private clients: Map<string, Client> = new Map()
  private agent: Agent
  private agentState: MCPAgentState = {
    currentSelection: [],
    userFocus: {},
    session: {
      id: `session-${Date.now()}`,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    },
  }
  
  // Session tracking for reconnection support
  private sessions: Map<string, SessionState> = new Map()
  
  // Heartbeat interval (ms) - 30 seconds
  private readonly HEARTBEAT_INTERVAL = 30000
  
  // Session expiry (ms) - 1 hour
  private readonly SESSION_EXPIRY = 60 * 60 * 1000

  constructor(port: number, agent: Agent) {
    this.agent = agent
    
    try {
      // Initialize with error handling
      logger.info(`Starting WebSocket server on port ${port}`)
      this.server = new WebSocketServer({ port })
    
      this.setupServerHandlers()
      this.setupHeartbeat()
      
      logger.info(`WebSocket server started on port ${port}`)
    } catch (error) {
      const normalizedError = normalizeError(error);
      logger.error(`Failed to initialize WebSocket server on port ${port}`, { error: normalizedError });
      
      // Re-throw connection errors so they can be handled at a higher level
      if (normalizedError.code === 'EADDRINUSE') {
        throw new ConnectionError(`Port ${port} is already in use, try another port.`, {
          code: 'PORT_IN_USE',
          details: { port },
          cause: error instanceof Error ? error : undefined 
        });
      }
      
      throw normalizedError;
    }
  }

  private setupServerHandlers() {
    // Set up monitoring for connection events
    this.server.on("listening", () => {
      logger.info("WebSocket server is listening for connections")
    });

    this.server.on("error", (error) => {
      const normalizedError = normalizeError(error);
      logger.error("WebSocket server error", { error: normalizedError })
      
      // Try to recover from certain errors
      if (isRecoverableConnectionError(error)) {
        logger.warn("Attempting to recover from WebSocket server error")
        
        // For recoverable errors, we could implement server-level recovery here
        // For example, restart the server on a different port
      }
    });

    // Track and log client connections
    let connectionCount = 0;
    const logConnectionStatus = () => {
      logger.debug(`Current WebSocket clients: ${this.clients.size}`)
    };

    // Set up interval to log connection count every 30 seconds
    const connectionStatusInterval = setInterval(logConnectionStatus, 30000);
    
    // Clean up intervals on process exit
    process.on("SIGINT", () => {
      clearInterval(connectionStatusInterval);
      logger.info("WebSocket server shutting down due to SIGINT")
    });

    this.server.on("connection", (ws: WebSocket) => {
      // Generate a unique client ID
      const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

      // Store the client with active status
      this.clients.set(clientId, { 
        ws, 
        id: clientId, 
        lastActive: Date.now(),
        isAlive: true,
        reconnectAttempts: 0
      })

      connectionCount++;
      logger.info(`Client connected: ${clientId} (Total: ${connectionCount})`)

      // Send initial state (if any)
      this.sendAgentState(clientId)

      // Set up message handler
      ws.on("message", tryCatch(async (data: string) => {
        const parsedMessage = JSON.parse(data) as WebSocketMessage
        
        // Update client's last activity time
        const client = this.clients.get(clientId)
        if (client) {
          client.lastActive = Date.now()
          
          // If this is a reconnection request with sessionId
          if (parsedMessage.type === 'reconnect' && parsedMessage.sessionId) {
            this.handleReconnection(clientId, parsedMessage.sessionId)
          }
          // If this is a pong response to our heartbeat
          else if (parsedMessage.type === 'pong') {
            client.isAlive = true
            logger.debug(`Heartbeat received from client ${clientId}`)
          }
          // Regular message handling
          else {
            this.handleClientMessage(clientId, parsedMessage)
          }
        }
      }, {
        context: `message handling for client ${clientId}`,
        onError: (error) => {
          // Create a properly typed context object for logging
          const context: Record<string, any> = {
            clientId,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorName: error instanceof Error ? error.name : 'UnknownError'
          };
          
          if (error instanceof Error && error.stack) {
            context.errorStack = error.stack;
          }
          
          logger.error(`Failed to process message from ${clientId}`, context);
          
          this.sendToClient(clientId, {
            type: "error",
            payload: { 
              message: "Failed to process your message",
              code: normalizeError(error).code
            }
          })
        }
      }))

      // Handle disconnection
      ws.on("close", (code, reason) => {
        connectionCount--;
        const client = this.clients.get(clientId)
        
        // Log close event with details
        logger.info(`Client disconnected: ${clientId} (Remaining: ${connectionCount})`, {
          closeCode: code,
          closeReason: reason.toString(),
          sessionId: client?.sessionId
        })
        
        // Preserve session state if client had a session
        if (client && client.sessionId) {
          this.preserveSessionState(clientId, client.sessionId)
        }
        
        this.clients.delete(clientId)
      })

      // Handle errors
      ws.on("error", (error) => {
        const normalizedError = normalizeError(error);
        logger.error(`WebSocket error for client ${clientId}`, { error: normalizedError })
        
        // Try to handle recoverable errors
        if (isRecoverableConnectionError(error)) {
          this.attemptClientRecovery(clientId, normalizedError)
        }
      })
    })
  }

  private handleClientMessage(clientId: string, message: WebSocketMessage) {
    // Log message with timestamp
    const timestamp = new Date().toISOString();
    logger.debug(`[${timestamp}] Message from ${clientId}: type=${message.type}`)

    switch (message.type) {
      case "user_message":
        const content = message.payload.content || "";
        // Log content preview (truncated for privacy/readability)
        const preview = content.length > 50 ? `${content.substring(0, 50)}...` : content;
        logger.info(`User message: "${preview}"`);
        this.handleUserMessage(clientId, content, message.requestId)
        break

      case "document_focus":
        logger.info(`Document focus: ${message.payload.documentId} path=${message.payload.path || 'none'}`);
        this.handleDocumentFocus(
          message.payload.documentId,
          message.payload.path,
          message.requestId
        )
        break

      default:
        logger.warn(`Unknown message type: ${message.type}`)
        this.sendToClient(clientId, {
          type: "error",
          payload: { message: `Unsupported message type: ${message.type}` },
          requestId: message.requestId
        })
    }
  }

  private async handleUserMessage(clientId: string, content: string, requestId?: string) {
    logger.info(`Processing user message from ${clientId}`)

    // Get client for session management
    const client = this.clients.get(clientId)
    
    // Create a session ID for this client if they don't have one
    if (client && !client.sessionId) {
      client.sessionId = `session-${Date.now()}`
      
      // Update agent state with session info
      this.agentState.session = {
        id: client.sessionId,
        startedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      }
    }
    
    try {
      // Update agent state
      this.agentState.session.lastActivity = new Date().toISOString()
      
      // Preserve session state
      if (client?.sessionId) {
        this.preserveSessionState(clientId, client.sessionId)
      }
      
      // Send "thinking" state to client
      this.sendToClient(clientId, {
        type: "thinking_state",
        payload: { state: "processing" },
        requestId
      })

      // Process the message with the AI agent - this might take some time
      const response = await this.agent.generate(content)

      // Extract the response text and format appropriately
      const responseText = response.text || response.toString()

      // Send the agent's response back to the client
      this.sendToClient(clientId, {
        type: "agent_message",
        payload: { message: responseText },
        requestId
      })

      // Update agent state
      this.agentState.session.lastActivity = new Date().toISOString()
      
      // Preserve updated session state after response
      if (client?.sessionId) {
        this.preserveSessionState(clientId, client.sessionId)
      }
    } catch (error) {
      // Create a properly typed context object for logging
      const errorContext: Record<string, any> = {
        clientId,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'UnknownError'
      };
      
      if (error instanceof Error && error.stack) {
        errorContext.errorStack = error.stack;
      }
      
      logger.error("Error processing user message:", errorContext);
      
      this.sendToClient(clientId, {
        type: "error",
        payload: { message: "Failed to process your message" },
        requestId
      })
    }
  }
  
  private handleDocumentFocus(documentId: string, path?: string, requestId?: string) {
    logger.info(`Document focus changed: ${documentId}, path: ${path}`);
    
    // Update user focus
    this.agentState.userFocus = {
      documentId,
      path,
      lastUpdated: new Date().toISOString()
    };
    
    // Broadcast thinking state to all clients immediately
    this.broadcast({
      type: "thinking_state",
      payload: {
        documentId,
        action: "analyzing_document",
        message: `Processing document: ${documentId}`
      }
    });
    
    // Check if the document is already in the selection
    let inSelection = this.agentState.currentSelection.some(doc => doc.id === documentId);
    
    // Add to selection if not already present
    if (!inSelection && documentId) {
      // Add document reference to selection
      const now = new Date().toISOString();
      this.agentState.currentSelection.unshift({
        id: documentId,
        path,
        lastModified: now
      });
      
      // Limit selection size
      if (this.agentState.currentSelection.length > MAX_DOCUMENTS) {
        this.agentState.currentSelection = this.agentState.currentSelection.slice(0, MAX_DOCUMENTS);
      }
      
      // Broadcast updated document set
      this.broadcastDocumentSet();
    } else if (inSelection) {
      // Update existing document reference
      const docIndex = this.agentState.currentSelection.findIndex(doc => doc.id === documentId);
      if (docIndex >= 0) {
        // Get the document reference
        const doc = this.agentState.currentSelection[docIndex];
        
        // Update path and last modified time
        doc.path = path;
        doc.lastModified = new Date().toISOString();
        
        // Move to front of list (most recent)
        this.agentState.currentSelection.splice(docIndex, 1);
        this.agentState.currentSelection.unshift(doc);
        
        // Broadcast updated document set
        this.broadcastDocumentSet();
      }
    }
    
    // Simulate completed analysis
    setTimeout(() => {
      this.broadcast({
        type: "thinking_state",
        payload: {
          documentId,
          action: "completed",
          message: `Finished processing document: ${documentId}`
        }
      });
    }, 1500);
    
    // Update session information
    this.agentState.session.lastActivity = new Date().toISOString();
  }

  private sendAgentState(clientId: string) {
    const client = this.clients.get(clientId)
    
    // Include session information with state updates
    const sessionInfo = client?.sessionId ? {
      id: client.sessionId,
      lastActivity: new Date().toISOString()
    } : this.agentState.session

    // Send document set if available
    if (this.agentState.currentSelection.length > 0) {
      this.sendToClient(clientId, {
        type: "document_set_update",
        payload: {
          documents: this.agentState.currentSelection.map(doc => ({
            id: doc.id,
            title: doc.title || doc.id,
            type: doc.type,
            lastModified: doc.lastModified
          })),
          session: sessionInfo
        },
      })
    } else {
      // Even if no documents, send session info to ensure client has it
      this.sendToClient(clientId, {
        type: "document_set_update",
        payload: {
          documents: [],
          session: sessionInfo
        },
      })
    }
  }

  private sendToClient(clientId: string, message: WebSocketMessage) {
    const client = this.clients.get(clientId)
    if (!client) return

    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message))
    }
  }

  public broadcast(message: WebSocketMessage) {
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message))
      }
    })
  }

  // Method to broadcast document set updates to all clients
  public broadcastDocumentSet() {
    // Always broadcast even if there are no documents, to ensure session info is sent
    this.broadcast({
      type: "document_set_update",
      payload: {
        documents: this.agentState.currentSelection.map(doc => ({
          id: doc.id,
          title: doc.title || doc.id,
          type: doc.type,
          lastModified: doc.lastModified
        })),
        session: this.agentState.session
      },
    });
  }

  /**
   * Set up heartbeat mechanism to detect dead connections
   */
  private setupHeartbeat() {
    setInterval(() => {
      this.clients.forEach((client, clientId) => {
        // Mark client as possibly terminated
        if (!client.isAlive) {
          logger.warn(`Client ${clientId} failed heartbeat check - terminating connection`)
          client.ws.terminate()
          this.clients.delete(clientId)
          return
        }
        
        // Reset alive status to false - client must respond with pong to stay alive
        client.isAlive = false
        
        // Send ping heartbeat
        tryCatch(() => {
          this.sendToClient(clientId, {
            type: 'ping',
            payload: { timestamp: Date.now() }
          })
        }, {
          context: `heartbeat for client ${clientId}`,
          logError: true,
          rethrow: false
        })()
      })
      
      // Clean up expired sessions
      this.cleanupExpiredSessions()
    }, this.HEARTBEAT_INTERVAL)
  }
  
  /**
   * Handle client reconnection request
   * @param clientId - New client ID
   * @param sessionId - Previous session ID for state recovery
   */
  private handleReconnection(clientId: string, sessionId: string) {
    const session = this.sessions.get(sessionId)
    const client = this.clients.get(clientId)
    
    if (session && client) {
      logger.info(`Client ${clientId} reconnected to session ${sessionId}`)
      
      // Restore session state 
      this.agentState = {...session.agentState}
      
      // Update client with session info
      client.sessionId = sessionId
      
      // Update session tracking
      session.lastActive = new Date()
      session.lastClientId = clientId
      
      // Send restored state to client
      this.sendAgentState(clientId)
      
      // Notify client of successful reconnection
      this.sendToClient(clientId, {
        type: 'agent_message',
        payload: { 
          message: "Reconnected successfully. Your previous conversation state has been restored.",
          sessionRestored: true
        }
      })
    } else {
      logger.info(`Client ${clientId} attempted reconnection with invalid session ${sessionId}`)
      
      // Generate a new session for this client
      const newSessionId = `session-${Date.now()}`
      if (client) {
        client.sessionId = newSessionId
      }
      
      // Reset agent state for new session
      this.agentState = {
        currentSelection: [],
        userFocus: {},
        session: {
          id: newSessionId,
          startedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
        },
      }
      
      // Create new session record
      this.preserveSessionState(clientId, newSessionId)
      
      // Send new session info
      this.sendAgentState(clientId)
      
      // Notify client that reconnection failed but new session was created
      this.sendToClient(clientId, {
        type: 'agent_message',
        payload: { 
          message: "Your previous session could not be found. A new session has been created.",
          sessionRestored: false,
          newSessionId: newSessionId
        }
      })
    }
  }
  
  /**
   * Preserve client state in session storage for future reconnection
   */
  private preserveSessionState(clientId: string, sessionId: string) {
    const client = this.clients.get(clientId)
    if (!client) return
    
    this.sessions.set(sessionId, {
      agentState: {...this.agentState},
      lastClientId: clientId,
      createdAt: new Date(),
      lastActive: new Date()
    })
    
    logger.info(`Session state preserved for client ${clientId} with session ID ${sessionId}`)
  }
  
  /**
   * Clean up expired sessions to prevent memory leaks
   */
  private cleanupExpiredSessions() {
    const now = Date.now()
    let expiredCount = 0
    
    this.sessions.forEach((session, sessionId) => {
      const sessionAge = now - session.lastActive.getTime()
      if (sessionAge > this.SESSION_EXPIRY) {
        this.sessions.delete(sessionId)
        expiredCount++
      }
    })
    
    if (expiredCount > 0) {
      logger.info(`Cleaned up ${expiredCount} expired sessions. Current active sessions: ${this.sessions.size}`)
    }
  }

  /**
   * Attempt recovery for a client connection
   */
  private attemptClientRecovery(clientId: string, error: Error) {
    const client = this.clients.get(clientId)
    if (!client) return
    
    // Track reconnection attempts
    client.reconnectAttempts = (client.reconnectAttempts || 0) + 1
    
    if (client.reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      logger.info(`Attempting to recover client ${clientId} (Attempt ${client.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)
      
      // For WebSocket client errors, we can't force reconnection from server side
      // But we can clean up resources and prepare for potential client reconnection
      
      // Preserve session state for later reconnection
      if (client.sessionId) {
        this.preserveSessionState(clientId, client.sessionId)
        logger.info(`Session state preserved for client ${clientId} to allow reconnection`)
      }
      
      // Close the connection cleanly if it's still open
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          // Tell client we want it to reconnect
          this.sendToClient(clientId, {
            type: "error",
            payload: { 
              message: "Connection error detected, please reconnect",
              code: "CONNECTION_ERROR",
              reconnect: true,
              sessionId: client.sessionId,
              delay: RECONNECT_BASE_DELAY * client.reconnectAttempts
            }
          })
          
          // Close the connection with a code suggesting reconnection
          client.ws.close(1006, "Connection error - please reconnect")
        } catch (closeError) {
          logger.error(`Error closing WebSocket for client ${clientId}`, { error: closeError })
        }
      }
    } else {
      logger.warn(`Client ${clientId} exceeded maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS})`)
      // Remove the client after max attempts
      this.clients.delete(clientId)
    }
  }
}
