/**
 * Security Anomaly Module
 *
 * NestJS module for advanced security and anomaly detection capabilities.
 * Requirements: 15.1–15.8
 */

import { Module } from '@nestjs/common';
import { SecurityAnomalyDetectorService } from './security-anomaly-detector.service';
import { SecurityAnomalyController } from './security-anomaly.controller';

@Module({
  controllers: [SecurityAnomalyController],
  providers: [SecurityAnomalyDetectorService],
  exports: [SecurityAnomalyDetectorService],
})
export class SecurityAnomalyModule {}
