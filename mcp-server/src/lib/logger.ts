/**
 * Logger utility for Specster MCP Server
 * Provides structured logging with different log levels
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  enableTimestamp?: boolean;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, any>;
  error?: Error;
}

/**
 * Logger class for structured logging throughout the application
 */
export class Logger {
  private config: LoggerConfig;
  private logs: LogEntry[] = [];

  /**
   * Creates a new Logger instance
   * @param config - Logger configuration
   */
  constructor(config: LoggerConfig) {
    this.config = {
      enableTimestamp: true,
      ...config
    };
  }

  /**
   * Logs a debug message
   * @param message - The message to log
   * @param context - Optional context data
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Logs an info message
   * @param message - The message to log
   * @param context - Optional context data
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Logs a warning message
   * @param message - The message to log
   * @param context - Optional context data
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Logs an error message
   * @param message - The message to log
   * @param error - Optional error object
   * @param context - Optional context data
   */
  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, { ...context, error: error?.message });
  }

  /**
   * Internal method to handle logging
   * @param level - Log level
   * @param message - The message to log
   * @param context - Optional context data
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context
    };

    this.logs.push(entry);
    this.output(entry);
  }

  /**
   * Determines if a message should be logged based on configured level
   * @param level - The log level to check
   * @returns Whether the message should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Outputs the log entry to console
   * @param entry - The log entry to output
   */
  private output(entry: LogEntry): void {
    const prefix = this.config.prefix ? `[${this.config.prefix}] ` : '';
    const timestamp = this.config.enableTimestamp ? `[${entry.timestamp.toISOString()}] ` : '';
    const levelStr = `[${entry.level.toUpperCase()}]`;
    
    const message = `${timestamp}${prefix}${levelStr} ${entry.message}`;
    
    // TODO: Implement actual output logic
    console.log(message, entry.context || '');
  }

  /**
   * Gets all logged entries
   * @returns Array of log entries
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Clears all logged entries
   */
  clearLogs(): void {
    this.logs = [];
  }
}