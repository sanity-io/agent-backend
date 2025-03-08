import { WebSocket, WebSocketServer } from "ws"
import { Agent } from "@mastra/core/agent"

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

// Define message types for communication
export type MessageType =
  | "user_message" // User's chat message
  | "agent_message" // Agent's response
  | "document_set_update" // Update to relevant document set
  | "document_focus" // User's focus on a specific document/field
  | "thinking_state" // Agent is processing/thinking about something
  | "error" // Error message

export interface WebSocketMessage {
  type: MessageType
  payload: Record<string, any>
  requestId?: string // For correlation if needed
}

interface Client {
  ws: WebSocket
  id: string
}

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
      lastActivity: new Date().toISOString()
    }
  }

  constructor(port: number, agent: Agent) {
    this.agent = agent
    this.server = new WebSocketServer({ port })

    this.setupServerHandlers()

    console.log(`WebSocket server started on port ${port}`)
  }

  private setupServerHandlers() {
    // Set up monitoring for connection events
    this.server.on("listening", () => {
      console.log("WebSocket server is listening for connections...")
    });

    this.server.on("error", (error) => {
      console.error("WebSocket server error:", error);
    });

    // Track and log client connections
    let connectionCount = 0;
    const logConnectionStatus = () => {
      console.log(`Current WebSocket clients: ${this.clients.size}`);
    };

    // Set up interval to log connection count every 30 seconds
    const connectionStatusInterval = setInterval(logConnectionStatus, 30000);
    
    // Clean up interval on process exit
    process.on("SIGINT", () => {
      clearInterval(connectionStatusInterval);
    });

    this.server.on("connection", (ws: WebSocket) => {
      // Generate a unique client ID
      const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

      // Store the client
      this.clients.set(clientId, { ws, id: clientId })

      connectionCount++;
      console.log(`Client connected: ${clientId} (Total: ${connectionCount})`)

      // Send initial state (if any)
      this.sendAgentState(clientId)

      // Set up message handler
      ws.on("message", (data: string) => {
        try {
          const parsedMessage = JSON.parse(data) as WebSocketMessage
          this.handleClientMessage(clientId, parsedMessage)
        } catch (err) {
          console.error("Failed to parse message:", err)
          this.sendToClient(clientId, {
            type: "error",
            payload: { message: "Invalid message format" },
            requestId: undefined
          })
        }
      })

      // Handle disconnection
      ws.on("close", () => {
        connectionCount--;
        console.log(`Client disconnected: ${clientId} (Remaining: ${connectionCount})`)
        this.clients.delete(clientId)
      })

      // Handle errors
      ws.on("error", (error: Error) => {
        console.error(`WebSocket error for client ${clientId}:`, error)
      })
    })
  }

  private handleClientMessage(clientId: string, message: WebSocketMessage) {
    // Log message with timestamp
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Message from ${clientId}: type=${message.type}`)

    switch (message.type) {
      case "user_message":
        const content = message.payload.content || "";
        // Log content preview (truncated for privacy/readability)
        const preview = content.length > 50 ? `${content.substring(0, 50)}...` : content;
        console.log(`User message: "${preview}"`);
        this.handleUserMessage(clientId, content, message.requestId)
        break

      case "document_focus":
        console.log(`Document focus: ${message.payload.documentId} path=${message.payload.path || 'none'}`);
        this.handleDocumentFocus(
          message.payload.documentId,
          message.payload.path,
          message.requestId
        )
        break

      default:
        console.warn(`Unknown message type: ${message.type}`)
        this.sendToClient(clientId, {
          type: "error",
          payload: { message: `Unsupported message type: ${message.type}` },
          requestId: message.requestId
        })
    }
  }

  private async handleUserMessage(clientId: string, content: string, requestId?: string) {
    try {
      // Special case for "what am I looking at?" questions
      const whatAmILookingAtPattern = /what\s+(am\s+i|are\s+we|is\s+this)\s+looking\s+at|what.*document|show.*document|current\s+document/i;
      
      if (whatAmILookingAtPattern.test(content)) {
        // Get current state
        if (!this.agentState || !this.agentState.userFocus || !this.agentState.userFocus.documentId) {
          // Send response if no document is focused
          this.sendToClient(clientId, {
            type: "agent_message",
            payload: { 
              content: "You don't have any document focused at the moment. Please select a document in the Sanity Studio to view its details."
            },
            requestId
          });
          return;
        }
        
        // Get the focused document
        const focusedDocId = this.agentState.userFocus.documentId;
        const focusedDoc = this.agentState.currentSelection.find(doc => doc.id === focusedDocId);
        
        if (!focusedDoc) {
          // Send a message if document isn't in selection
          this.sendToClient(clientId, {
            type: "agent_message",
            payload: { 
              content: `You were looking at document ID: ${focusedDocId}, but I couldn't retrieve its details. Please try selecting the document again.`
            },
            requestId
          });
          return;
        }
        
        // Send direct response about the focused document
        this.sendToClient(clientId, {
          type: "agent_message",
          payload: { 
            content: `You are currently looking at "${focusedDoc.title || focusedDoc.id}" (ID: ${focusedDoc.id}).\nThis is ${focusedDoc.type ? `a ${focusedDoc.type} document` : 'a document'}. To see more details, I can analyze its content for you.`,
            documentId: focusedDoc.id
          },
          requestId
        });
        
        // Mark that we've answered this question
        this.agentState.userFocus.lastQueryAnswered = 'what_am_i_looking_at';
        
        return;
      }

      // Process regular message through the agent
      // Show thinking state
      this.sendToClient(clientId, {
        type: "thinking_state",
        payload: {
          action: "processing",
          message: "Processing your message..."
        }
      });
      
      // Process the user message through the agent
      const response = await this.agent.generate(content)

      // Send the response back to the client
      this.sendToClient(clientId, {
        type: "agent_message",
        payload: { content: response.text || response.toString() },
        requestId
      })
    } catch (err) {
      const error = err as Error
      console.error("Error processing user message:", error)
      this.sendToClient(clientId, {
        type: "error",
        payload: { message: `Failed to process your message. ${error.message || 'Unknown error'}` },
        requestId
      })
    }
  }
  
  private handleDocumentFocus(documentId: string, path?: string, requestId?: string) {
    console.log(`Document focus changed: ${documentId}, path: ${path}`);
    
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
    if (this.agentState.currentSelection.length === 0) return;
    
    this.broadcast({
      type: "document_set_update",
      payload: {
        documents: this.agentState.currentSelection.map(doc => ({
          id: doc.id,
          title: doc.title || doc.id,
          type: doc.type,
          lastModified: doc.lastModified
        })),
      },
    });
  }
}
