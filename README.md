# Sanity MCP Agent

This package implements a Mastra.ai agent for Sanity.io that runs in the Studio
as part of the Model Context Protocol (MCP) integration. It allows content
editors to interact with their content using natural language through a
conversational interface.

## Features

- **Natural Language Interface**: Chat with an AI assistant to manage your
  Sanity.io content
- **Document-Aware Context**: The agent is aware of your currently selected
  document and its content
- **Stepwise Planning**: For complex operations, the agent breaks down tasks
  into steps and explains its plan
- **Human-in-the-Loop Verification**: Critical operations require explicit user
  confirmation
- **Sandbox Mode**: Test changes safely without affecting production content
- **Rich Content Support**: The chat interface supports Portable Text for rich
  text, images, and more

## Getting Started

### Prerequisites

- Node.js 18+
- A Sanity.io project
- An OpenAI API key or Anthropic API key (for the LLM)

### Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on templates in `config/environments`:
   ```
   # Copy the development environment template
   cp config/environments/.env.development .env
   
   # Edit the .env file with your API keys
   nano .env
   ```
   
   Required environment variables:
   ```
   SANITY_PROJECT_ID=your_project_id
   SANITY_DATASET=production
   SANITY_TOKEN=your_sanity_token
   
   # You need at least one of these:
   OPENAI_API_KEY=your_openai_key
   ANTHROPIC_API_KEY=your_anthropic_key
   ```

### Project Structure

```
├── config/                 # Configuration files
│   ├── environments/       # Environment templates
│   ├── .eslintrc.js        # ESLint configuration
│   ├── .prettierrc         # Prettier configuration 
│   ├── tsconfig.json       # TypeScript configuration
│   └── vitest.config.ts    # Vitest configuration
├── src/                    # Source code
│   ├── mastra/             # Mastra.ai integration
│   ├── server/             # WebSocket server
│   └── index.ts            # Main entry point
├── test/                   # Test files
└── .env                    # Environment variables (not in git)
```

### Running the Agent

#### Using the monorepo command (recommended)

From the root of the monorepo, run:

```
pnpm run dev:agent
```

This will start the agent in development mode with automatic reloading when files change.

#### Standalone mode

Or start the agent server directly in development mode:

```
cd apps/agent
npm run dev
```

Either method will start two services:

- REST API server on port 3001
- WebSocket server on port 3002

The Sanity Studio will automatically connect to the WebSocket server when you
open the MCP chat interface.

## Architecture

### Agent Core

The MCP agent is built using Mastra.ai and follows these key patterns:

- **State Management**: The agent maintains state about selected documents and
  current plans
- **Workflows**: Complex operations are managed using workflows with human
  checkpoints
- **Trust Levels**: The agent gradually gains autonomy as the user builds trust
- **Sandbox Testing**: Changes can be simulated before being applied to real
  content

### WebSocket Communication

The agent communicates with the Studio UI via WebSocket, sending:

- Agent responses
- Plan updates and progress
- Document set changes

And receiving:

- User messages
- Document selection updates
- Content changes

### Tools

The agent provides several tools for interacting with Sanity content:

- **listDocuments**: Search and filter documents using GROQ
- **getDocument**: Retrieve a specific document by ID
- **createDocument**: Create new documents
- **updateDocument**: Modify existing documents
- **deleteDocument**: Delete documents (requires explicit confirmation)
- **createRelease**: Group changes into a content release

## Upcoming Features

- Enhanced image and media handling
- Support for custom schemas and document types
- Auto-transcription of audio content
- Pre-built templates for common editing tasks

## License

MIT

## Connecting to Sanity Studio

To use the Mastra.ai agent with Sanity Studio:

1. Ensure you have set up the proper environment variables in your `.env` file:
   ```
   SANITY_TOKEN=your_sanity_token
   SANITY_PROJECT_ID=your_project_id
   SANITY_DATASET=your_dataset
   ```

2. Start the MCP server using one of these methods:

   **Using monorepo commands (recommended):**
   ```bash
   # From the root of the monorepo
   pnpm run dev:agent
   ```

   **Or standalone:**
   ```bash
   cd apps/agent
   npm run build
   node dist/index.js
   # OR use npm run dev for development with auto-reloading
   ```

3. In another terminal, start your Sanity Studio:

   **Using monorepo commands:**
   ```bash
   # From the root of the monorepo
   pnpm run dev:studio
   ```
   
   **Or standalone:**
   ```bash
   cd packages/studio
   npm run dev
   ```

4. Open your browser to the Sanity Studio and navigate to the MCP view

## Troubleshooting

- **SANITY_TOKEN is required**: Make sure you've added a valid Sanity token to your `.env` file. You can create one in the [Sanity management console](https://www.sanity.io/manage).

- **Connection issues**: Ensure that the WebSocket server is running on port 3002 and that your browser can connect to `ws://localhost:3002`.

- **CORS errors**: If you experience CORS issues, check that your origin is included in the `ALLOWED_ORIGINS` environment variable.

# Sanity MCP Agent Backend

This is the backend server for the Sanity MCP (Model Context Protocol) Agent integration. It provides a WebSocket server that connects to the Sanity Studio and enables AI assistance for content management tasks.

## 🚧 Upcoming LangGraph Migration

> **Note:** We are planning a migration from the current Mastra agent framework to LangGraph for improved agent workflows, state management, and debugging capabilities. This migration is scheduled for the next major version (v0.2.0) and will bring several significant improvements.

### Benefits of the LangGraph Migration

- **Enhanced Workflow Capabilities**: Complex, multi-step reasoning with branching logic and parallel execution
- **Robust State Management**: Better conversation memory and state persistence across reconnections
- **Improved Debugging**: Comprehensive tracing, visualization, and error boundary handling
- **Advanced Tool Integration**: Parallel tool execution, streaming results, and better error handling
- **Type Safety**: Fully typed interfaces for state management and tool integration

### Migration Timeline

1. **Research & Setup** (Q2 2024): Dependencies and proof-of-concept implementation
2. **Core Implementation** (Q2-Q3 2024): Workflow structure, state management, and tool integration
3. **Enhanced Features** (Q3 2024): Tracing, debugging, and conversation capabilities
4. **Mastra Deprecation** (Q4 2024): Incremental replacement of Mastra components

The migration will be implemented with backward compatibility in mind, and both frameworks will coexist during the transition period. Developers are encouraged to prepare for this change by familiarizing themselves with the LangGraph architecture.

## Features

- WebSocket server for real-time communication with Sanity Studio
- Express server for health checks and basic HTTP endpoints
- Anthropic Claude integration for high-quality AI responses
- Sanity MCP integration for executing Sanity-specific tools
- Document management capabilities for content editing
- Session management and state persistence
- Structured logging and error handling

## Setup

### Prerequisites

- Node.js 16 or higher
- A Sanity project
- Anthropic API key

### Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on the example:

```bash
cp config/environments/.env.sample .env
```

4. Fill in the required environment variables in the `.env` file

### Running the Server

Start the development server:

```bash
npm run dev
```

For production:

```bash
npm run build
npm start
```

## Environment Variables

| Variable             | Description                                     | Default                 |
|----------------------|-------------------------------------------------|-------------------------|
| `PORT`               | HTTP server port                                | 3001                    |
| `WEBSOCKET_PORT`     | WebSocket server port                           | 3002                    |
| `ANTHROPIC_API_KEY`  | Anthropic API key for Claude                    | (required)              |
| `SANITY_PROJECT_ID`  | Sanity project ID                               | (required)              |
| `SANITY_DATASET`     | Sanity dataset                                  | production              |
| `SANITY_API_VERSION` | Sanity API version                              | (latest)                |
| `SANITY_TOKEN`       | Sanity API token for authentication             | (optional)              |
| `ALLOWED_ORIGINS`    | Comma-separated list of allowed CORS origins    | *                       |
| `MASTRA_LOG_LEVEL`   | Log level (debug, info, warn, error)            | info                    |

## Testing

Run the tests:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

Coverage report:

```bash
npm run test:coverage
```

## Docker

Build the Docker image:

```bash
docker build -t sanity-ai-agent-backend .
```

Run the Docker container:

```bash
docker run -p 3001:3001 -p 3002:3002 --env-file .env sanity-ai-agent-backend
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
