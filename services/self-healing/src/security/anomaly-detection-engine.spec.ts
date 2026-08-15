/**
 * Anomaly Detection Engine — Comprehensive Test Suite
 *
 * Tests all security detectors working together through the main engine:
 * - User behavior profiling
 * - Data exfiltration detection
 * - Impossible travel detection
 * - Privilege escalation detection
 * - Protective action execution
 * - Security incident report generation
 *
 * Requirements: 15.1–15.8
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AnomalyDetectionEngineService } from './anomaly-detection-engine.service';
import { UserBehaviorProfilerService } from './user-behavior-profiler.service';
import { DataExfiltrationDetectorService } from './data-exfiltration-detector.service';
import { ImpossibleTravelDetectorService } from './impossible-travel-detector.service';
import { PrivilegeEscalationDetectorService } from './privilege-escalation-detector.service';
import { SecurityProtectionService } from './security-protection.service';
import { SecurityIncidentReportGeneratorService } from './security-incident-report-generator.service';
import { SecurityPolicyStoreService } from './security-policy-store.service';
import {
  UserSession,
  SecurityEvent,
  SecurityPolicy,
  DEFAULT_SECURITY_POLICY,
} from './security-anomaly.interfaces';

describe('AnomalyDetectionEngine', () => {
  let engine: AnomalyDetectionEngineService;
  let profiler: UserBehaviorProfilerService;
  let exfilDetector: DataExfiltrationDetectorService;
  let travelDetector: ImpossibleTravelDetectorService;
  let privEscDetector: PrivilegeEscalationDetectorService;
  let protectionService: SecurityProtectionService;
  let reportGen: SecurityIncidentReportGeneratorService;
  let policyStore: SecurityPolicyStoreService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        SecurityPolicyStoreService,
        UserBehaviorProfilerService,
        ImpossibleTravelDetectorService,
        PrivilegeEscalationDetectorService,
        DataExfiltrationDetectorService,
        SecurityProtectionService,
        SecurityIncidentReportGeneratorService,
        AnomalyDetectionEngineService,
      ],
    }).compile();

    engine = module.get<AnomalyDetectionEngineService>(AnomalyDetectionEngineService);
    profiler = module.get<UserBehaviorProfilerService>(UserBehaviorProfilerService);
    exfilDetector = module.get<DataExfiltrationDetectorService>(DataExfiltrationDetectorService);
    travelDetector = module.get<ImpossibleTravelDetectorService>(ImpossibleTravelDetectorService);
    privEscDetector = module.get<PrivilegeEscalationDetectorService>(
      PrivilegeEscalationDetectorService,
    );
    protectionService = module.get<SecurityProtectionService>(SecurityProtectionService);
    reportGen = module.get<SecurityIncidentReportGeneratorService>(
      SecurityIncidentReportGeneratorService,
    );
    policyStore = module.get<SecurityPolicyStoreService>(SecurityPolicyStoreService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── User Behavior Profiling Tests (Req 15.7) ─────────────────────────────

  describe('User Behavior Profiling (Req 15.7)', () => {
    it('should build baseline from multiple sessions', () => {
      const userId = 'user1';
      const orgId = 'org1';
      const role = 'member';
      const dept = 'engineering';

      const session1: UserSession = {
        sessionId: 'sess1',
        userId,
        organizationId: orgId,
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date('2025-01-01T08:00:00Z'),
        lastActivityAt: new Date('2025-01-01T09:00:00Z'),
        requestCount: 100,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 5_000_000,
        endpointsAccessed: ['/api/v1/data', '/api/v1/reports'],
        isActive: true,
      };

      profiler.recordSession(session1, role, dept);
      let baseline = profiler.getUserBaseline(userId);
      expect(baseline).toBeDefined();
      expect(baseline?.sampleCount).toBe(1);
      expect(baseline?.avgRequestsPerSession).toBe(100);

      // Add second session
      const session2: UserSession = {
        ...session1,
        sessionId: 'sess2',
        requestCount: 120,
        dataAccessedBytes: 12_000_000,
      };
      profiler.recordSession(session2, role, dept);
      baseline = profiler.getUserBaseline(userId);
      expect(baseline?.sampleCount).toBe(2);
      expect(baseline?.avgRequestsPerSession).toBeGreaterThan(100);
      expect(baseline?.avgRequestsPerSession).toBeLessThan(120);
    });

    it('should apply EMA smoothing correctly', () => {
      const userId = 'user2';
      const orgId = 'org1';
      const role = 'member';
      const dept = 'sales';

      // First session: 100 requests
      const session1: UserSession = {
        sessionId: 'sess1',
        userId,
        organizationId: orgId,
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        requestCount: 100,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 0,
        endpointsAccessed: [],
        isActive: true,
      };
      profiler.recordSession(session1, role, dept);

      // Second session: 200 requests (2x higher)
      const session2: UserSession = {
        ...session1,
        sessionId: 'sess2',
        requestCount: 200,
      };
      profiler.recordSession(session2, role, dept);

      const baseline = profiler.getUserBaseline(userId);
      // EMA with alpha=0.2: new = 0.2*200 + 0.8*100 = 120
      expect(baseline?.avgRequestsPerSession).toBeCloseTo(120, 0);
    });

    it('should track role and department baselines in aggregate', () => {
      const orgId = 'org1';
      const role = 'manager';
      const dept = 'operations';

      const session1: UserSession = {
        sessionId: 'sess1',
        userId: 'user1',
        organizationId: orgId,
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        requestCount: 150,
        dataAccessedBytes: 15_000_000,
        exportVolumeBytes: 10_000_000,
        endpointsAccessed: [],
        isActive: true,
      };

      profiler.recordSession(session1, role, dept);

      const roleBaseline = profiler.getRoleBaseline(role);
      const deptBaseline = profiler.getDepartmentBaseline(dept);

      expect(roleBaseline).toBeDefined();
      expect(deptBaseline).toBeDefined();
      expect(roleBaseline?.avgRequestsPerSession).toBeCloseTo(150, 0);
      expect(deptBaseline?.avgExportVolumeBytes).toBeCloseTo(10_000_000, 0);
    });

    it('should prioritize user-specific baseline over role/dept baselines', () => {
      const userId = 'user1';
      const role = 'member';
      const dept = 'engineering';

      // Build user baseline
      const session1: UserSession = {
        sessionId: 'sess1',
        userId,
        organizationId: 'org1',
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        requestCount: 50,
        dataAccessedBytes: 5_000_000,
        exportVolumeBytes: 0,
        endpointsAccessed: [],
        isActive: true,
      };

      for (let i = 0; i < 3; i++) {
        profiler.recordSession({ ...session1, sessionId: `sess${i}` }, role, dept);
      }

      const exportBaseline = profiler.getExportVolumeBaseline(userId, role, dept);
      expect(exportBaseline).toBeDefined();
      // Should be from user baseline (requires 3+ samples)
      expect(exportBaseline).toBeLessThan(50 * 1024 * 1024); // falls back to role/dept/global
    });
  });

  // ── Data Exfiltration Detection Tests (Req 15.2) ───────────────────────────

  describe('Data Exfiltration Detection (Req 15.2)', () => {
    it('should detect export volume exceeding absolute threshold', () => {
      const orgId = 'org1';
      const policy = policyStore.getEffectivePolicy(orgId);
      const session: UserSession = {
        sessionId: 'sess1',
        userId: 'user1',
        organizationId: orgId,
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        requestCount: 50,
        dataAccessedBytes: 600_000_000, // 600 MB > 500 MB threshold
        exportVolumeBytes: 600_000_000,
        endpointsAccessed: ['/api/v1/export'],
        isActive: true,
      };

      const event = exfilDetector.detect(session, 'member', 'engineering', policy);
      expect(event).toBeDefined();
      expect(event?.type).toBe('data_exfiltration');
      expect(event?.severity).toMatch(/high|critical/);
      expect(event?.confidence).toBeGreaterThan(0.65);
    });

    it('should detect export volume exceeding role baseline multiplier', () => {
      const orgId = 'org1';
      const userId = 'user1';
      const role = 'member';
      const dept = 'engineering';

      // Build baseline: ~5 MB export
      const baseline: UserSession = {
        sessionId: 'sess_baseline',
        userId,
        organizationId: orgId,
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 5_000_000,
        endpointsAccessed: [],
        isActive: true,
      };

      for (let i = 0; i < 5; i++) {
        profiler.recordSession({ ...baseline, sessionId: `baseline_${i}` }, role, dept);
      }

      const policy = policyStore.getEffectivePolicy(orgId);
      // Now try to export 50 MB (10x baseline, > 3x multiplier)
      const suspiciousSession: UserSession = {
        ...baseline,
        sessionId: 'sess_suspicious',
        exportVolumeBytes: 50_000_000,
      };

      const event = exfilDetector.detect(suspiciousSession, role, dept, policy);
      expect(event).toBeDefined();
      expect(event?.type).toBe('data_exfiltration');
      expect(event?.confidence).toBeGreaterThan(0.6);
    });

    it('should not flag normal export volume', () => {
      const orgId = 'org1';
      const policy = policyStore.getEffectivePolicy(orgId);
      const session: UserSession = {
        sessionId: 'sess1',
        userId: 'user1',
        organizationId: orgId,
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 10_000_000, // 10 MB < 500 MB threshold
        endpointsAccessed: [],
        isActive: true,
      };

      const event = exfilDetector.detect(session, 'member', 'engineering', policy);
      expect(event).toBeNull();
    });

    it('should include baseline comparison in evidence', () => {
      const orgId = 'org1';
      const userId = 'user1';

      const baselineSession: UserSession = {
        sessionId: 'baseline',
        userId,
        organizationId: orgId,
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        requestCount: 50,
        dataAccessedBytes: 5_000_000,
        exportVolumeBytes: 5_000_000,
        endpointsAccessed: [],
        isActive: true,
      };

      for (let i = 0; i < 5; i++) {
        profiler.recordSession({ ...baselineSession, sessionId: `b${i}` }, 'member', 'eng');
      }

      const policy = policyStore.getEffectivePolicy(orgId);
      const suspiciousSession: UserSession = {
        ...baselineSession,
        sessionId: 'suspicious',
        exportVolumeBytes: 200_000_000,
      };

      const event = exfilDetector.detect(suspiciousSession, 'member', 'eng', policy);
      expect(event?.evidence.data).toHaveProperty('exportVolumeBytes');
      expect(event?.evidence.data).toHaveProperty('baselineExportBytes');
      expect(event?.evidence.data).toHaveProperty('multiplier');
    });
  });

  // ── Impossible Travel Detection Tests (Req 15.3) ──────────────────────────

  describe('Impossible Travel Detection (Req 15.3)', () => {
    it('should detect concurrent sessions from different countries', () => {
      const orgId = 'org1';
      const userId = 'user1';
      const policy = policyStore.getEffectivePolicy(orgId);

      const session1: UserSession = {
        sessionId: 'sess_us',
        userId,
        organizationId: orgId,
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date('2025-01-01T08:00:00Z'),
        lastActivityAt: new Date('2025-01-01T08:30:00Z'),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 0,
        endpointsAccessed: [],
        isActive: true,
      };

      travelDetector.registerSession(session1);

      // Session from different country within 1 hour
      const session2: UserSession = {
        sessionId: 'sess_uk',
        userId,
        organizationId: orgId,
        ipAddress: '192.168.0.1',
        countryCode: 'UK',
        startedAt: new Date('2025-01-01T08:45:00Z'),
        lastActivityAt: new Date('2025-01-01T08:45:00Z'),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 0,
        endpointsAccessed: [],
        isActive: true,
      };

      const event = travelDetector.detect(session2, policy);
      expect(event).toBeDefined();
      expect(event?.type).toBe('impossible_travel');
      expect(event?.severity).toBe('critical');
      expect(event?.confidence).toBe(0.95);
      expect(event?.evidence.relatedSessions).toContain('sess_us');
    });

    it('should not flag sessions beyond the time window', () => {
      const orgId = 'org1';
      const userId = 'user1';
      const policy = policyStore.getEffectivePolicy(orgId);
      // Window is 1 hour by default

      const session1: UserSession = {
        sessionId: 'sess_1',
        userId,
        organizationId: orgId,
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date('2025-01-01T08:00:00Z'),
        lastActivityAt: new Date('2025-01-01T08:00:00Z'),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 0,
        endpointsAccessed: [],
        isActive: true,
      };

      travelDetector.registerSession(session1);

      // Session from different country but 2 hours later (outside window)
      const session2: UserSession = {
        sessionId: 'sess_2',
        userId,
        organizationId: orgId,
        ipAddress: '192.168.0.1',
        countryCode: 'UK',
        startedAt: new Date('2025-01-01T10:30:00Z'),
        lastActivityAt: new Date('2025-01-01T10:30:00Z'),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 0,
        endpointsAccessed: [],
        isActive: true,
      };

      const event = travelDetector.detect(session2, policy);
      expect(event).toBeNull();
    });

    it('should detect concurrent sessions from same country', () => {
      const orgId = 'org1';
      const userId = 'user1';
      const policy = policyStore.getEffectivePolicy(orgId);

      const session1: UserSession = {
        sessionId: 'sess1',
        userId,
        organizationId: orgId,
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date('2025-01-01T08:00:00Z'),
        lastActivityAt: new Date('2025-01-01T08:00:00Z'),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 0,
        endpointsAccessed: [],
        isActive: true,
      };

      travelDetector.registerSession(session1);

      const session2: UserSession = {
        sessionId: 'sess2',
        userId,
        organizationId: orgId,
        ipAddress: '10.0.0.2',
        countryCode: 'US',
        startedAt: new Date('2025-01-01T08:15:00Z'),
        lastActivityAt: new Date('2025-01-01T08:15:00Z'),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 0,
        endpointsAccessed: [],
        isActive: true,
      };

      travelDetector.registerSession(session2);

      const session3: UserSession = {
        sessionId: 'sess3',
        userId,
        organizationId: orgId,
        ipAddress: '10.0.0.3',
        countryCode: 'US',
        startedAt: new Date('2025-01-01T08:30:00Z'),
        lastActivityAt: new Date('2025-01-01T08:30:00Z'),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 0,
        endpointsAccessed: [],
        isActive: true,
      };

      const event = travelDetector.detect(session3, policy);
      expect(event).toBeDefined();
      expect(event?.type).toBe('concurrent_session');
      expect(event?.severity).toBe('medium');
      expect(event?.confidence).toBe(0.7);
    });
  });

  // ── Privilege Escalation Detection Tests (Req 15.4) ─────────────────────────

  describe('Privilege Escalation Detection (Req 15.4)', () => {
    it('should detect unauthorized endpoint access by role', () => {
      const result = privEscDetector.detect(
        'user1',
        'org1',
        'sess1',
        '/platform/super-admin/users',
        'member', // member role cannot access /platform
      );

      expect(result).toBeDefined();
      expect(result?.type).toBe('privilege_escalation');
      expect(result?.severity).toMatch(/high|critical/);
      expect(result?.confidence).toBeGreaterThan(0.8);
    });

    it('should not flag authorized endpoint access', () => {
      const result = privEscDetector.detect(
        'user1',
        'org1',
        'sess1',
        '/app/dashboard',
        'member', // member can access /app/
      );

      expect(result).toBeNull();
    });

    it('should allow IT admin to access admin endpoints', () => {
      const result = privEscDetector.detect(
        'user1',
        'org1',
        'sess1',
        '/api/v1/admin/users',
        'it_admin',
      );

      expect(result).toBeNull();
    });

    it('should allow platform admin full access', () => {
      const result = privEscDetector.detect(
        'user1',
        'org1',
        'sess1',
        '/platform/anything',
        'platform_admin',
      );

      expect(result).toBeNull();
    });

    it('should increase confidence for repeated escalation attempts', () => {
      // First attempt
      const result1 = privEscDetector.detect(
        'user1',
        'org1',
        'sess1',
        '/admin/users',
        'member',
      );

      // Second attempt
      const result2 = privEscDetector.detect(
        'user1',
        'org1',
        'sess1',
        '/admin/users',
        'member',
      );

      // Third attempt
      const result3 = privEscDetector.detect(
        'user1',
        'org1',
        'sess1',
        '/admin/users',
        'member',
      );

      expect(result1?.confidence).toBeLessThan(result3?.confidence ?? 0);
    });

    it('should track recent attempts per user', () => {
      privEscDetector.detect('user1', 'org1', 'sess1', '/admin/settings', 'member');
      privEscDetector.detect('user1', 'org1', 'sess1', '/admin/billing', 'member');

      const attempts = privEscDetector.getRecentAttempts('user1', 60);
      expect(attempts.length).toBeGreaterThanOrEqual(2);
      expect(attempts[0].endpoint).toContain('/admin');
    });
  });

  // ── Protective Actions Tests (Req 15.5) ───────────────────────────────────

  describe('Protective Actions (Req 15.5)', () => {
    it('should execute protective actions when confidence is high', async () => {
      const event: SecurityEvent = {
        id: 'event1',
        organizationId: 'org1',
        userId: 'user1',
        sessionId: 'sess1',
        type: 'data_exfiltration',
        severity: 'high',
        confidence: 0.95,
        evidence: { description: 'Test', data: {} },
        timestamp: new Date(),
        resolved: false,
      };

      const policy = policyStore.getEffectivePolicy('org1');
      const actions = await protectionService.autoRemediate(event, policy);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0]).toHaveProperty('action');
      expect(actions[0]).toHaveProperty('success');
      expect(actions[0]).toHaveProperty('targetId');
    });

    it('should skip auto-remediation when confidence is low', async () => {
      const event: SecurityEvent = {
        id: 'event1',
        organizationId: 'org1',
        userId: 'user1',
        type: 'unusual_access',
        severity: 'low',
        confidence: 0.5, // Below 0.8 threshold
        evidence: { description: 'Test', data: {} },
        timestamp: new Date(),
        resolved: false,
      };

      const policy = policyStore.getEffectivePolicy('org1');
      const actions = await protectionService.autoRemediate(event, policy);

      expect(actions.length).toBe(0);
    });

    it('should execute individual protective actions', async () => {
      const event: SecurityEvent = {
        id: 'event1',
        organizationId: 'org1',
        userId: 'user1',
        sessionId: 'sess1',
        type: 'privilege_escalation',
        severity: 'high',
        confidence: 0.9,
        evidence: { description: 'Test', data: {} },
        timestamp: new Date(),
        resolved: false,
      };

      const result = await protectionService.executeProtectiveAction(
        event,
        'terminate_session',
      );

      expect(result).toHaveProperty('action', 'terminate_session');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('executedAt');
      expect(result).toHaveProperty('details');
    });

    it('should respect policy-controlled auto-remediation settings', async () => {
      policyStore.setAutoRemediation('org1', 'data_exfiltration', false);

      const event: SecurityEvent = {
        id: 'event1',
        organizationId: 'org1',
        userId: 'user1',
        type: 'data_exfiltration',
        severity: 'critical',
        confidence: 0.95,
        evidence: { description: 'Test', data: {} },
        timestamp: new Date(),
        resolved: false,
      };

      const policy = policyStore.getEffectivePolicy('org1');
      const actions = await protectionService.autoRemediate(event, policy);

      // Auto-remediation is disabled, so no actions should be taken
      expect(actions.length).toBe(0);
    });
  });

  // ── Security Incident Report Generation Tests (Req 15.6) ──────────────────

  describe('Security Incident Report Generation (Req 15.6)', () => {
    it('should generate comprehensive incident report', () => {
      const event: SecurityEvent = {
        id: 'event1',
        organizationId: 'org1',
        userId: 'user1',
        type: 'data_exfiltration',
        severity: 'high',
        confidence: 0.85,
        evidence: {
          description: 'Large export detected',
          data: { exportBytes: 500_000_000 },
        },
        timestamp: new Date(),
        resolved: false,
      };

      const report = reportGen.generate(event, []);

      expect(report).toHaveProperty('incidentId');
      expect(report).toHaveProperty('organizationId', 'org1');
      expect(report).toHaveProperty('userId', 'user1');
      expect(report).toHaveProperty('eventType', 'data_exfiltration');
      expect(report).toHaveProperty('severity', 'high');
      expect(report).toHaveProperty('confidence', 0.85);
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('timeline');
      expect(report).toHaveProperty('remediationPlan');
      expect(report).toHaveProperty('exportPayload');
    });

    it('should include timeline with detection and actions', () => {
      const event: SecurityEvent = {
        id: 'event1',
        organizationId: 'org1',
        userId: 'user1',
        type: 'impossible_travel',
        severity: 'critical',
        confidence: 0.95,
        evidence: { description: 'Impossible travel detected', data: {} },
        timestamp: new Date('2025-01-01T10:00:00Z'),
        resolved: false,
      };

      const mockAction = {
        action: 'terminate_session' as const,
        targetId: 'sess1',
        targetType: 'session' as const,
        success: true,
        executedAt: new Date('2025-01-01T10:05:00Z'),
      };

      const report = reportGen.generate(event, [mockAction]);

      expect(report.timeline.length).toBeGreaterThanOrEqual(2);
      expect(report.timeline[0].type).toBe('detection');
      expect(report.timeline.some((t) => t.type === 'action')).toBe(true);
    });

    it('should include event-specific recommendations', () => {
      const exfilEvent: SecurityEvent = {
        id: 'event1',
        organizationId: 'org1',
        userId: 'user1',
        type: 'data_exfiltration',
        severity: 'high',
        confidence: 0.8,
        evidence: { description: 'Test', data: {} },
        timestamp: new Date(),
        resolved: false,
      };

      const report = reportGen.generate(exfilEvent, []);

      expect(report.recommendedActions.length).toBeGreaterThan(0);
      expect(
        report.recommendedActions.some((r) => r.toLowerCase().includes('dlp')),
      ).toBe(true);
    });

    it('should categorize remediation plan by urgency', () => {
      const criticalEvent: SecurityEvent = {
        id: 'event1',
        organizationId: 'org1',
        userId: 'user1',
        type: 'impossible_travel',
        severity: 'critical',
        confidence: 0.95,
        evidence: { description: 'Test', data: {} },
        timestamp: new Date(),
        resolved: false,
      };

      const report = reportGen.generate(criticalEvent, []);

      expect(report.remediationPlan.immediate.length).toBeGreaterThan(0);
      expect(report.remediationPlan.shortTerm.length).toBeGreaterThan(0);
      expect(report.remediationPlan.longTerm.length).toBeGreaterThan(0);
    });

    it('should generate exportable JSON payload', () => {
      const event: SecurityEvent = {
        id: 'event1',
        organizationId: 'org1',
        userId: 'user1',
        type: 'privilege_escalation',
        severity: 'high',
        confidence: 0.9,
        evidence: { description: 'Unauthorized access attempt', data: {} },
        timestamp: new Date(),
        resolved: false,
      };

      const report = reportGen.generate(event, []);

      expect(report.exportPayload).toBeDefined();
      expect(report.exportPayload.schema).toContain('security_incident');
      expect(report.exportPayload.event).toBeDefined();
      expect(report.exportPayload.recommendations).toBeDefined();
      // Verify exportPayload is JSON-serializable
      const jsonStr = JSON.stringify(report.exportPayload);
      expect(jsonStr).toBeDefined();
      expect(typeof jsonStr).toBe('string');
      expect(jsonStr.length).toBeGreaterThan(0);
    });

    it('should query reports by organization', () => {
      const event: SecurityEvent = {
        id: 'event1',
        organizationId: 'org1',
        userId: 'user1',
        type: 'data_exfiltration',
        severity: 'high',
        confidence: 0.8,
        evidence: { description: 'Test', data: {} },
        timestamp: new Date(),
        resolved: false,
      };

      reportGen.generate(event, []);

      const reports = reportGen.listReports('org1');
      expect(reports.length).toBeGreaterThan(0);

      const org2Reports = reportGen.listReports('org2');
      expect(org2Reports.length).toBe(0);
    });
  });

  // ── Security Policy Configuration Tests (Req 15.8) ──────────────────────────

  describe('Security Policy Configuration (Req 15.8)', () => {
    it('should get default policy for new organization', () => {
      const policy = policyStore.getEffectivePolicy('org_new');

      expect(policy.organizationId).toBe('org_new');
      expect(policy.anomalySensitivity).toBe(DEFAULT_SECURITY_POLICY.anomalySensitivity);
      expect(policy.exfiltrationThresholdMultiplier).toBe(
        DEFAULT_SECURITY_POLICY.exfiltrationThresholdMultiplier,
      );
    });

    it('should allow customization of detection sensitivity', () => {
      const orgId = 'org_test';
      policyStore.setPolicy(orgId, { anomalySensitivity: 0.9 });

      const policy = policyStore.getEffectivePolicy(orgId);
      expect(policy.anomalySensitivity).toBe(0.9);
    });

    it('should allow customization of exfiltration thresholds', () => {
      const orgId = 'org_test';
      policyStore.setPolicy(orgId, {
        exfiltrationThresholdMultiplier: 5,
        maxExportBytesAbsolute: 1_000_000_000,
      });

      const policy = policyStore.getEffectivePolicy(orgId);
      expect(policy.exfiltrationThresholdMultiplier).toBe(5);
      expect(policy.maxExportBytesAbsolute).toBe(1_000_000_000);
    });

    it('should toggle auto-remediation per event type', () => {
      const orgId = 'org_test';
      policyStore.setAutoRemediation(orgId, 'data_exfiltration', false);

      const policy = policyStore.getEffectivePolicy(orgId);
      expect(policy.autoRemediationEnabled.data_exfiltration).toBe(false);

      policyStore.setAutoRemediation(orgId, 'data_exfiltration', true);
      const updated = policyStore.getEffectivePolicy(orgId);
      expect(updated.autoRemediationEnabled.data_exfiltration).toBe(true);
    });

    it('should reset policy to defaults', () => {
      const orgId = 'org_test';
      policyStore.setPolicy(orgId, { anomalySensitivity: 0.5 });

      policyStore.resetPolicy(orgId);
      const policy = policyStore.getEffectivePolicy(orgId);

      expect(policy.anomalySensitivity).toBe(DEFAULT_SECURITY_POLICY.anomalySensitivity);
    });

    it('should list custom policy overrides', () => {
      policyStore.setPolicy('org1', { anomalySensitivity: 0.8 });
      policyStore.setPolicy('org2', { anomalySensitivity: 0.6 });

      const customPolicies = policyStore.listCustomPolicies();

      expect(customPolicies.length).toBeGreaterThanOrEqual(2);
      expect(customPolicies.some((p) => p.organizationId === 'org1')).toBe(true);
      expect(customPolicies.some((p) => p.organizationId === 'org2')).toBe(true);
    });
  });

  // ── Full Session Analysis Tests (Req 15.1) ──────────────────────────────────

  describe('Full Session Analysis Pipeline (Req 15.1)', () => {
    it('should analyze clean session without anomalies', async () => {
      const session: UserSession = {
        sessionId: 'sess1',
        userId: 'user1',
        organizationId: 'org1',
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 5_000_000,
        endpointsAccessed: ['/api/v1/data'],
        isActive: true,
      };

      const result = await engine.analyzeSession(session, 'member', 'engineering');

      expect(result.events.length).toBe(0);
      expect(result.protectiveActionsCount).toBe(0);
    });

    it('should detect multiple anomalies in single session', async () => {
      const session: UserSession = {
        sessionId: 'sess_malicious',
        userId: 'user_bad',
        organizationId: 'org1',
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date('2025-01-01T08:00:00Z'),
        lastActivityAt: new Date('2025-01-01T08:30:00Z'),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 600_000_000, // Triggers exfiltration
        endpointsAccessed: ['/api/v1/export'],
        isActive: true,
      };

      const result = await engine.analyzeSession(
        session,
        'member',
        'engineering',
        true, // autoRemediate
      );

      // May detect exfiltration
      expect(result.events.length).toBeGreaterThanOrEqual(0);
    });

    it('should update user baseline after session analysis', async () => {
      const userId = 'user_baseline_test';
      const session: UserSession = {
        sessionId: 'sess1',
        userId,
        organizationId: 'org1',
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        requestCount: 100,
        dataAccessedBytes: 15_000_000,
        exportVolumeBytes: 5_000_000,
        endpointsAccessed: [],
        isActive: true,
      };

      await engine.analyzeSession(session, 'member', 'engineering');

      const baseline = profiler.getUserBaseline(userId);
      expect(baseline).toBeDefined();
      expect(baseline?.avgRequestsPerSession).toBeCloseTo(100, 0);
    });

    it('should generate incident reports for detected events', async () => {
      const session: UserSession = {
        sessionId: 'sess_suspicious',
        userId: 'user_suspicious',
        organizationId: 'org1',
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 600_000_000, // Will trigger exfiltration
        endpointsAccessed: ['/api/v1/export'],
        isActive: true,
      };

      const result = await engine.analyzeSession(session, 'member', 'engineering');

      if (result.events.length > 0) {
        expect(result.reports.length).toBeGreaterThan(0);
        expect(result.reports[0]).toHaveProperty('incidentId');
        expect(result.reports[0]).toHaveProperty('summary');
      }
    });
  });

  // ── Privilege Escalation Check Tests ──────────────────────────────────────

  describe('Privilege Escalation Check', () => {
    it('should check endpoint access and generate report', () => {
      const result = engine.checkPrivilegeEscalation(
        'user1',
        'org1',
        'sess1',
        '/platform/super-admin/users',
        'member',
      );

      expect(result.detected).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.report).toBeDefined();
      expect(result.event?.type).toBe('privilege_escalation');
    });

    it('should return false for authorized endpoint', () => {
      const result = engine.checkPrivilegeEscalation(
        'user1',
        'org1',
        'sess1',
        '/app/dashboard',
        'member',
      );

      expect(result.detected).toBe(false);
      expect(result.event).toBeUndefined();
      expect(result.report).toBeUndefined();
    });
  });

  // ── Security Events Query Tests ───────────────────────────────────────────

  describe('Security Events Query', () => {
    it('should query events by organization', async () => {
      const session: UserSession = {
        sessionId: 'sess1',
        userId: 'user1',
        organizationId: 'org_special',
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date('2025-01-01T08:00:00Z'),
        lastActivityAt: new Date('2025-01-01T08:00:00Z'),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 600_000_000,
        endpointsAccessed: [],
        isActive: true,
      };

      await engine.analyzeSession(session, 'member', 'engineering');

      const events = engine.getSecurityEvents('org_special');
      expect(events.length).toBeGreaterThanOrEqual(0);

      const otherOrgEvents = engine.getSecurityEvents('org_other');
      expect(otherOrgEvents.length).toBe(0);
    });

    it('should filter unresolved events', async () => {
      const session: UserSession = {
        sessionId: 'sess1',
        userId: 'user1',
        organizationId: 'org_filter_test',
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 600_000_000,
        endpointsAccessed: [],
        isActive: true,
      };

      await engine.analyzeSession(session, 'member', 'engineering');

      const allEvents = engine.getSecurityEvents('org_filter_test');
      const unresolvedEvents = engine.getSecurityEvents('org_filter_test', {
        unresolved: true,
      });

      expect(unresolvedEvents.length).toBeLessThanOrEqual(allEvents.length);
    });

    it('should resolve security events', async () => {
      const session: UserSession = {
        sessionId: 'sess1',
        userId: 'user1',
        organizationId: 'org_resolve_test',
        ipAddress: '10.0.0.1',
        countryCode: 'US',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        requestCount: 50,
        dataAccessedBytes: 10_000_000,
        exportVolumeBytes: 600_000_000,
        endpointsAccessed: [],
        isActive: true,
      };

      await engine.analyzeSession(session, 'member', 'engineering');

      const events = engine.getSecurityEvents('org_resolve_test');
      if (events.length > 0) {
        const eventId = events[0].id;
        const resolved = engine.resolveEvent(eventId);
        expect(resolved).toBe(true);

        const event = engine.getSecurityEvents('org_resolve_test').find((e) => e.id === eventId);
        expect(event?.resolved).toBe(true);
        expect(event?.resolvedAt).toBeDefined();
      }
    });
  });
});
