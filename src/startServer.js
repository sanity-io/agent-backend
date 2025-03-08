// Simple script to start the server with ESM support
// This helps handle ES Module compatibility

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load environment variables from available .env files
 * Follows ESM patterns for file access
 */
const loadEnvironment = () => {
  const envPaths = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../config/environments/.env'),
    path.resolve(__dirname, '../config/environments/.env.development'),
  ];

  let envLoaded = false;
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      console.log(`Loading environment from: ${envPath}`);
      dotenv.config({ path: envPath });
      envLoaded = true;
      break;
    }
  }

  if (!envLoaded) {
    console.warn('Warning: No .env file found. Using environment variables from system.');
  }
};

// Load environment
loadEnvironment();

console.log('Starting Sanity MCP Agent server with ESM support...');

// Find the path to the node executable
const nodePath = process.execPath;
console.log(`Using Node.js at: ${nodePath}`);

// Path to the Sanity MCP server
const sanityMcpServerPath = path.resolve(process.env.SANITY_MCP_SERVER_PATH || '/Users/even/projects/sanity/ai/mcp/sanity-mcp-server/dist/index.js');
console.log(`Sanity MCP server path: ${sanityMcpServerPath}`);

// Create environment for ESM compatibility
const enhancedEnv = {
  ...process.env,
  NODE_OPTIONS: '--no-warnings --trace-warnings --experimental-specifier-resolution=node',
  // Don't override NODE_PATH as it might interfere with the path resolution
};

// Start the server process
console.log('Spawning server process with ESM support...');
const serverProcess = spawn('node', ['--loader', 'ts-node/esm', './src/index.ts'], {
  cwd: process.cwd(),
  env: enhancedEnv,
  stdio: 'inherit'
});

serverProcess.on('error', (err) => {
  console.error('Failed to start server process:', err);
});

serverProcess.on('exit', (code, signal) => {
  console.log(`Server process exited with code ${code} and signal ${signal}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down server...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down server...');
  serverProcess.kill('SIGTERM');
});

console.log('Server startup script running. Press Ctrl+C to stop.'); 