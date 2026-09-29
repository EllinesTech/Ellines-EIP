/**
 * JobQueueService — Task 22.3
 *
 * Simple in-memory job queue for background task processing.
 * Production upgrade path: replace the array with a Redis-backed queue
 * (e.g. BullMQ) without changing the enqueue/dequeue interface.
 *
 * Requirement 22.3: Background job dispatch for async processing.
 */
import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface Job {
  id: string;
  type: string;
  payload: unknown;
  enqueuedAt: Date;
}

@Injectable()
export class JobQueueService {
  private readonly logger = new Logger(JobQueueService.name);
  private readonly queue: Job[] = [];

  /**
   * Add a job to the tail of the queue.
   *
   * @param type     A string identifier for the job handler (e.g. 'sync.connector').
   * @param payload  Arbitrary serialisable data for the handler.
   * @returns        The assigned job ID.
   */
  enqueue(type: string, payload: unknown): string {
    const id = crypto.randomUUID();
    const job: Job = { id, type, payload, enqueuedAt: new Date() };
    this.queue.push(job);
    this.logger.debug(`Enqueued job ${id} (${type}) — queue size: ${this.queue.length}`);
    return id;
  }

  /**
   * Remove and return the next job from the head of the queue.
   * Returns `null` when the queue is empty.
   */
  dequeue(): Job | null {
    return this.queue.shift() ?? null;
  }

  /**
   * Return the current number of queued jobs without removing any.
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Peek at the next job without removing it.
   */
  peek(): Job | null {
    return this.queue[0] ?? null;
  }
}
