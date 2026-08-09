/**
 * Advanced Reasoning Engine — Interfaces
 *
 * All types used by the ReasoningEngine and its sub-components.
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.8
 */

// ─── Core domain types ───────────────────────────────────────────────────────

export interface Question {
  id: string;
  text: string;
  organizationId: string;
  context?: Record<string, any>;
}

export interface Observation {
  id: string;
  organizationId: string;
  description: string;
  metrics: MetricPoint[];
  timeRange: TimeRange;
  sourceSystem?: string;
}

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: Date;
  unit?: string;
}

export interface TimeRange {
  from: Date;
  to: Date;
}

export interface Event {
  id: string;
  organizationId: string;
  type: string;
  description: string;
  timestamp: Date;
  entityId: string;
  sourceSystem: string;
  metadata?: Record<string, any>;
}

export interface DataSource {
  id: string;
  organizationId: string;
  systemName: string;
  entityType: string;
  records: Array<Record<string, any>>;
  timeRange?: TimeRange;
}

export interface Conclusion {
  statement: string;
  organizationId: string;
  supportingEntityIds: string[];
  sourceDataSystems: string[];
  preliminaryConfidence: number;
}

// ─── Reasoning result ────────────────────────────────────────────────────────

export interface ReasoningResult {
  /** Natural-language conclusion derived from multi-hop traversal */
  conclusion: string;
  /** 0-1 confidence score */
  confidence: number;
  /** Ordered steps taken during reasoning */
  reasoningSteps: ReasoningStep[];
  /** Full evidence chain supporting the conclusion */
  evidenceChain: EvidenceChain;
  /** Gaps in the knowledge graph that limited reasoning */
  knowledgeGaps: KnowledgeGap[];
}

export interface ReasoningStep {
  stepNumber: number;
  operation: 'traverse' | 'infer' | 'aggregate' | 'compare' | 'filter';
  description: string;
  input: any;
  output: any;
  justification: string;
  confidence: number;
}

// ─── Evidence chain ──────────────────────────────────────────────────────────

export interface EvidenceChain {
  conclusionId: string;
  conclusion: string;
  overallConfidence: number;
  evidenceLinks: EvidenceLink[];
  sourceCount: number;
  createdAt: Date;
}

export interface EvidenceLink {
  entityId: string;
  entityType: string;
  displayName: string;
  relationship?: string;
  supportStrength: number; // 0-1
  sourceSystem: string;
  dataPoint?: string;
}

// ─── Causal chain ────────────────────────────────────────────────────────────

export interface CausalChain {
  id: string;
  cause: Event;
  effect: Event;
  mechanism: string;
  confidence: number;
  temporalEvidence: TemporalAnalysis;
}

export interface TemporalAnalysis {
  causeTimestamp: Date;
  effectTimestamp: Date;
  lagMs: number;
  lagHumanReadable: string;
  isStatisticallySignificant: boolean;
  sampleSize: number;
  averageLagMs?: number;
}

// ─── Pattern detection ───────────────────────────────────────────────────────

export interface Pattern {
  id: string;
  name: string;
  description: string;
  type: 'trend' | 'anomaly' | 'cycle' | 'correlation' | 'distribution';
  confidence: number;
  affectedSystems: string[];
  affectedEntityTypes: string[];
  occurrences: number;
  timeRange: TimeRange;
  strength: number; // 0-1 effect size
  metadata?: Record<string, any>;
}

// ─── Hypothesis ──────────────────────────────────────────────────────────────

export interface Hypothesis {
  id: string;
  statement: string;
  generatedFrom: string; // observation id
  confidence: number;
  status: 'unvalidated' | 'supported' | 'refuted' | 'inconclusive';
  supportingEvidence: EvidenceLink[];
  refutingEvidence: EvidenceLink[];
  validatedAgainstPeriod?: TimeRange;
  explanation: string;
}

// ─── Knowledge gap ───────────────────────────────────────────────────────────

export interface KnowledgeGap {
  id: string;
  description: string;
  missingEntityTypes?: string[];
  missingSystems?: string[];
  impactOnReasoning: 'critical' | 'major' | 'minor';
  suggestion: string;
}

// ─── Multi-hop path ──────────────────────────────────────────────────────────

export interface GraphPath {
  nodes: GraphNode[];
  relationships: GraphEdge[];
  totalHops: number;
  pathConfidence: number;
}

export interface GraphNode {
  id: string;
  type: string;
  displayName: string;
  properties: Record<string, any>;
  sourceSystem: string;
}

export interface GraphEdge {
  fromId: string;
  toId: string;
  type: string;
  confidence: number;
  properties: Record<string, any>;
}
