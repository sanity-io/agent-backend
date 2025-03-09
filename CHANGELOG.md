# Changelog

All notable changes to the Sanity AI Agent Backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2025-03-09

### Added
- Repository extraction from monorepo structure
- Initial Dockerization support
- Kubernetes deployment configuration
- Automatic port fallback mechanism for HTTP and WebSocket servers
- Structured environment variable loading for better modularity
- Session preservation for WebSocket connections with reconnection support
- Heartbeat mechanism to detect and clean up dead connections
- Structured logging system with configurable log levels
- Robust error handling utilities with recovery mechanisms
- Connection recovery with exponential backoff
- Debug startup mode for easier troubleshooting
- Environment variable for Claude model configuration (`ANTHROPIC_MODEL_NAME`) using the latest model version

### Changed
- Updated package.json for standalone operation
- Enhanced WebSocket server for external deployment
- Improved environment variable handling
- Refactored index.ts for better ESM compatibility
- Enhanced state management to include session information
- Replaced console logging with structured logger
- Improved WebSocket error handling and recovery
- Removed Mastra dependencies and implementation
- Switched to LangGraph for agent workflows
- Implemented SanityAgentAdapter with LangGraph support
- Enhanced logging for debugging WebSocket communication

### Fixed
- ESM/CommonJS compatibility issues with pkce-challenge package
- WebSocket server path handling
- Reconnection logic in client connections
- Improved error handling when ports are already in use
- Addressed client disconnection issues with session persistence
- Enhanced error reporting for debugging
- Fixed server startup crashes due to module loading issues
- Fixed WebSocket message format for client communication

### Planned
- **LangGraph Migration (v0.2.0)** - Continue migration to LangGraph:
  - Enhance LangGraph workflow implementation with typed state schema
  - Enhanced tool execution with parallel processing and streaming results
  - Robust state persistence with WebSocket reconnection support
  - Comprehensive tracing and debugging capabilities
  - Performance optimization for large document sets and complex workflows

- **Authentication System (v0.3.0)**:
  - Token-based authentication for WebSocket connections
  - Role-based access control with fine-grained permissions
  - Secure token exchange and revocation mechanisms
  - Integration with Sanity Studio authentication

- **Enhanced Document Management (v0.4.0)**:
  - Natural language document selection and filtering
  - Document relationship visualization and navigation
  - Document change detection and notifications
  - Multi-document reasoning and context sharing

- **Developer Experience Improvements (v0.5.0)**:
  - Comprehensive API documentation with OpenAPI specification
  - Enhanced CI/CD pipeline with automated testing and releases
  - Performance benchmarking and monitoring tools
  - Client libraries and integration examples

## [0.1.0] - 2024-03-08

### Initial Release
- Extracted from `mcp-test-www-sanity-io` monorepo
- Basic WebSocket server functionality
- Express server for health checks
- MCP integration with stdio transport
- Anthropic Claude integration
- Document management functionality
- Session management and state persistence
- Basic logging and error handling 