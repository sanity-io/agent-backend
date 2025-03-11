// Mastra server startup script 
// Based on the existing startServer.js approach

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for debug mode
const isDebugMode = process.argv.includes('--debug');

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

if (isDebugMode) {
  console.log('Starting Mastra server in DEBUG mode for troubleshooting...');
} else {
  console.log('Starting Sanity MCP Agent server with Mastra (ESM support)...');
}

// Find the path to the node executable
const nodePath = process.execPath;
console.log(`Using Node.js at: ${nodePath}`);

// Path to the Sanity MCP server
const sanityMcpServerPath = path.resolve(process.env.SANITY_MCP_SERVER_PATH || '/Users/even/projects/sanity/ai/mcp/sanity-mcp-server/dist/index.js');
console.log(`Sanity MCP server path: ${sanityMcpServerPath}`);

// Create environment for ESM compatibility with debug options
const enhancedEnv = {
  ...process.env,
  NODE_OPTIONS: '--no-warnings --trace-warnings --experimental-specifier-resolution=node --trace-uncaught',
  DEBUG: 'true',
  DEBUG_LEVEL: 'verbose',
};

// Start the debug process or main server process
const scriptToRun = './src/mastraIndex.ts';
console.log(`Running script: ${scriptToRun}`);

// Spawn the process with proper options
console.log(`Spawning ${isDebugMode ? 'debug' : 'server'} process with ESM support...`);
const serverProcess = spawn('node', [
  isDebugMode ? '--inspect' : '',  // Add Node.js inspector only in debug mode
  '--loader', 
  'ts-node/esm', 
  scriptToRun
].filter(Boolean), // Remove empty strings from the array
{
  cwd: process.cwd(),
  env: enhancedEnv,
  stdio: 'inherit'
});

serverProcess.on('error', (err) => {
  console.error('Failed to start process:', err);
});

serverProcess.on('exit', (code, signal) => {
  if (code !== 0) {
    console.error(`Process exited with code ${code} and signal ${signal}`);
    console.error('This indicates an error during startup. Check the logs above for details.');
    
    if (code === 1) {
      console.log('\nTroubleshooting tips:');
      console.log('1. Check for syntax errors in recently modified files');
      console.log('2. Verify all imports use proper ESM format with .js extensions');
      console.log('3. Check for circular dependencies between modules');
      console.log('4. Ensure environment variables are properly set');
      console.log('\nTry running in debug mode:');
      console.log('node src/startMastra.js --debug');
    }
  } else {
    if (isDebugMode) {
      console.log('Debug process completed successfully! Now try running without debug mode.');
    } else {
      console.log(`Server process exited normally with code ${code}.`);
    }
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down...');
  serverProcess.kill('SIGTERM');
});

console.log(`${isDebugMode ? 'Debug' : 'Server'} startup script running. Press Ctrl+C to stop.`); 