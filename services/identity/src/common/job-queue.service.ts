/**
 * JobQueueService
 *
 * Simple async job queue backed by an in-memory array with optional Redis
 * persistence via lpush/lrange.  Jobs are enqueued and processed serially
 * by type-specific handlers.
 *
 * Requirement 22.3: Async job queue for background processing.
 *
 * Design:
 *   - enqueue(job) → adds to the in-memory queue AND pushes to Redis list
 *     (if Redis is configured) so jobs survive a process restart.
 *   - process() → drains the in-memory queue, calling registered handlers.
 *   - registerHandler(type, fn) → attach a handler for a specific job type.
 *
 * The queue key follows the `eip:{orgId}:jobs:{type}` namespace convention
 * (Requirement 22.1).  Use `'platform'` as orgId for platform-level jobs.
 */

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../database/redis.service';

export interface Job<T = unknown> {
  id: string;
  type: string;
  organizationId: string;
  payload: T;
  enqueuedAt: Date;
  attempts: number;
}

type JobHandler<T = unknown> = (job: Job<T>) => Promise<void>;

@Injectable()
export class JobQueueService {
  private readonly logger = new Logger(JobQueueService.name);

  private readonly queue: Job[] = [];
  private readonly handlers = new Map<string, JobHandler>();
  private processing = false;

  constructor(private readonly redis: RedisService) {}

  // ---------------------------------------------------------------------------
  // Handler registration
  // ---------------------------------------------------------------------------

  /**
   * Register an async handler for a specific job type.
   * Only one handler per type; subsequent registrations overwrite the previous.
   */
  registerHandler<T = unknown>(type: string, handler: JobHandler<T>): void {
    this.handlers.set(type, handler as JobHandler);
    this.logger.log(`JobQueue: handler registered for type="${type}"`);
  }

  // ---------------------------------------------------------------------------
  // Enqueue
  // ---------------------------------------------------------------------------

  /**
   * Add a job to the queue and persist it to Redis.
   *
   * @param type            Job type (must match a registered handler).
   * @param organizationId  Tenant scope — used as part of the Redis key.
   * @param payload         Arbitrary job data.
   */
  async enqueue<T = unknown>(
    type: string,
    organizationId: string,
    payload: T,
  ): Promise<Job<T>> {
    const job: Job<T> = {
      id: crypto.randomUUID(),
      type,
      organizationId,
      payload,
      enqueuedAt: new Date(),
      attempts: 0,
    };

    // In-memory queue
    this.queue.push(job as Job);

    // Redis persistence (non-fatal if Redis unavailable)
    try {
      const redisKey = this.redis.buildKey(organizationId, 'jobs', type);
      await this.redis.lpush(redisKey, JSON.stringify(job));
    } catch (err) {
      this.logger.warn(`JobQueue: Redis persist failed for job ${job.id}: ${(err as Error).message}`);
    }

    this.logger.debug(`JobQueue: enqueued job id=${job.id} type=${type} org=${organizationId}`);
    return job;
  }

  // ---------------------------------------------------------------------------
  // Process
  // ---------------------------------------------------------------------------

  /**
   * Drain the in-memory queue by calling the registered handler for each job.
   * Runs jobs serially (one at a time) to avoid overloading downstream services.
   *
   * Errors in individual handlers are caught and logged — they do not stop
   * subsequent jobs from being processed.
   */
  async process(): Promise<{ processed: number; failed: number }> {
    if (this.processing) {
      this.logger.warn('JobQueue.process() called while already processing — skipping');
      return { processed: 0, failed: 0 };
    }

    this.processing = true;
    let processed = 0;
    let failed = 0;

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        const handler = this.handlers.get(job.type);

        if (!handler) {
          this.logger.warn(`JobQueue: no handler for type="${job.type}" — skipping job ${job.id}`);
          failed++;
          continue;
        }

        job.attempts++;

        try {
          await handler(job);
          processed++;
          this.logger.debug(`JobQueue: processed job ${job.id} (type=${job.type})`);
        } catch (err) {
          failed++;
          this.logger.error(
            `JobQueue: handler error for job ${job.id} (type=${job.type}): ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this.processing = false;
    }

    this.logger.log(`JobQueue.process(): processed=${processed}, failed=${failed}`);
    return { processed, failed };
  }

  // ---------------------------------------------------------------------------
  // Introspection
  // ---------------------------------------------------------------------------

  /** Return the number of jobs currently waiting in the in-memory queue. */
  get pendingCount(): number {
    return this.queue.length;
  }

  /** Return a read-only snapshot of the pending jobs. */
  getPendingJobs(): ReadonlyArray<Job> {
    return [...this.queue];
  }

  /**
   * Retrieve persisted jobs from Redis for a given org and job type.
   * Useful for recovering jobs after a process restart.
   *
   * @param organizationId  Tenant scope.
   * @param type            Job type to retrieve.
   * @param limit           Maximum number of jobs to load (default: 100).
   */
  async loadFromRedis(
    organizationId: string,
    type: string,
    limit = 100,
  ): Promise<Job[]> {
    const redisKey = this.redis.buildKey(organizationId, 'jobs', type);
    const raw = await this.redis.lrange(redisKey, 0, limit - 1);
    const jobs: Job[] = [];

    for (const item of raw) {
      try {
        jobs.push(JSON.parse(item) as Job);
      } catch {
        this.logger.warn(`JobQueue: failed to parse persisted job from Redis`);
      }
    }

    return jobs;
  }
}
