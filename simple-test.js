// Simple script to test spawning the MCP server process
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const mcpServerPath = process.env.SANITY_MCP_SERVER_PATH || 
  '/Users/even/projects/sanity/ai/mcp/sanity-mcp-server/dist/index.js';

console.log(`Starting MCP server at: ${mcpServerPath}`);
console.log(`Using Node.js: ${process.execPath}`);

// Spawn the MCP server process
const mcpProcess = spawn(process.execPath, [mcpServerPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env
});

// Handle stdio
const stdin = mcpProcess.stdin;
const stdout = createInterface({ input: mcpProcess.stdout });

// Handle stderr for debugging
mcpProcess.stderr.on('data', (data) => {
  console.error(`MCP server stderr: ${data.toString()}`);
});

// Set up error handling
mcpProcess.on('error', (err) => {
  console.error(`MCP server process error: ${err.message}`);
  process.exit(1);
});

mcpProcess.on('exit', (code, signal) => {
  console.log(`MCP server process exited with code ${code} and signal ${signal}`);
  process.exit(code || 0);
});

// Set up message handling
stdout.on('line', (line) => {
  try {
    console.log(`Received line from MCP server: ${line}`);
    const message = JSON.parse(line);
    handleMessage(message);
  } catch (err) {
    console.error(`Failed to parse message: ${line}, Error: ${err.message}`);
  }
});

// Send system.listMethods to discover available tools
console.log("Sending system.listMethods to discover available tools");
const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "system.listMethods",
  params: []
};

// Send the request
stdin.write(JSON.stringify(request) + '\n');

// Handle message from the MCP server
function handleMessage(message) {
  console.log('Received message:', JSON.stringify(message, null, 2));
  
  if (message.result) {
    console.log(`Discovered ${message.result.length} methods from MCP server`);
    
    // Wait a bit and then terminate
    setTimeout(() => {
      console.log('Terminating MCP server...');
      try {
        stdin.write(JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "system.terminate",
          params: []
        }) + '\n');
      } catch (err) {
        console.error(`Failed to send terminate message: ${err.message}`);
      }
      
      // Force exit after a timeout
      setTimeout(() => {
        console.log('Forcing process exit...');
        process.exit(0);
      }, 1000);
    }, 2000);
  }
}

// Handle SIGINT
process.on('SIGINT', () => {
  console.log('Received SIGINT, cleaning up...');
  try {
    mcpProcess.kill();
  } catch (err) {
    console.error(`Error killing process: ${err.message}`);
  }
  process.exit(0);
});

console.log("Waiting for response from MCP server..."); 