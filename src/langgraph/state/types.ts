/**
 * LangGraph state types for Sanity MCP Agent
 */
import { BaseMessage } from "@langchain/core/messages";

/**
 * Reference to a Sanity document
 */
export interface DocumentReference {
  id: string;
  type?: string;
  title?: string;
  path?: string; // Path within document (for field-level context)
  lastModified?: string;
}

/**
 * Result of a tool execution
 */
export interface ToolResult {
  toolName: string;
  input: Record<string, any>;
  output: any;
  error?: Error | string;
  timestamp: string;
}

/**
 * Session information for tracking client state
 */
export interface SessionInfo {
  id: string;
  startedAt: string;
  lastActivity: string;
  clientId?: string;
}

/**
 * Main agent state schema
 */
export interface SanityAgentState {
  // Conversation messages (both user and assistant)
  messages: BaseMessage[];
  
  // Current document selection with metadata
  currentDocuments: DocumentReference[];
  
  // User's focus within the Studio
  userFocus: {
    documentId?: string;
    path?: string;
    lastUpdated?: string;
  };
  
  // Results of tool executions (for reference and re-use)
  toolResults: ToolResult[];
  
  // Additional metadata for the conversation
  metadata: Record<string, any>;
  
  // Session information for reconnection
  sessionInfo: SessionInfo;
}

/**
 * Create an empty initial state
 */
export function createInitialState(sessionId?: string): SanityAgentState {
  const now = new Date().toISOString();
  return {
    messages: [],
    currentDocuments: [],
    userFocus: {},
    toolResults: [],
    metadata: {},
    sessionInfo: {
      id: sessionId || `session-${Date.now()}`,
      startedAt: now,
      lastActivity: now,
    }
  };
} 