/**
 * ErrorEventBus — lightweight injectable Node.js EventEmitter
 *
 * Decouples the global exception filter (emitter) from the
 * SelfHealingDetectorService (subscriber) without pulling in
 * a heavyweight event-emitter package.
 *
 * Events:
 *   'error.captured' → ErrorLogEntry
 */

import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { ErrorLogEntry } from './detector.types';

export const ERROR_CAPTURED_EVENT = 'error.captured';

@Injectable()
export class ErrorEventBus extends EventEmitter {
  /** Emit a new error log entry to all subscribers. */
  emitError(entry: ErrorLogEntry): void {
    this.emit(ERROR_CAPTURED_EVENT, entry);
  }

  /** Subscribe to error log entries. Returns an unsubscribe function. */
  onError(handler: (entry: ErrorLogEntry) => void): () => void {
    this.on(ERROR_CAPTURED_EVENT, handler);
    return () => this.off(ERROR_CAPTURED_EVENT, handler);
  }
}
