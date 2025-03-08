# MCP Server & Chatbot Testing

This directory contains unit and integration tests for the MCP Server & Chatbot for Sanity Studio.

## Testing Philosophy

- **High Coverage**: We aim for 85%+ coverage of the codebase
- **Unit Tests First**: We test individual units of code in isolation
- **Integration Tests**: We test how units work together
- **Fast Tests**: Tests should run quickly to enable frequent execution
- **Maintainable Tests**: Tests should be easy to understand and update

## Test Structure

```
test/
  ├── utils/                  # Test utilities and common mocks
  ├── server/                 # Tests for server components
  ├── mastra/                 # Tests for Mastra components
  ├── integration.test.ts     # Integration tests
  └── README.md               # This file
```

## Running Tests

To run tests:

```
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Launch test UI
npm run test:ui
```

## Mocking Strategy

We use Vitest's mocking capabilities to mock external dependencies like:

- WebSocket connections
- Agent components
- External APIs

The mocks are defined in `test/utils/mocks.ts` for reuse across tests.

## Test Coverage Areas

1. **WebSocket Server**
   - Connection handling
   - Message processing
   - Broadcast functionality
   - State management
   - Error handling

2. **Agent Core**
   - Agent initialization
   - State management
   - Message generation
   - Tool usage

3. **Message Handling**
   - Processing different message types
   - Handling malformed messages
   - State updates based on messages

4. **Integration**
   - End-to-end workflows
   - Component interaction

## Guidelines for New Tests

1. Follow the existing pattern for new tests
2. Use descriptive test names
3. Group related tests in describe blocks
4. Make sure to clean up after tests
5. Add thorough tests for edge cases and error conditions
6. Run the coverage report to identify coverage gaps

## Current Coverage Status

The current test coverage is a work in progress. Key areas requiring additional coverage:

1. **Sanity Tools** - Tests for Sanity-specific tools
2. **Sanity Agent** - Tests for the Sanity-specific agent implementation
3. **WebSocket Server** - Additional tests for complex message handling
4. **Integration Tests** - More comprehensive end-to-end tests 