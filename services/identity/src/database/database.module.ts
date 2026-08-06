import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseSwitcherService } from './database-switcher.service';
import { DatabaseContextInterceptor } from './database-context.interceptor';

/**
 * DatabaseModule provides services for runtime database switching
 * and management across multi-database deployments.
 * 
 * Exports:
 * - DatabaseSwitcherService: Core service for DB config management
 * - DatabaseContextInterceptor: Global interceptor for request context
 */
@Module({
  providers: [
    DatabaseSwitcherService,
    {
      provide: APP_INTERCEPTOR,
      useClass: DatabaseContextInterceptor,
    },
  ],
  exports: [DatabaseSwitcherService],
})
export class DatabaseModule {}
