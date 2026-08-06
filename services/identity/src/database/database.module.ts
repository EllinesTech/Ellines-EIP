import { Module } from '@nestjs/common';
import { DatabaseSwitcherService } from './database-switcher.service';

/**
 * DatabaseModule provides services for runtime database switching
 * and management across multi-database deployments.
 */
@Module({
  providers: [DatabaseSwitcherService],
  exports: [DatabaseSwitcherService],
})
export class DatabaseModule {}
