/**
 * Error handling utilities for consistent error recovery and processing
 */
import { createLogger } from './logger.js';

// Logger specifically for error handling
const logger = createLogger('ErrorHandler');

/**
 * Extended error class with additional context
 */
export class AppError extends Error {
  public code: string;
  public details?: Record<string, any>;
  public status?: number;
  public recoverable: boolean;
  
  constructor(message: string, options: {
    code?: string;
    details?: Record<string, any>;
    status?: number;
    cause?: Error;
    recoverable?: boolean;
  } = {}) {
    // Handle error cause differently for Node.js versions that don't support the cause option
    super(message);
    
    if (options.cause) {
      // Set cause manually for older Node.js versions
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        writable: true
      });
    }
    
    this.name = this.constructor.name;
    this.code = options.code || 'INTERNAL_ERROR';
    this.details = options.details;
    this.status = options.status;
    this.recoverable = options.recoverable ?? false;
  }
}

/**
 * Connection-related errors
 */
export class ConnectionError extends AppError {
  constructor(message: string, options: {
    code?: string;
    details?: Record<string, any>;
    status?: number;
    cause?: Error;
    recoverable?: boolean;
  } = {}) {
    super(message, {
      ...options,
      code: options.code || 'CONNECTION_ERROR',
      status: options.status || 503,
      recoverable: options.recoverable ?? true
    });
  }
}

/**
 * Safely wrap a function with error handling
 */
export function tryCatch<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T> | T,
  options: {
    onError?: (error: Error, ...args: Args) => Promise<T> | T;
    logError?: boolean;
    rethrow?: boolean;
    context?: string;
  } = {}
): (...args: Args) => Promise<T> {
  const { 
    onError, 
    logError = true, 
    rethrow = true,
    context = 'unspecified'
  } = options;
  
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error) {
      const typedError = error instanceof Error 
        ? error 
        : new Error(String(error));
      
      if (logError) {
        logger.error(`Error in ${context}:`, {
          error: typedError,
          args: args.map(arg => {
            // Try to safely convert args to loggable format
            if (arg instanceof Error) return { message: arg.message, name: arg.name };
            if (typeof arg === 'object' && arg !== null) {
              try {
                // Try to get a loggable representation without circular references
                return JSON.parse(JSON.stringify(arg));
              } catch {
                return '[Unserializable Object]';
              }
            }
            return arg;
          })
        });
      }
      
      if (onError) {
        return await onError(typedError, ...args);
      }
      
      if (rethrow) {
        throw typedError;
      }
      
      // If not rethrowing and no onError handler, return undefined as T
      return undefined as unknown as T;
    }
  };
}

/**
 * Convert an unknown error to an AppError
 */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new AppError(error.message, {
      cause: error,
      code: error.name === 'Error' ? 'UNKNOWN_ERROR' : error.name.toUpperCase(),
      details: {
        originalStack: error.stack
      }
    });
  }
  
  return new AppError(
    typeof error === 'string'
      ? error
      : 'An unknown error occurred',
    { 
      code: 'UNKNOWN_ERROR',
      details: { originalError: error }
    }
  );
}

/**
 * Determines if a connection error is recoverable
 */
export function isRecoverableConnectionError(error: unknown): boolean {
  const normalized = normalizeError(error);
  
  // Specific codes that are usually recoverable
  const recoverableCodes = [
    'ECONNRESET', 
    'ECONNREFUSED', 
    'ETIMEDOUT', 
    'EPIPE', 
    'ENOTFOUND',
    'NETWORK_ERROR',
    'CONNECTION_ERROR'
  ];
  
  if (recoverableCodes.includes(normalized.code)) {
    return true;
  }
  
  // Explicitly marked as recoverable
  if (normalized.recoverable) {
    return true;
  }
  
  // Check message patterns for common recoverable errors
  const recoverablePatterns = [
    /connection.*refused/i,
    /network.*error/i,
    /timeout/i,
    /temporarily.*unavailable/i,
    /refused.*connect/i,
    /econnreset/i
  ];
  
  return recoverablePatterns.some(pattern => pattern.test(normalized.message));
} 