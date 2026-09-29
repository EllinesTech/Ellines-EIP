/**
 * JobsModule — Task 22.3
 *
 * Registers the in-memory job queue.  Import this module in any NestJS
 * module that needs to enqueue background jobs.
 */
import { Module } from '@nestjs/common';
import { JobQueueService } from './job-queue.service';

@Module({
  providers: [JobQueueService],
  exports: [JobQueueService],
})
export class JobsModule {}
