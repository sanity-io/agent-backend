// Simple debug script to test MCP Client directly
import { fileURLToPath } from 'url';
import path from 'path';
import * as dotenv from 'dotenv';
import { SimpleMCPClient } from './src/mcp/SimpleMCPClient.js';

// Load environment variables
const result = dotenv.config();
if (result.error) {
  console.error('Error loading .env file:', result.error);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('Starting debug test of SimpleMCPClient');
  console.log('Node version:', process.version);
  console.log('Current working directory:', process.cwd());
  
  try {
    const mcpServerPath = process.env.SANITY_MCP_SERVER_PATH || 
      '/Users/even/projects/sanity/ai/mcp/sanity-mcp-server/dist/index.js';
    
    console.log('MCP server path:', mcpServerPath);
    
    const client = new SimpleMCPClient({
      serverPath: mcpServerPath,
    });
    
    console.log('Created client instance, connecting...');
    await client.connect();
    
    const tools = client.getTools();
    console.log(`Got ${tools.length} tools from MCP server`);
    
    await client.disconnect();
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Error in test:', error);
  }
}

main().catch(console.error); 