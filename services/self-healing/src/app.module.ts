/**
 * Self-Healing Service — App Module
 *
 * Autonomous self-healing system for error detection, remediation,
 * learning, and alert correlation.
 * Requirements: 4.x, 5.x, 6.x, 12.x
 */

import { Module } from '@nestjs/common';
import { AlertCorrelationModule } from './alert-correlation/alert-correlation.module';
import { RemediationModule } from './remediation/remediation.module';
import { LearnerModule } from './learner/learner.module';

@Module({
  imports: [
    LearnerModule,
    RemediationModule,
    AlertCorrelationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
