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

1. [ ] **Fix ESM/CommonJS compatibility issues**  (In progress)

    - Resolve the pkce-challenge package ESM compatibility error
    - Update package.json with proper resolutions for ESM modules
    - Fix the startServer.js script to handle ESM modules correctly

    ### Implementation plan
    1. [ ] **Add resolution for pkce-challenge in package.json**
         - Add `"resolutions": { "pkce-challenge": "npm:@modelcontextprotocol/pkce-challenge@^4.1.0" }`
         - Update TypeScript configuration if needed
    2. [ ] **Refactor index.ts to better handle ESM imports**

2. [ ] **Improve WebSocket connection stability**

    - Enhance reconnection logic
    - Add better error handling and logging
    - Implement graceful shutdown handling for Kubernetes environments

3. [ ] **Add comprehensive authentication system**

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