/**
 * Security Anomaly Module
 *
 * NestJS module for advanced security and anomaly detection capabilities.
 *
 * Provides:
 *   - AnomalyDetectionEngineService — orchestrates all security analysis
 *   - UserBehaviorProfilerService — per-role/dept baselines (Req 15.7)
 *   - DataExfiltrationDetectorService — large download detection (Req 15.2)
 *   - ImpossibleTravelDetectorService — geo-impossible travel (Req 15.3)
 *   - PrivilegeEscalationDetectorService — role violation detection (Req 15.4)
 *   - SecurityProtectionService — protective actions (Req 15.5)
 *   - SecurityIncidentReportGeneratorService — structured reports (Req 15.6)
 *   - SecurityPolicyStoreService — policy CRUD (Req 15.8)
 *   - SecurityAnomalyDetectorService — legacy monolithic detector (backward compat)
 *
 * Controllers:
 *   - SecurityAnomalyController — session/event/analysis endpoints
 *   - SecurityPolicyController — policy CRUD for IT Admin (Req 15.8)
 *
 * Requirements: 15.1–15.8
 */

import { Module } from '@nestjs/common';

// Core engine
import { AnomalyDetectionEngineService } from './anomaly-detection-engine.service';

// Individual detectors
import { UserBehaviorProfilerService } from './user-behavior-profiler.service';
import { DataExfiltrationDetectorService } from './data-exfiltration-detector.service';
import { ImpossibleTravelDetectorService } from './impossible-travel-detector.service';
import { PrivilegeEscalationDetectorService } from './privilege-escalation-detector.service';

// Protective actions & reporting
import { SecurityProtectionService } from './security-protection.service';
import { SecurityIncidentReportGeneratorService } from './security-incident-report-generator.service';

// Policy store
import { SecurityPolicyStoreService } from './security-policy-store.service';

// Legacy monolithic service (kept for backward compatibility)
import { SecurityAnomalyDetectorService } from './security-anomaly-detector.service';

// Controllers
import { SecurityAnomalyController } from './security-anomaly.controller';
import { SecurityPolicyController } from './security-policy.controller';

@Module({
  controllers: [
    SecurityAnomalyController,
    SecurityPolicyController,
  ],
  providers: [
    // Policy store (no dependencies)
    SecurityPolicyStoreService,

    // Individual detectors
    UserBehaviorProfilerService,
    ImpossibleTravelDetectorService,
    PrivilegeEscalationDetectorService,

    // DataExfiltrationDetector depends on UserBehaviorProfiler
    DataExfiltrationDetectorService,

    // SecurityProtection depends on ImpossibleTravelDetector
    SecurityProtectionService,

    // Report generator (no external dependencies)
    SecurityIncidentReportGeneratorService,

    // Engine orchestrates all above services
    AnomalyDetectionEngineService,

    // Legacy service (backward compatibility)
    SecurityAnomalyDetectorService,
  ],
  exports: [
    AnomalyDetectionEngineService,
    SecurityAnomalyDetectorService,
    SecurityPolicyStoreService,
    UserBehaviorProfilerService,
    SecurityProtectionService,
    SecurityIncidentReportGeneratorService,
  ],
})
export class SecurityAnomalyModule {}
