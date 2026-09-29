/**
 * SecurityModule — behaviour baseline, anomaly detection, and security policy.
 *
 * Providers:
 *  - BehaviourBaselineService  — records user request patterns in InfluxDB
 *                                 and caches computed baselines in Redis.
 *  - AnomalyDetectorService    — detects impossible travel, concurrent sessions,
 *                                 large exports, and privilege escalation.
 *  - SecurityPolicyController  — PATCH /api/v1/orgs/:slug/security-policy
 *
 * Requirements: 15.1–15.8
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DatabaseModule } from '../database/database.module';
import { BehaviourBaselineService } from './behaviour-baseline.service';
import { AnomalyDetectorService } from './anomaly-detector.service';
import { SecurityPolicyController } from './security-policy.controller';

@Module({
  imports: [PrismaModule, DatabaseModule],
  providers: [BehaviourBaselineService, AnomalyDetectorService],
  controllers: [SecurityPolicyController],
  exports: [BehaviourBaselineService, AnomalyDetectorService],
})
export class SecurityModule {}
