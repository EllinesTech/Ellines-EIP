/**
 * Alert correlation and management interfaces
 * Requirements: 12.1–12.8
 */

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AlertStatus = 'active' | 'suppressed' | 'resolved' | 'closed';
export type AlertCategory =
  | 'infrastructure'
  | 'application'
  | 'database'
  | 'network'
  | 'security'
  | 'performance'
  | 'business';

/** A single incoming alert from any monitoring source */
export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  category: AlertCategory;
  /** The component/service that fired the alert */
  source: string;
  /** Optional list of systems/services that are affected */
  affectedServices?: string[];
  /** Estimated number of end-users impacted */
  affectedUsers?: number;
  /** Human-readable fingerprint used for deduplication */
  fingerprint: string;
  status: AlertStatus;
  timestamp: Date;
  resolvedAt?: Date;
  metadata?: Record<string, any>;
}

/** A cluster of correlated alerts sharing the same root cause */
export interface AlertCluster {
  id: string;
  /** All alerts that belong to this cluster (root cause + symptoms) */
  alerts: Alert[];
  /** The identified root cause alert; null if undetermined */
  rootCause: Alert | null;
  /** Symptom alerts derived from the root cause */
  symptoms: Alert[];
  /** Composite correlation strength (0–1) */
  correlationStrength: number;
  firstSeen: Date;
  lastSeen: Date;
}

/** Represents a directional causation link between two alerts */
export interface CausationLink {
  causeId: string;
  effectId: string;
  /** Explanation of why one caused the other */
  reason: string;
  confidence: number; // 0-100
}

/** Business impact assessment for a cluster */
export interface ImpactAssessment {
  businessImpact: 'none' | 'low' | 'medium' | 'high' | 'critical';
  estimatedAffectedUsers: number;
  estimatedRevenueLoss?: number;
  affectedSystems: string[];
}

/** Full root cause analysis result for a cluster */
export interface RootCauseAnalysis {
  rootCause: Alert;
  causationChain: CausationLink[];
  confidence: number; // 0-100
  affectedSystems: string[];
  estimatedImpact: ImpactAssessment;
}

/** Node in the topology visualization */
export interface TopologyNode {
  id: string;
  label: string;
  type: 'service' | 'database' | 'network' | 'host';
  status: 'healthy' | 'degraded' | 'failing' | 'down' | 'unknown';
  alertCount: number;
  isRootCause: boolean;
}

/** Edge in the topology visualization */
export interface TopologyEdge {
  from: string;
  to: string;
  relationshipType: string;
  isAffected: boolean;
}

/** Visual topology graph for an alert cluster */
export interface TopologyVisualization {
  clusterId: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  /** The node identified as the root cause entry point */
  rootCauseNodeId: string | null;
  generatedAt: Date;
}

/** Alert storm event detected when alert volume exceeds threshold */
export interface AlertStorm {
  id: string;
  /** Number of alerts detected in the time window */
  alertCount: number;
  /** Duration in milliseconds of the detection window */
  timeWindow: number;
  summary: string;
  /** Alert counts per category during the storm */
  topCategories: Record<string, number>;
  /** Recommended action to take */
  action: 'create_incident' | 'suppress' | 'escalate';
  detectedAt: Date;
}

/** Urgency score for a single alert (0–100) */
export interface UrgencyScore {
  /** Final score 0-100 */
  score: number;
  /** Partial score contribution from business impact (0-40) */
  businessImpact: number;
  /** Partial score contribution from affected user count (0-40) */
  affectedUsers: number;
  /** Names of dependent downstream services that amplify urgency */
  serviceDependencies: string[];
}
