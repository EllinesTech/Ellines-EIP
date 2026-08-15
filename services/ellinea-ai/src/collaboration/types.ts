/**
 * Collaborative Intelligence Service Types
 * Defines types for multi-user collaborative session management
 */

export type ParticipantRole = 'owner' | 'admin' | 'executive' | 'manager' | 'member' | 'viewer';

export interface Participant {
  id: string;
  name: string;
  email: string;
  role: ParticipantRole;
  isActive: boolean;
  joinedAt: Date;
  lastActivityAt: Date;
}

export interface CollaborativeSession {
  id: string;
  organizationId: string;
  title: string;
  topic: string;
  description?: string;
  participants: Participant[];
  status: 'active' | 'paused' | 'concluded';
  createdAt: Date;
  updatedAt: Date;
  concludedAt?: Date;
}

export interface UserContribution {
  id: string;
  sessionId: string;
  participantId: string;
  content: string;
  type: 'opinion' | 'data_point' | 'analysis' | 'recommendation' | 'concern';
  confidence?: number;
  createdAt: Date;
}

export interface SynthesizedContribution {
  primaryContribution: UserContribution;
  alignedContributions: UserContribution[];
  conflictingContributions: UserContribution[];
  consensus: boolean;
  consensusScore: number; // 0-100
  summary: string;
}

export interface AgreementAnalysis {
  contributionId: string;
  alignmentScores: Map<string, number>; // userId -> alignment score (0-100)
  alignedWith: string[]; // participant IDs
  conflictsWith: string[]; // participant IDs
  averageAlignment: number;
  consensusExists: boolean;
}

export interface RolePermission {
  role: ParticipantRole;
  canViewFinancialData: boolean;
  canViewPersonnelData: boolean;
  canViewOperationalMetrics: boolean;
  canViewStrategicAnalysis: boolean;
  canProposeLargeDecisions: boolean;
  canApproveDecisions: boolean;
  canExcludeParticipants: boolean;
}

export interface FilteredViewData {
  participantId: string;
  role: ParticipantRole;
  filteredContributions: UserContribution[];
  accessibleInsights: DecisionOption[];
}

export interface DecisionOption {
  id: string;
  title: string;
  description: string;
  proponents: string[]; // participant IDs who support
  opponents: string[]; // participant IDs who oppose
  estimatedImpact: {
    financial?: string;
    operational?: string;
    strategic?: string;
    risk?: string;
  };
  tradeoffs: TradeOff[];
  supportingEvidence: string[];
  confidenceScore: number;
}

export interface TradeOff {
  type: 'benefit' | 'cost' | 'risk' | 'opportunity';
  description: string;
  affectedStakeholders: ParticipantRole[];
  magnitude: 'low' | 'medium' | 'high';
}

export interface DecisionFacilitationView {
  options: DecisionOption[];
  recommendations: string[];
  riskAssessment: string;
  timelineSuggestion: string;
  stakeholderAlignment: Map<string, number>; // role -> alignment score
}

export interface SessionHistoryEntry {
  id: string;
  sessionId: string;
  timestamp: Date;
  actionType: 'participant_joined' | 'contribution_added' | 'decision_proposed' | 'vote_cast' | 'session_concluded';
  actor: Participant;
  description: string;
  data?: Record<string, any>;
}

export interface AbsentStakeholder {
  id: string;
  name: string;
  email: string;
  role: ParticipantRole;
  relevanceToDecision: 'high' | 'medium' | 'low';
  potentialConcerns?: string[];
}

export interface SessionNotification {
  id: string;
  sessionId: string;
  type: 'decision_made' | 'consensus_needed' | 'new_contribution' | 'opinion_conflict';
  recipient: Participant;
  title: string;
  message: string;
  actionUrl?: string;
  readAt?: Date;
  createdAt: Date;
}

export interface CollaborationMetrics {
  sessionId: string;
  totalParticipants: number;
  activeParticipants: number;
  totalContributions: number;
  consensusLevel: number; // 0-100
  decisionsMade: number;
  averageParticipationRate: number; // 0-100
  sessionDurationMinutes: number;
}
