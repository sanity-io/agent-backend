/**
 * Debug startup file to identify import issues
 */

console.log('=== DEBUG STARTUP - IMPORT TRACING ===');

// Core imports
console.log('Loading core dependencies...');
import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
console.log('✅ Core dependencies loaded');

// Load utils first
console.log('Loading utility modules...');
import { createLogger, LogLevel } from "./utils/logger.js";
console.log('✅ Logger loaded');

// Set up basic logging
const logger = createLogger('Debug', { level: LogLevel.DEBUG });
logger.info('Logger initialized successfully');

// Try loading error handler
console.log('Loading error handler...');
import { normalizeError } from "./utils/errorHandler.js";
console.log('✅ Error handler loaded');

// Load AI dependencies
console.log('Loading AI dependencies...');
import { SanityAgentAdapter } from "./langgraph/core/SanityAgentAdapter.js";
import { SanityMCPClient } from "./langgraph/utils/MCPClient.js";
import { anthropic } from "@ai-sdk/anthropic";
console.log('✅ AI dependencies loaded');

// Finally try loading the WebSocket server
console.log('Loading WebSocket server...');
import { LangGraphWebSocketServer } from "./server/langGraphWebSocketServer.js";
console.log('✅ WebSocket server loaded');

// Set up __dirname as we're in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log(`__dirname: ${__dirname}`);

// Load environment variables
try {
  const envPath = path.resolve(__dirname, "../.env");
  console.log(`Loading environment from: ${envPath}`);
  dotenv.config({ path: envPath });
  console.log('✅ Environment loaded');
} catch (envError) {
  console.error('❌ Failed to load environment:', envError);
  process.exit(1);
}

logger.info('All modules loaded successfully, exiting debug mode');
console.log('=== DEBUG STARTUP COMPLETE ==='); 