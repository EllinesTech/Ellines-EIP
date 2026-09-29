/**
 * CommonModule — Task 22.1
 *
 * Provides shared infrastructure utilities: CacheService (Redis-backed
 * tenant-namespaced cache) available to any other module.
 *
 * Import this module where distributed caching is needed.
 */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CacheService } from './cache.service';

@Module({
  imports: [DatabaseModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CommonModule {}
