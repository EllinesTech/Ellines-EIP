/**
 * Winston LoggerService adapter (Q.2 — Structured logging)
 *
 * Bridges NestJS's built-in LoggerService interface to Winston,
 * so all NestJS framework logs (bootstrap, DI, guards, etc.)
 * route through the same structured Winston pipeline.
 *
 * Usage in main.ts:
 *   const app = await NestFactory.create(AppModule, { bufferLogs: true });
 *   app.useLogger(app.get(WinstonLoggerService));
 */
import { Injectable, LoggerService, Inject } from '@nestjs/common';
import type { Logger as WinstonLogger } from 'winston';

@Injectable()
export class WinstonLoggerService implements LoggerService {
  constructor(
    @Inject('WINSTON_LOGGER') private readonly winston: WinstonLogger,
  ) {}

  log(message: string, context?: string) {
    this.winston.info(this.format(message, context));
  }

  error(message: string, trace?: string, context?: string) {
    this.winston.error(this.format(message, context), { trace });
  }

  warn(message: string, context?: string) {
    this.winston.warn(this.format(message, context));
  }

  debug(message: string, context?: string) {
    this.winston.debug(this.format(message, context));
  }

  verbose(message: string, context?: string) {
    this.winston.verbose(this.format(message, context));
  }

  private format(message: string, context?: string): string {
    return context ? `[${context}] ${message}` : message;
  }
}
