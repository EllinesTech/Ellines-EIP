import * as winston from 'winston';
import { getCorrelationId } from './correlation.middleware';

/**
 * Structured log context interface
 */
export interface LogContext {
  trace_id: string;
  user_id?: string;
  org_id?: string;
  request_id?: string;
  service: string;
  operation: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  timestamp?: string;
  duration_ms?: number;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Generate a unique trace ID
 */
export function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Structured logger wrapper
 * Automatically injects correlation_id from async request context when available.
 */
export class Logger {
  constructor(private winstonLogger: winston.Logger) {}

  /**
   * Log a structured message with context
   */
  log(context: LogContext) {
    const { level, service, operation, ...rest } = context;
    const message = `[${service}] ${operation}`;

    this.winstonLogger.log({
      level,
      message,
      timestamp: new Date().toISOString(),
      correlation_id: getCorrelationId(),
      ...rest,
    });
  }

  /**
   * Log an error with full context
   */
  error(context: LogContext, error: Error) {
    const { service, operation, level: _level, ...rest } = context;
    const message = error.message || `[${service}] ${operation}`;

    this.winstonLogger.error({
      message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      correlation_id: getCorrelationId(),
      ...rest,
    });
  }

  /**
   * Log at debug level
   */
  debug(context: Omit<LogContext, 'level'>) {
    this.log({ ...context, level: 'debug' });
  }

  /**
   * Log at info level
   */
  info(context: Omit<LogContext, 'level'>) {
    this.log({ ...context, level: 'info' });
  }

  /**
   * Log at warn level
   */
  warn(context: Omit<LogContext, 'level'>) {
    this.log({ ...context, level: 'warn' });
  }
}
