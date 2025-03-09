// Simple WebSocket client to test the MCP agent server
import WebSocket from 'ws';

// Configuration
const PORT = 3002;  // Same as your server's WebSocket port
const WS_URL = `ws://localhost:${PORT}`;

// Create a WebSocket connection
const ws = new WebSocket(WS_URL);

// Handle connection open
ws.on('open', function open() {
  console.log('Connected to MCP server');
  
  // Send a test message
  const message = {
    type: 'user_message',
    payload: {
      content: 'Hello, how can you help me with Sanity content?'
    },
    requestId: `req-${Date.now()}`
  };
  
  console.log('Sending test message:', message);
  ws.send(JSON.stringify(message));
});

// Handle incoming messages
ws.on('message', function incoming(data) {
  const message = JSON.parse(data.toString());
  console.log('Received message:', message);
  
  // If we get a response to our test message, close the connection
  if (message.type === 'agent_message') {
    console.log('Got agent response, test completed successfully');
    setTimeout(() => {
      ws.close();
      process.exit(0);
    }, 1000);
  }
});

// Handle errors
ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

// Handle connection close
ws.on('close', function close() {
  console.log('Connection closed');
});

// Handle process termination
process.on('SIGINT', function() {
  console.log('Closing connection...');
  ws.close();
  process.exit(0);
}); 