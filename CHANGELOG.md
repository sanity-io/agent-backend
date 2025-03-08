# Changelog

All notable changes to the Sanity AI Agent Backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Repository extraction from monorepo structure
- Initial Dockerization support
- Kubernetes deployment configuration
- Automatic port fallback mechanism for HTTP and WebSocket servers
- Structured environment variable loading for better modularity

### Changed
- Updated package.json for standalone operation
- Enhanced WebSocket server for external deployment
- Improved environment variable handling
- Refactored index.ts for better ESM compatibility

### Fixed
- ESM/CommonJS compatibility issues with pkce-challenge package
- WebSocket server path handling
- Reconnection logic in client connections
- Improved error handling when ports are already in use

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