/**
 * WebSocket server implementation using LangGraph instead of Mastra
 */
import { WebSocket, WebSocketServer } from "ws";
import { SanityAgentAdapter } from "../langgraph/core/SanityAgentAdapter.js";
import { createLogger } from "../utils/logger.js";
import { tryCatch, normalizeError, ConnectionError, isRecoverableConnectionError } from "../utils/errorHandler.js";
import { SanityAgentState } from "../langgraph/state/types.js";

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

// Define WebSocket state interface (simplified from SanityAgentState)
export interface WebSocketState {
  // Current document selection with metadata (no content)
  currentSelection: DocumentReference[];
  
  // Last known user focus (document and path)
  userFocus: {
    documentId?: string;
    path?: string;
    lastUpdated?: string;
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
  agentState: SanityAgentState;
  lastClientId?: string;
  createdAt: Date;
  lastActive: Date;
}

/**
 * WebSocket server for Sanity MCP Agent that uses LangGraph
 */
export class LangGraphWebSocketServer {
  private server: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private agent: SanityAgentAdapter;
  private agentState: WebSocketState;
  
  // Session tracking for reconnection support
  private sessions: Map<string, SessionState> = new Map();
  
  // Heartbeat interval (ms) - 30 seconds
  private readonly HEARTBEAT_INTERVAL = 30000;
  
  // Session expiry (ms) - 1 hour
  private readonly SESSION_EXPIRY = 60 * 60 * 1000;

  /**
   * Create a new WebSocket server
   * @param port Port to listen on
   * @param agent The agent to use for generating responses
   */
  constructor(port: number, agent: SanityAgentAdapter) {
    this.agent = agent;
    
    // Initialize state
    this.agentState = {
      currentSelection: [],
      userFocus: {},
      session: {
        id: `session-${Date.now()}`,
        startedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      },
    };
    
    try {
      // Initialize with error handling
      logger.info(`Starting WebSocket server on port ${port}`);
      this.server = new WebSocketServer({ port });
    
      this.setupServerHandlers();
      this.setupHeartbeat();
      
      // Schedule regular session cleanup
      setInterval(() => this.cleanupExpiredSessions(), this.SESSION_EXPIRY);
      
      // Log connected clients every 10 seconds for debugging
      setInterval(() => {
        const connectedClients = Array.from(this.clients.entries()).map(([id, client]) => ({
          id,
          sessionId: client.sessionId || 'none',
          lastActive: new Date(client.lastActive).toISOString(),
          isAlive: client.isAlive,
          readyState: client.ws.readyState
        }));
        
        logger.info(`Connected clients: ${connectedClients.length}`, { 
          clients: connectedClients,
          sessions: this.sessions.size
        });
      }, 10000);
      
      logger.info(`WebSocket server started on port ${port}`);
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

  /**
   * Set up server event handlers
   */
  private setupServerHandlers() {
    // Set up monitoring for connection events
    this.server.on("listening", () => {
      logger.info("WebSocket server is listening for connections");
    });

    this.server.on("error", (error) => {
      const normalizedError = normalizeError(error);
      logger.error("WebSocket server error", { error: normalizedError });
      
      // Try to recover from certain errors
      if (isRecoverableConnectionError(error)) {
        logger.warn("Attempting to recover from WebSocket server error");
        
        // For recoverable errors, we could implement server-level recovery here
        // For example, restart the server on a different port
      }
    });

    // Track and log client connections
    let connectionCount = 0;
    const logConnectionStatus = () => {
      logger.debug(`Current WebSocket clients: ${this.clients.size}`);
    };

    // Set up interval to log connection count every 30 seconds
    const connectionStatusInterval = setInterval(logConnectionStatus, 30000);
    
    // Clean up intervals on process exit
    process.on("SIGINT", () => {
      clearInterval(connectionStatusInterval);
      logger.info("WebSocket server shutting down due to SIGINT");
    });

    this.server.on("connection", (ws: WebSocket, req: any) => {
      // Generate a unique client ID
      const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      // Get client IP and origin for logging
      const clientIP = req.socket.remoteAddress || 'unknown';
      const origin = req.headers.origin || 'unknown';
      
      // Record client info
      this.clients.set(clientId, {
        ws,
        id: clientId,
        lastActive: Date.now(),
        isAlive: true,
        reconnectAttempts: 0
      });

      logger.info(`New WebSocket connection: ${clientId}`, {
        clientIP,
        origin,
        headers: req.headers,
        url: req.url
      });

      connectionCount++;
      logger.info(`Client connected: ${clientId} (Total: ${connectionCount})`);

      // Send initial state (if any)
      this.sendAgentState(clientId);

      // Set up message handler
      ws.on("message", tryCatch(async (data: string) => {
        const parsedMessage = JSON.parse(data) as WebSocketMessage;
        
        // Update client's last activity time
        const client = this.clients.get(clientId);
        if (client) {
          client.lastActive = Date.now();
          
          // If this is a reconnection request with sessionId
          if (parsedMessage.type === 'reconnect' && parsedMessage.sessionId) {
            this.handleReconnection(clientId, parsedMessage.sessionId);
          }
          // If this is a pong response to our heartbeat
          else if (parsedMessage.type === 'pong') {
            client.isAlive = true;
            logger.debug(`Heartbeat received from client ${clientId}`);
          }
          // Regular message handling
          else {
            this.handleClientMessage(clientId, parsedMessage);
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
          });
        }
      }));

      // Handle disconnection
      ws.on("close", (code, reason) => {
        connectionCount--;
        const client = this.clients.get(clientId);
        
        // Log close event with details
        logger.info(`Client disconnected: ${clientId} (Remaining: ${connectionCount})`, {
          closeCode: code,
          closeReason: reason.toString(),
          sessionId: client?.sessionId
        });

        // Preserve session state for reconnection if we have a session ID
        if (client?.sessionId) {
          this.preserveSessionState(clientId, client.sessionId);
        }
        
        // Remove from clients map
        this.clients.delete(clientId);
      });

      // Handle errors
      ws.on("error", (error) => {
        const normalizedError = normalizeError(error);
        logger.error(`WebSocket error for client ${clientId}`, { error: normalizedError });
        
        // Try to handle recoverable errors
        if (isRecoverableConnectionError(error)) {
          this.attemptClientRecovery(clientId, normalizedError);
        }
      });
    });
  }

  /**
   * Handle a message from a client
   * @param clientId The client ID
   * @param message The message
   */
  private handleClientMessage(clientId: string, message: WebSocketMessage) {
    // Log message with timestamp
    const timestamp = new Date().toISOString();
    logger.debug(`[${timestamp}] Message from ${clientId}: type=${message.type}`);

    switch (message.type) {
      case "user_message":
        const content = message.payload.content || "";
        // Log content preview (truncated for privacy/readability)
        const preview = content.length > 50 ? `${content.substring(0, 50)}...` : content;
        logger.info(`User message: "${preview}"`);
        this.handleUserMessage(clientId, content, message.requestId);
        break;

      case "document_focus":
        logger.info(`Document focus: ${message.payload.documentId} path=${message.payload.path || 'none'}`);
        this.handleDocumentFocus(
          message.payload.documentId,
          message.payload.path,
          message.requestId
        );
        break;

      default:
        logger.warn(`Unknown message type: ${message.type}`);
        this.sendToClient(clientId, {
          type: "error",
          payload: { message: `Unsupported message type: ${message.type}` },
          requestId: message.requestId
        });
    }
  }

  /**
   * Process a user message
   * @param clientId The client ID
   * @param content The message content
   * @param requestId Optional request ID for correlation
   */
  private async handleUserMessage(clientId: string, content: string, requestId?: string) {
    logger.info(`Processing user message from ${clientId}`);

    // Get client for session management
    const client = this.clients.get(clientId);
    
    // Create a session ID for this client if they don't have one
    if (client && !client.sessionId) {
      client.sessionId = `session-${Date.now()}`;
      
      // Update agent state with session info
      this.agentState.session = {
        id: client.sessionId,
        startedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      };
    }
    
    try {
      // Update agent state
      this.agentState.session.lastActivity = new Date().toISOString();
      
      // Preserve session state
      if (client?.sessionId) {
        this.preserveSessionState(clientId, client.sessionId);
      }
      
      // Send "thinking" state to client
      this.sendToClient(clientId, {
        type: "thinking_state",
        payload: { state: "processing" },
        requestId
      });

      // Process the message with the LangGraph agent
      const response = await this.agent.generate(content);
      
      logger.info(`Generated agent response: ${response.length} characters`);

      // Send the agent's response back to the client
      logger.info(`Sending agent response to client ${clientId}`);
      
      // Create the message payload
      const messagePayload: WebSocketMessage = {
        type: "agent_message",
        payload: { 
          message: response,  // The server sends the message in 'message' field
          timestamp: new Date().toISOString() 
        },
        requestId
      };
      
      // Log the exact payload being sent
      logger.info(`Agent message payload: ${JSON.stringify(messagePayload)}`);
      
      this.sendToClient(clientId, messagePayload);
      logger.info(`Agent response sent to client ${clientId}`);

      // Update agent state
      this.agentState.session.lastActivity = new Date().toISOString();
      
      // Preserve updated session state after response
      if (client?.sessionId) {
        this.preserveSessionState(clientId, client.sessionId);
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
      });
    }
  }
  
  /**
   * Handle a document focus event
   * @param documentId The document ID
   * @param path Optional path within the document
   * @param requestId Optional request ID for correlation
   */
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

  /**
   * Send agent state to a client
   * @param clientId The client ID
   */
  private sendAgentState(clientId: string) {
    const client = this.clients.get(clientId);
    
    // Include session information with state updates
    const sessionInfo = client?.sessionId ? {
      id: client.sessionId,
      lastActivity: new Date().toISOString()
    } : this.agentState.session;

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
      });
    } else {
      // Even if no documents, send session info to ensure client has it
      this.sendToClient(clientId, {
        type: "document_set_update",
        payload: {
          documents: [],
          session: sessionInfo
        },
      });
    }
  }

  /**
   * Send a message to a specific client
   * @param clientId The client ID
   * @param message The message to send
   */
  private sendToClient(clientId: string, message: WebSocketMessage) {
    const client = this.clients.get(clientId);
    if (!client) {
      logger.warn(`Attempted to send message to non-existent client: ${clientId}`);
      return;
    }

    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        const messageString = JSON.stringify(message);
        logger.debug(`Sending message to client ${clientId}: ${message.type} (${messageString.length} bytes)`);
        client.ws.send(messageString);
        logger.debug(`Message sent successfully to client ${clientId}`);
      } else {
        logger.warn(`Cannot send message to client ${clientId}: WebSocket not in OPEN state (current state: ${client.ws.readyState})`);
      }
    } catch (error) {
      logger.error(`Error sending message to client ${clientId}:`, {
        error: error instanceof Error ? error.message : String(error),
        messageType: message.type,
        clientState: client.ws.readyState
      });
    }
  }

  /**
   * Broadcast a message to all connected clients
   * @param message The message to broadcast
   */
  private broadcast(message: WebSocketMessage) {
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  /**
   * Broadcast document set to all clients
   */
  private broadcastDocumentSet() {
    // Prepare document payload
    const documentPayload = {
      documents: this.agentState.currentSelection.map(doc => ({
        id: doc.id,
        title: doc.title || doc.id,
        type: doc.type,
        lastModified: doc.lastModified
      })),
      session: this.agentState.session
    };
    
    // Send to all clients
    this.broadcast({
      type: "document_set_update",
      payload: documentPayload
    });
  }

  /**
   * Preserve session state for reconnection
   * @param clientId The client ID
   * @param sessionId The session ID
   */
  private preserveSessionState(clientId: string, sessionId: string) {
    // Get the full agent state from the adapter
    const fullAgentState = this.agent.getState();
    
    // Store in the sessions map
    this.sessions.set(sessionId, {
      agentState: fullAgentState,
      lastClientId: clientId,
      createdAt: new Date(),
      lastActive: new Date()
    });
    
    // Log session preservation
    logger.debug(`Preserved session state for ${sessionId} (client ${clientId})`);
    
    // Cleanup expired sessions periodically (could be moved to a separate method)
    this.cleanupExpiredSessions();
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions() {
    const now = new Date().getTime();
    let expiredCount = 0;
    
    this.sessions.forEach((session, sessionId) => {
      const sessionAge = now - session.lastActive.getTime();
      
      if (sessionAge > this.SESSION_EXPIRY) {
        this.sessions.delete(sessionId);
        expiredCount++;
      }
    });
    
    if (expiredCount > 0) {
      logger.info(`Cleaned up ${expiredCount} expired sessions`);
    }
  }

  /**
   * Handle client reconnection
   * @param clientId The client ID
   * @param sessionId The session ID
   */
  private handleReconnection(clientId: string, sessionId: string) {
    // Check if we have the session
    if (!this.sessions.has(sessionId)) {
      logger.warn(`Client ${clientId} attempted to reconnect with unknown session ${sessionId}`);
      
      this.sendToClient(clientId, {
        type: "error",
        payload: { 
          message: "Session not found or expired",
          code: "SESSION_NOT_FOUND"
        }
      });
      
      return;
    }
    
    // Get the session data
    const session = this.sessions.get(sessionId)!;
    
    // Update the client's session ID
    const client = this.clients.get(clientId);
    if (client) {
      client.sessionId = sessionId;
      logger.info(`Client ${clientId} reconnected to session ${sessionId}`);
      
      // Restore agent state
      this.agent.setState(session.agentState);
      
      // Update last active time
      session.lastActive = new Date();
      session.lastClientId = clientId;
      
      // Send confirmation and current state
      this.sendToClient(clientId, {
        type: "document_set_update",
        payload: {
          documents: this.agentState.currentSelection.map(doc => ({
            id: doc.id,
            title: doc.title || doc.id,
            type: doc.type,
            lastModified: doc.lastModified
          })),
          session: {
            id: sessionId,
            reconnected: true,
            startedAt: session.createdAt.toISOString(),
            lastActivity: session.lastActive.toISOString()
          }
        }
      });
    }
  }

  /**
   * Attempt to recover a client connection
   * @param clientId The client ID
   * @param error The error that occurred
   */
  private attemptClientRecovery(clientId: string, error: Error) {
    logger.info(`Attempting to recover client ${clientId} after error: ${error.message}`);
    
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // Increment reconnect attempts
    client.reconnectAttempts = (client.reconnectAttempts || 0) + 1;
    
    // Check if we've exceeded max attempts
    if (client.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      logger.warn(`Exceeded max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) for client ${clientId}`);
      
      // Clean up the client
      try {
        client.ws.terminate();
      } catch (e) {
        // Ignore errors during terminate
      }
      
      this.clients.delete(clientId);
      return;
    }
    
    // Attempt to send a reconnect message
    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: "error",
          payload: {
            message: "Connection error, please reconnect",
            code: "CONNECTION_ERROR",
            reconnect: true,
            sessionId: client.sessionId
          }
        }));
      }
    } catch (e) {
      logger.error(`Failed to send reconnect message to client ${clientId}`, {
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  /**
   * Set up heartbeat to detect disconnected clients
   */
  private setupHeartbeat() {
    // Set up interval for heartbeats
    setInterval(() => {
      this.clients.forEach((client, id) => {
        // Check if client is still connected
        if (!client.isAlive) {
          logger.warn(`Client ${id} failed heartbeat check, terminating connection`);
          client.ws.terminate();
          return;
        }
        
        // Mark as not alive until we get a pong back
        client.isAlive = false;
        
        // Send ping
        try {
          client.ws.send(JSON.stringify({
            type: "ping",
            payload: { timestamp: Date.now() }
          }));
        } catch (error) {
          logger.error(`Error sending heartbeat to client ${id}`, {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
    }, this.HEARTBEAT_INTERVAL);
  }
} 