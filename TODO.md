# TODO

## High Priority
1. [ ] **Fix LangGraph's access to Sanity tools**  (High Priority)

    - Issue: MCP server is registered but LangGraph can't run tools
    - Tools are accessible via the MCP server but not being properly executed
    - Need to ensure proper tool registration and execution flow in LangGraph adapter
    - Fix type issues between LangGraph and MCP tools format

    ### Implementation plan
    1. [ ] Debug tool execution flow from LangGraph to MCP
    2. [ ] Fix type conversions between LangGraph tool format and MCP
    3. [ ] Add robust error handling for tool execution
    4. [ ] Add tests for tool execution flow
    5. [ ] Document the tool registration and execution process

2. [✅] **Write a comprehensive suite of unit tests - make a plan here**

    ### Comprehensive Testing Plan
    - [✅] Set up Vitest instead of Jest for better ESM compatibility
    - [✅] Create test directory structure in `/test`
    - [✅] Create reusable test mocks and utilities
    - [✅] Create WebSocket server tests
    - [✅] Create message handling tests
    - [✅] Create state management tests
    - [✅] Create Agent core tests
    - [✅] Create test README with guidelines

    ### Next Testing Steps
    - [ ] Implement Advanced Integration Tests:
      - [ ] **End-to-End Message Flow**
        - User message -> Agent processing -> Response delivery
        - Document context incorporation in responses
        - Multi-turn conversation handling
        - Document focus and selection updates
      - [ ] **Sanity Integration**
        - GROQ query execution
        - Document fetching
        - Document mutations and updates
        - Error handling from Sanity API
      - [ ] **Connection Management**
        - Multiple client handling
        - Client reconnection and state recovery
        - Timeout and disconnection handling
        - Broadcast to multiple clients
      - [ ] **Error Handling**
        - Agent generation errors
        - Invalid message handling
        - Tool execution errors
        - Server stability during unexpected errors

    - [ ] Implement mocking strategies:
      - [ ] Create reliable WebSocket mocks with proper event simulation
      - [ ] Create Sanity client mocks that can be properly augmented with mock functions
      - [ ] Create consistent message handler access approach for tests

    - [ ] Configure test CI/CD workflow
      - [ ] Set up GitHub Actions for testing
      - [ ] Add coverage reporting to PRs
      - [ ] Implement coverage enforcement
    - [ ] Monitor and maintain test coverage above 85%

3. [✅] **Fix ESM/CommonJS compatibility issues**

    - Resolve the pkce-challenge package ESM compatibility error
    - Update package.json with proper resolutions for ESM modules
    - Fix the startServer.js script to handle ESM modules correctly

    ### Implementation plan
    1. [✅] **Add resolution for pkce-challenge in package.json**
         - Add `"resolutions": { "pkce-challenge": "npm:@modelcontextprotocol/pkce-challenge@^4.1.0" }`
         - Update TypeScript configuration if needed
    2. [✅] **Refactor index.ts to better handle ESM imports**
         - Replace require('fs') with proper ESM import 
         - Restructure environment loading for better modularity
    3. [✅] **Enhance startServer.js for better ESM compatibility**
         - Add experimental-specifier-resolution for Node.js
         - Improve environment loading function

4. [✅] **Improve WebSocket connection stability**

    - Enhance reconnection logic
    - Add better error handling and logging
    - Implement graceful shutdown handling for Kubernetes environments

    ### Implementation plan
    1. [✅] **Add port fallback mechanism**
         - Implement automatic port incrementing when ports are in use
         - Add better error handling and reporting
         - Ensure proper port notification to help client connections
    2. [✅] **Enhance client reconnection handling**
         - Implement state preservation between reconnections
         - Add heartbeat mechanism to detect disconnections
    3. [✅] **Improve error handling and logging**
         - Add structured logging for connection events
         - Implement graceful recovery from connection errors

5. [ ] **Switch from Mastra to LangGraph**  (In progress)

    - Migrate from Mastra agent framework to LangGraph for more robust agent workflows
    - Gain benefits from LangGraph's state management, tracing, and debugging capabilities
    - Improve modularity and maintainability of agent logic
    - Support more complex conversation patterns with branching and parallel execution

    ### Implementation plan
    1. [ ] **Research and setup LangGraph integration**
         - Add LangGraph dependencies to package.json: 
           ```json
           {
             "dependencies": {
               "@langchain/core": "^0.2.0",
               "@langchain/langgraph": "^0.1.0",
               "@langchain/anthropic": "^0.1.0",
               "langchain": "^0.1.0"
             }
           }
           ```
         - Create a proof-of-concept implementation with simple Sanity tools
         - Document LangGraph architecture decisions
         - Evaluate performance and scaling considerations
         - Set up local debugging tools for LangGraph traces
    
    2. [ ] **Create core LangGraph component structure**
         - Design state schema to replace Mastra agent state
           ```typescript
           interface SanityAgentState {
             messages: BaseMessage[];
             currentDocuments: DocumentReference[];
             userFocus: {
               documentId?: string;
               path?: string;
             };
             toolResults: ToolResult[];
             metadata: Record<string, any>;
             sessionInfo: SessionInfo;
           }
           ```
         - Define structured input/output interfaces for all nodes
         - Establish node structure for conversation flow:
           - User message parsing and intent detection
           - Context collection from Sanity documents
           - Response generation with Anthropic
           - Tool selection and execution
         - Create modular node configuration system
         - Implement typed input/output validation between nodes
         - Set up explicit state transitions with validation
    
    3. [ ] **Implement tool integration architecture**
         - Create wrapper for existing Sanity MCP tools to work with LangGraph
           ```typescript
           class SanityToolWrapper implements ToolInterface {
             constructor(private mcpClient: MastraMCPClient, private toolName: string) {}
             
             async invoke(input: string, runManager?: CallbackManagerForToolRun): Promise<any> {
               // Implementation
             }
           }
           ```
         - Build tool selection logic using LangGraph's conditional edges
         - Implement parallel tool execution for efficiency when appropriate
         - Add tool execution monitoring and retries for reliability
         - Create tool result caching mechanism
         - Add streaming tool results for long-running operations
         - Implement rate limiting and batching for tool calls
         - Create tool discovery mechanism for dynamic loading
    
    4. [ ] **Develop state persistence and recovery mechanism**
         - Design state persistence adapters for WebSocket reconnection
           ```typescript
           interface StateStorageAdapter {
             saveState(sessionId: string, state: SanityAgentState): Promise<void>;
             loadState(sessionId: string): Promise<SanityAgentState | null>;
             listSessions(): Promise<string[]>;
             deleteSession(sessionId: string): Promise<void>;
           }
           ```
         - Implement checkpoint/resumption of agent workflows
         - Create state rollback capabilities for error recovery
         - Add serialization/deserialization of graph state
         - Implement distributed state management for scaling
         - Create WebSocket events for state synchronization
         - Add state snapshots for historical reference
         - Implement state compression for efficiency
    
    5. [ ] **Create comprehensive tracing and debugging**
         - Implement LangGraph trace collection for each conversation
         - Add visualization endpoints for workflow inspection
         - Create structured logging throughout the graph
         - Develop error boundary nodes for graceful failure handling
         - Add performance profiling for node execution
         - Create debug mode with detailed step execution
         - Implement trace storage and retrieval for analysis
         - Add monitoring dashboard for runtime insights
         - Create replay functionality for debugging past conversations
    
    6. [ ] **Build enhanced conversation capabilities**
         - Add support for multi-turn reasoning chains
         - Implement conversation memory management
         - Create document-grounded conversations
         - Add proactive suggestions based on document context
         - Implement multi-document reasoning
         - Create conversation summarization
         - Add conversation branching for exploration
         - Implement conversation metadata annotations
    
    7. [ ] **Deprecate Mastra components incrementally**
         - Identify all Mastra usage in codebase
         - Create adapter layer to minimize migration impact
           ```typescript
           class MastraToLangGraphAdapter {
             constructor(private langGraph: SanityLangGraph) {}
             
             async generate(input: string): Promise<any> {
               // Adapt to LangGraph interface
             }
           }
           ```
         - Replace Mastra agent with LangGraph workflows incrementally
         - Update tests to use LangGraph mocking patterns
         - Create compatibility layer for gradual migration
         - Add feature flags for toggling implementations
         - Implement A/B testing between implementations
         - Set up phased deprecation with metrics collection
    
    8. [ ] **Performance optimization and scaling**
         - Implement lazy loading of LangGraph components
         - Add caching for common operations
         - Optimize state serialization for WebSocket transport
         - Implement streaming responses throughout the graph
         - Optimize memory usage for large document sets
         - Add horizontal scaling capabilities
         - Implement distributed tracing for production
         - Create resource utilization monitoring

6. [ ] **Add comprehensive authentication system**

    - Implement token-based authentication for WebSocket connections
    - Add environment variable configuration for auth settings
    - Create secure token exchange mechanism
    - Implement role-based access control
    - Add authentication logging and monitoring
    - Create token revocation mechanism
    - Implement rate limiting for authenticated endpoints
    - Add security headers for HTTP responses

## Medium Priority
1. [ ] **Enhance CI/CD Pipeline**

    - Set up GitHub Actions for testing, linting, and building
    - Create automated release process
    - Add Docker build and publish workflow
    - Implement semantic versioning automation
    - Add dependency scanning for vulnerabilities
    - Create performance regression testing
    - Implement automated documentation generation
    - Add change log automation

2. [ ] **Improve Document Management**

    - Add support for document filtering by tags
    - Implement document selection commands via natural language
    - Improve document focus handling in UI
    - Add document change detection and notifications
    - Implement document version comparison
    - Create document search capabilities
    - Add document relationship visualization
    - Implement document access tracking

3. [ ] **Add API Documentation**

    - Document WebSocket message formats
    - Create API reference for client integration
    - Add examples for common use cases
    - Implement OpenAPI specification
    - Create interactive API playground
    - Add code generation for client libraries
    - Create tutorials for common integration patterns
    - Implement versioning for API documentation

## Low Priority
1. [ ] **Performance Optimizations**

    - Optimize WebSocket message handling
    - Reduce memory usage for large document sets
    - Implement caching where appropriate
    - Add compression for message payloads
    - Optimize database queries
    - Implement connection pooling
    - Add request batching for efficiency
    - Create performance benchmarking suite

2. [ ] **Enhanced Monitoring**

    - Add structured logging
    - Implement metrics collection
    - Create health check dashboard
    - Add alert system for critical errors
    - Implement resource usage monitoring
    - Create user activity tracking
    - Add performance analytics
    - Implement automated system diagnostics

3. [ ] **Internationalization Support**

    - Add language detection
    - Support multilingual documents
    - Implement translation features
    - Create language-specific response templates
    - Add cultural context awareness
    - Implement right-to-left text support
    - Create multilingual documentation
    - Add language preference management 