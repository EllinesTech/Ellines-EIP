import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseSwitcherService } from './database-switcher.service';
import { DatabaseContextInterceptor } from './database-context.interceptor';
import { EncryptionModule } from '../encryption/encryption.module';
import { Neo4jService } from './neo4j.service';
import { InfluxDbService } from './influxdb.service';
import { RedisService } from './redis.service';

/**
 * DatabaseModule provides services for runtime database switching
 * and management across multi-database deployments.
 *
 * Exports:
 * - DatabaseSwitcherService: Core service for DB config management
 * - DatabaseContextInterceptor: Global interceptor for request context
 * - Neo4jService: Graph database client (tenant-isolated via organization_id)
 * - InfluxDbService: Time-series database client (tenant-isolated via org_id tag)
 * - RedisService: Cache / pub-sub client (key-namespaced eip:{orgId}:{domain}:{key})
 */
@Module({
  imports: [EncryptionModule],
  providers: [
    DatabaseSwitcherService,
    Neo4jService,
    InfluxDbService,
    RedisService,
    {
      provide: APP_INTERCEPTOR,
      useClass: DatabaseContextInterceptor,
    },
  ],
  exports: [DatabaseSwitcherService, Neo4jService, InfluxDbService, RedisService],
})
export class DatabaseModule {}
