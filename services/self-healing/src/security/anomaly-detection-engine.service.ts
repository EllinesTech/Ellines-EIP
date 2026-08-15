/**
 * Anomaly Detection Engine
 *
 * Orchestrates all security detectors and coordinates the full security
 * analysis pipeline:
 *   1. UserBehaviorProfiler — build baselines
 *   2. DataExfiltrationDetector — detect large exports
 *   3. ImpossibleTravelDetector — detect impossible travel
 *   4. PrivilegeEscalationDetector — detect role violations
 *   5. SecurityProtectionService — execute protective actions
 *   6. SecurityIncidentReportGenerator — produce structured reports
 *
 * Requirements: 15.1–15.8
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  SecurityEvent,
  SecurityPolicy,
  SecurityIncidentReport,
  UserSession,
} from './security-anomaly.interfaces';
import { UserBehaviorProfilerService } from './user-behavior-profiler.service';
import { DataExfiltrationDetectorService } from './data-exfiltration-detector.service';
import { ImpossibleTravelDetectorService } from './impossible-travel-detector.service';
import { PrivilegeEscalationDetectorService } from './privilege-escalation-detector.service';
import { SecurityProtectionService } from './security-protection.service';
import {
  SecurityIncidentReportGeneratorService,
  EnrichedSecurityIncidentReport,
} from './security-incident-report-generator.service';
import { SecurityPolicyStoreService } from './security-policy-store.service';

export interface SessionAnalysisResult {
  events: SecurityEvent[];
  reports: EnrichedSecurityIncidentReport[];
  protectiveActionsCount: number;
}

@Injectable()
export class AnomalyDetectionEngineService {
  private readonly logger = new Logger(AnomalyDetectionEngineService.name);

  /** In-memory unusual-access event log (complement to travel detector sessions) */
  private readonly securityEvents: SecurityEvent[] = [];

  constructor(
    public readonly profiler: UserBehaviorProfilerService,
    public readonly exfiltrationDetector: DataExfiltrationDetectorService,
    public readonly travelDetector: ImpossibleTravelDetectorService,
    public readonly privEscDetector: PrivilegeEscalationDetectorService,
    public readonly protection: SecurityProtectionService,
    public readonly reportGenerator: SecurityIncidentReportGeneratorService,
    public readonly policyStore: SecurityPolicyStoreService,
  ) {}

  // ── Primary analysis pipeline ─────────────────────────────────────────────

  /**
   * Full security analysis for a user session.
   *
   * Steps:
   *   1. Register session with impossible-travel detector
   *   2. Run all detectors in parallel
   *   3. Auto-remediate high-confidence events
   *   4. Generate incident reports
   *   5. Update user behavior baseline
   */
  async analyzeSession(
    session: UserSession,
    role: string,
    department: string,
    autoRemediate = true,
  ): Promise<SessionAnalysisResult> {
    const policy = this.policyStore.getEffectivePolicy(session.organizationId);

    // Register with travel detector
    this.travelDetector.registerSession(session);

    const detected: SecurityEvent[] = [];

    // Run detectors in parallel
    const [exfil, travel, unusual] = await Promise.all([
      this.runExfiltrationDetection(session, role, department, policy),
      this.runTravelDetection(session, policy),
      this.runUnusualAccessDetection(session, policy),
    ]);

    if (exfil) detected.push(exfil);
    if (travel) detected.push(travel);
    if (unusual) detected.push(unusual);

    // Store detected events
    this.securityEvents.push(...detected);

    // Auto-remediate + generate reports
    const reports: EnrichedSecurityIncidentReport[] = [];
    let protectiveActionsCount = 0;

    for (const event of detected) {
      let actions = [];
      if (autoRemediate) {
        actions = await this.protection.autoRemediate(event, policy);
        protectiveActionsCount += actions.length;
      }
      const report = this.reportGenerator.generate(event, actions);
      reports.push(report);
    }

    // Update behavior baseline after session analysis
    this.profiler.recordSession(session, role, department);

    if (detected.length > 0) {
      this.logger.log(
        `[Engine] Session ${session.sessionId} analysis complete: ` +
          `${detected.length} events, ${reports.length} reports, ` +
          `${protectiveActionsCount} protective actions for user=${session.userId}`,
      );
    }

    return { events: detected, reports, protectiveActionsCount };
  }

  /**
   * Check a single endpoint access attempt for privilege escalation.
   */
  checkPrivilegeEscalation(
    userId: string,
    organizationId: string,
    sessionId: string | undefined,
    attemptedEndpoint: string,
    userRole: string,
  ): { detected: boolean; event?: SecurityEvent; report?: EnrichedSecurityIncidentReport } {
    const event = this.privEscDetector.detect(
      userId,
      organizationId,
      sessionId,
      attemptedEndpoint,
      userRole,
    );

    if (!event) return { detected: false };

    this.securityEvents.push(event);
    const report = this.reportGenerator.generate(event, []);

    return { detected: true, event, report };
  }

  // ── Detector wrappers ─────────────────────────────────────────────────────

  private async runExfiltrationDetection(
    session: UserSession,
    role: string,
    department: string,
    policy: SecurityPolicy,
  ): Promise<SecurityEvent | null> {
    try {
      return this.exfiltrationDetector.detect(session, role, department, policy);
    } catch (err: unknown) {
      this.logger.error(`[Engine] Exfiltration detection error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async runTravelDetection(
    session: UserSession,
    policy: SecurityPolicy,
  ): Promise<SecurityEvent | null> {
    try {
      return this.travelDetector.detect(session, policy);
    } catch (err: unknown) {
      this.logger.error(`[Engine] Travel detection error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async runUnusualAccessDetection(
    session: UserSession,
    policy: SecurityPolicy,
  ): Promise<SecurityEvent | null> {
    try {
      return this.detectUnusualAccess(session, policy);
    } catch (err: unknown) {
      this.logger.error(`[Engine] Unusual access detection error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Req 15.1: Detect unusual access patterns vs established baseline.
   */
  private detectUnusualAccess(
    session: UserSession,
    policy: SecurityPolicy,
  ): SecurityEvent | null {
    const baseline = this.profiler.getUserBaseline(session.userId);
    if (!baseline || baseline.sampleCount < 5) return null;

    const requestDeviation =
      session.requestCount / Math.max(baseline.avgRequestsPerSession, 1);
    const dataDeviation =
      session.dataAccessedBytes / Math.max(baseline.avgDataAccessedBytes, 1);

    // deviationThreshold is 1.5x to 5x depending on sensitivity (0=low, 1=high)
    const deviationThreshold = 5 - policy.anomalySensitivity * 4;
    const maxDeviation = Math.max(requestDeviation, dataDeviation);

    if (maxDeviation <= deviationThreshold) return null;

    const confidence = Math.min(
      0.5 + 0.1 * (maxDeviation - deviationThreshold),
      0.95,
    );
    const severity = confidence >= 0.8 ? 'high' : 'medium';

    const event: SecurityEvent = {
      id: `unusual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      organizationId: session.organizationId,
      userId: session.userId,
      sessionId: session.sessionId,
      type: 'unusual_access',
      severity,
      confidence,
      evidence: {
        description: `Access pattern deviates significantly from baseline: ${requestDeviation.toFixed(1)}x requests, ${dataDeviation.toFixed(1)}x data`,
        data: {
          requestDeviation,
          dataDeviation,
          deviationThreshold,
          baselineRequests: baseline.avgRequestsPerSession,
          observedRequests: session.requestCount,
          baselineDataBytes: baseline.avgDataAccessedBytes,
          observedDataBytes: session.dataAccessedBytes,
        },
        baseline,
        observed: {
          requestCount: session.requestCount,
          dataAccessedBytes: session.dataAccessedBytes,
        },
      },
      timestamp: new Date(),
      resolved: false,
    };

    this.logger.warn(
      `[Engine] Unusual access: user=${session.userId} ` +
        `req-dev=${requestDeviation.toFixed(2)}x data-dev=${dataDeviation.toFixed(2)}x ` +
        `threshold=${deviationThreshold.toFixed(2)}x conf=${confidence.toFixed(2)}`,
    );
    return event;
  }

  // ── Query interface ────────────────────────────────────────────────────────

  getSecurityEvents(
    organizationId: string,
    options?: { limit?: number; unresolved?: boolean },
  ): SecurityEvent[] {
    let events = this.securityEvents.filter(
      (e) => e.organizationId === organizationId,
    );
    if (options?.unresolved) {
      events = events.filter((e) => !e.resolved);
    }
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return events.slice(0, options?.limit ?? 50);
  }

  resolveEvent(eventId: string): boolean {
    const event = this.securityEvents.find((e) => e.id === eventId);
    if (!event) return false;
    event.resolved = true;
    event.resolvedAt = new Date();
    return true;
  }
}
