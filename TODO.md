# TODO

## High Priority
0. [✅] **Write a comprehensive suite of unit tests - make a plan here**

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

1. [✅] **Fix ESM/CommonJS compatibility issues**

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

2. [✅] **Improve WebSocket connection stability**

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

3. [ ] **Switch from Mastra to LangGraph**

    - Migrate from Mastra agent framework to LangGraph for more robust agent workflows
    - Gain benefits from LangGraph's state management, tracing, and debugging capabilities
    - Improve modularity and maintainability of agent logic

    ### Implementation plan
    1. [ ] **Research and setup LangGraph integration**
         - Add LangGraph dependencies to package.json: `@langchain/langgraph` and relevant packages
         - Create a proof-of-concept implementation with simple Sanity tools
         - Document LangGraph architecture decisions
    
    2. [ ] **Create core LangGraph component structure**
         - Design state schema to replace Mastra agent state
         - Define structured input/output interfaces for all nodes
         - Establish node structure for:
           - User message parsing and intent detection
           - Context collection from Sanity documents
           - Response generation with Anthropic
           - Tool selection and execution
    
    3. [ ] **Implement tool integration architecture**
         - Create wrapper for existing Sanity MCP tools to work with LangGraph
         - Build tool selection logic using LangGraph's conditional edges
         - Implement parallel tool execution for efficiency when appropriate
         - Add tool execution monitoring and retries for reliability
    
    4. [ ] **Develop state persistence and recovery mechanism**
         - Design state persistence adapters for WebSocket reconnection
         - Implement checkpoint/resumption of agent workflows
         - Create state rollback capabilities for error recovery
         - Add serialization/deserialization of graph state
    
    5. [ ] **Create comprehensive tracing and debugging**
         - Implement LangGraph trace collection for each conversation
         - Add visualization endpoints for workflow inspection
         - Create structured logging throughout the graph
         - Develop error boundary nodes for graceful failure handling
    
    6. [ ] **Deprecate Mastra components incrementally**
         - Identify all Mastra usage in codebase
         - Create adapter layer to minimize migration impact
         - Replace Mastra agent with LangGraph workflows incrementally
         - Update tests to use LangGraph mocking patterns

4. [ ] **Add comprehensive authentication system**

    - Implement token-based authentication for WebSocket connections
    - Add environment variable configuration for auth settings
    - Create secure token exchange mechanism

## Medium Priority
1. [ ] **Enhance CI/CD Pipeline**

    - Set up GitHub Actions for testing, linting, and building
    - Create automated release process
    - Add Docker build and publish workflow

2. [ ] **Improve Document Management**

    - Add support for document filtering by tags
    - Implement document selection commands via natural language
    - Improve document focus handling in UI

3. [ ] **Add API Documentation**

    - Document WebSocket message formats
    - Create API reference for client integration
    - Add examples for common use cases

## Low Priority
1. [ ] **Performance Optimizations**

    - Optimize WebSocket message handling
    - Reduce memory usage for large document sets
    - Implement caching where appropriate

2. [ ] **Enhanced Monitoring**

    - Add structured logging
    - Implement metrics collection
    - Create health check dashboard

3. [ ] **Internationalization Support**

    - Add language detection
    - Support multilingual documents
    - Implement translation features 