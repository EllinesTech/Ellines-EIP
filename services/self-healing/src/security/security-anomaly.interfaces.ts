/**
 * Security Anomaly Detection — Domain Interfaces
 *
 * Types for user behavior profiling, security events, incident reports,
 * and policy configuration.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8
 */

// ── Enumerations ────────────────────────────────────────────────────────────

export type SecurityEventType =
  | 'unusual_access'
  | 'data_exfiltration'
  | 'impossible_travel'
  | 'privilege_escalation'
  | 'concurrent_session'
  | 'brute_force'
  | 'suspicious_api_usage';

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low';

export type ProtectiveActionType =
  | 'terminate_session'
  | 'suspend_account'
  | 'apply_rate_limit'
  | 'flag_for_review'
  | 'require_mfa';

// ── User Behavior Profiling (Req 15.7) ─────────────────────────────────────

export interface UserBehaviorBaseline {
  /** Req 15.7: Normal behavior profile per role and department */
  userId: string;
  organizationId: string;
  role: string;
  department: string;
  /** Average requests per session */
  avgRequestsPerSession: number;
  /** Average data accessed in bytes per session */
  avgDataAccessedBytes: number;
  /** Average export/download volume in bytes per session */
  avgExportVolumeBytes: number;
  /** Typical active hours: array of hours 0-23 */
  typicalActiveHours: number[];
  /** Typical IP country codes */
  typicalCountries: string[];
  /** Typical endpoints accessed (sorted by frequency) */
  frequentEndpoints: string[];
  /** Number of sessions used to build this baseline */
  sampleCount: number;
  updatedAt: Date;
}

export interface UserSession {
  sessionId: string;
  userId: string;
  organizationId: string;
  ipAddress: string;
  countryCode: string;
  startedAt: Date;
  lastActivityAt: Date;
  requestCount: number;
  dataAccessedBytes: number;
  exportVolumeBytes: number;
  endpointsAccessed: string[];
  isActive: boolean;
}

// ── Security Event (Req 15.1–15.4) ─────────────────────────────────────────

export interface SecurityEvent {
  id: string;
  organizationId: string;
  userId: string;
  sessionId?: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  /** Detection confidence 0-1 */
  confidence: number;
  evidence: SecurityEvidence;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface SecurityEvidence {
  description: string;
  /** Raw data supporting the detection */
  data: Record<string, unknown>;
  /** Related session IDs */
  relatedSessions?: string[];
  /** Baseline values for comparison */
  baseline?: Partial<UserBehaviorBaseline>;
  /** Observed value that triggered detection */
  observed?: Record<string, unknown>;
}

// ── Security Incident Report (Req 15.6) ────────────────────────────────────

export interface SecurityIncidentReport {
  incidentId: string;
  organizationId: string;
  userId: string;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  confidence: number;
  evidence: SecurityEvidence;
  protectiveActionsTaken: ProtectiveActionResult[];
  recommendedActions: string[];
  timestamp: Date;
  /** Structured JSON ready for export */
  summary: string;
}

export interface ProtectiveActionResult {
  action: ProtectiveActionType;
  targetId: string;
  targetType: 'session' | 'account' | 'api_endpoint';
  success: boolean;
  executedAt: Date;
  details?: string;
}

// ── Security Policy (Req 15.8) ─────────────────────────────────────────────

export interface SecurityPolicy {
  organizationId: string;
  /** Req 15.8: Configurable sensitivity 0-1; higher = stricter */
  anomalySensitivity: number;
  /** Exfiltration: multiplier of role baseline before flagging (default 3x) */
  exfiltrationThresholdMultiplier: number;
  /** Impossible travel: max hours between two geo-separated sessions */
  impossibleTravelWindowHours: number;
  /** Whether protective auto-remediation is enabled per event type */
  autoRemediationEnabled: Record<SecurityEventType, boolean>;
  /** Notification channels */
  notifyChannels: Array<'email' | 'in_app' | 'webhook'>;
  /** Webhook URL for security notifications */
  webhookUrl?: string;
  updatedAt: Date;
}

// ── Default policy ──────────────────────────────────────────────────────────

export const DEFAULT_SECURITY_POLICY: Omit<SecurityPolicy, 'organizationId' | 'updatedAt'> = {
  anomalySensitivity: 0.7,
  exfiltrationThresholdMultiplier: 3,
  impossibleTravelWindowHours: 1,
  autoRemediationEnabled: {
    unusual_access: false,
    data_exfiltration: true,
    impossible_travel: true,
    privilege_escalation: true,
    concurrent_session: true,
    brute_force: true,
    suspicious_api_usage: false,
  },
  notifyChannels: ['in_app'],
};
