/**
 * Structured logger for consistent logging formats and levels throughout the application
 */

// Log levels ordered by severity
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

// Log level names for output
const logLevelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL',
};

// ANSI color codes for different log levels
const logLevelColors: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[36m', // Cyan
  [LogLevel.INFO]: '\x1b[32m',  // Green
  [LogLevel.WARN]: '\x1b[33m',  // Yellow
  [LogLevel.ERROR]: '\x1b[31m', // Red
  [LogLevel.FATAL]: '\x1b[35m', // Magenta
};

// Reset ANSI color code
const RESET_COLOR = '\x1b[0m';

// Default minimum log level from environment or INFO
const DEFAULT_LOG_LEVEL = process.env.MASTRA_LOG_LEVEL 
  ? parseLogLevel(process.env.MASTRA_LOG_LEVEL) 
  : LogLevel.INFO;

/**
 * Parse a string log level into a LogLevel enum value
 */
function parseLogLevel(level: string): LogLevel {
  switch (level.toLowerCase()) {
    case 'debug': return LogLevel.DEBUG;
    case 'info': return LogLevel.INFO;
    case 'warn': return LogLevel.WARN;
    case 'error': return LogLevel.ERROR;
    case 'fatal': return LogLevel.FATAL;
    default: return LogLevel.INFO;
  }
}

/**
 * Format log data into a structured string for output
 */
function formatLog(
  level: LogLevel,
  message: string,
  context?: Record<string, any>,
  useColor = true
): string {
  const timestamp = new Date().toISOString();
  const levelName = logLevelNames[level];
  const colorCode = useColor ? logLevelColors[level] : '';
  const resetCode = useColor ? RESET_COLOR : '';
  
  let formattedMessage = `${colorCode}[${timestamp}] [${levelName}]${resetCode} ${message}`;
  
  // Add context information if provided
  if (context && Object.keys(context).length > 0) {
    try {
      const contextStr = JSON.stringify(context, (key, value) => {
        // Handle special cases like Error objects
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack,
            // Don't try to include the error properties directly as it causes a duplicate 'message' property
            // Instead, extract any custom properties if needed
            ...(value as any).details
          };
        }
        return value;
      }, 2);
      formattedMessage += `\n${contextStr}`;
    } catch (err) {
      formattedMessage += `\n[Error serializing context: ${err}]`;
    }
  }
  
  return formattedMessage;
}

/**
 * Logger class for consistent structured logging
 */
export class Logger {
  private module: string;
  private minimumLevel: LogLevel;
  private useColors: boolean;
  
  /**
   * Create a new logger for a specific module
   * @param module - The module name for this logger
   * @param options - Configuration options
   */
  constructor(
    module: string,
    options: {
      level?: LogLevel;
      useColors?: boolean;
    } = {}
  ) {
    this.module = module;
    this.minimumLevel = options.level ?? DEFAULT_LOG_LEVEL;
    this.useColors = options.useColors ?? true;
  }
  
  /**
   * Log a message if the current level is sufficient
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (level >= this.minimumLevel) {
      const moduleMessage = `[${this.module}] ${message}`;
      const formattedMessage = formatLog(level, moduleMessage, context, this.useColors);
      
      // Output to the appropriate console method
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(formattedMessage);
          break;
      }
    }
  }
  
  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }
  
  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }
  
  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }
  
  /**
   * Log an error message
   */
  error(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context);
  }
  
  /**
   * Log a fatal error message
   */
  fatal(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.FATAL, message, context);
  }
  
  /**
   * Create a child logger with a sub-module name
   */
  createChildLogger(subModule: string, options: { level?: LogLevel } = {}): Logger {
    const childModule = `${this.module}:${subModule}`;
    return new Logger(childModule, {
      level: options.level ?? this.minimumLevel,
      useColors: this.useColors,
    });
  }
}

/**
 * Create a default root logger
 */
export const rootLogger = new Logger('App');

/**
 * Helper to create a logger for a specific module
 */
export function createLogger(module: string, options: { level?: LogLevel } = {}): Logger {
  return new Logger(module, options);
} 