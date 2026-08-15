/**
 * Collaborative Intelligence Service
 * Main orchestrator for multi-user collaborative decision-making
 * Integrates all collaboration components and manages sessions
 */

import {
  CollaborativeSession,
  Participant,
  UserContribution,
  DecisionOption,
  CollaborationMetrics,
  SessionNotification,
  AbsentStakeholder,
  ParticipantRole,
} from './types';
import { SessionContextTracker } from './session-context-tracker';
import { ContributionSynthesizer } from './contribution-synthesizer';
import { DecisionFacilitator } from './decision-facilitator';
import { SessionHistoryRecorder } from './session-history-recorder';
import { AbsentStakeholderNotifier } from './absent-stakeholder-notifier';

export class CollaborativeIntelligenceService {
  private contextTracker: SessionContextTracker;
  private synthesizer: ContributionSynthesizer;
  private facilitator: DecisionFacilitator;
  private historyRecorder: SessionHistoryRecorder;
  private notifier: AbsentStakeholderNotifier;
  private contributions: Map<string, UserContribution[]> = new Map();
  private decisions: Map<string, DecisionOption[]> = new Map();

  constructor() {
    this.contextTracker = new SessionContextTracker();
    this.synthesizer = new ContributionSynthesizer();
    this.facilitator = new DecisionFacilitator();
    this.historyRecorder = new SessionHistoryRecorder();
    this.notifier = new AbsentStakeholderNotifier();
  }

  /**
   * Create a new collaborative session
   */
  createSession(
    organizationId: string,
    title: string,
    topic: string,
    description: string | undefined,
    creator: Participant,
  ): CollaborativeSession {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session = this.contextTracker.createSession(
      sessionId,
      organizationId,
      title,
      topic,
      creator,
    );

    this.contributions.set(sessionId, []);
    this.decisions.set(sessionId, []);

    this.historyRecorder.recordParticipantJoined(sessionId, creator);

    return { ...session, description };
  }

  /**
   * Add participant to session
   */
  addParticipant(sessionId: string, participant: Participant): CollaborativeSession | null {
    const session = this.contextTracker.addParticipant(sessionId, participant);
    if (session) {
      this.historyRecorder.recordParticipantJoined(sessionId, participant);
    }
    return session;
  }

  /**
   * Remove participant from session
   */
  removeParticipant(sessionId: string, participantId: string): CollaborativeSession | null {
    const session = this.contextTracker.getSession(sessionId);
    const participant = session ? this.contextTracker.getParticipant(sessionId, participantId) : null;

    if (participant) {
      this.historyRecorder.recordParticipantLeft(sessionId, participant);
    }

    return this.contextTracker.removeParticipant(sessionId, participantId);
  }

  /**
   * End a session
   */
  endSession(sessionId: string, concludedBy: Participant, reason: string): CollaborativeSession | null {
    const session = this.contextTracker.concludeSession(sessionId);
    if (session) {
      this.historyRecorder.recordSessionConcluded(sessionId, concludedBy, reason);

      // Notify absent stakeholders of final decision
      const decisions = this.decisions.get(sessionId) || [];
      if (decisions.length > 0) {
        const topDecision = decisions[0];
        const allParticipants = this.contextTracker.getAllParticipants(sessionId);
        const organizationRoles = this.getOrganizationRoleDistribution();

        const absentStakeholders = this.contextTracker.getAllParticipants(sessionId).length > 0
          ? this.notifier.identifyAbsentStakeholders(
              allParticipants,
              session.topic,
              organizationRoles,
            )
          : [];

        for (const stakeholder of absentStakeholders) {
          this.notifier.notifyAbsentStakeholder(
            sessionId,
            session,
            stakeholder,
            topDecision.title,
            `Session concluded with decision: ${topDecision.title}`,
          );
        }
      }
    }
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): CollaborativeSession | undefined {
    return this.contextTracker.getSession(sessionId);
  }

  /**
   * Add contribution to session
   */
  addContribution(
    sessionId: string,
    participantId: string,
    content: string,
    type: 'opinion' | 'data_point' | 'analysis' | 'recommendation' | 'concern',
    confidence?: number,
  ): UserContribution {
    this.contextTracker.recordParticipantActivity(sessionId, participantId);

    const contribution: UserContribution = {
      id: `contrib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      participantId,
      content,
      type,
      confidence: confidence ?? 50,
      createdAt: new Date(),
    };

    const sessionContributions = this.contributions.get(sessionId) || [];
    sessionContributions.push(contribution);
    this.contributions.set(sessionId, sessionContributions);

    const participant = this.contextTracker.getParticipant(sessionId, participantId);
    if (participant) {
      this.historyRecorder.recordContribution(
        sessionId,
        participant,
        contribution.id,
        content,
        type,
      );
    }

    return contribution;
  }

  /**
   * Get all contributions for a session
   */
  getContributions(sessionId: string): UserContribution[] {
    return this.contributions.get(sessionId) || [];
  }

  /**
   * Synthesize contributions
   */
  synthesizeContributions(sessionId: string) {
    const sessionContributions = this.contributions.get(sessionId) || [];
    return this.synthesizer.synthesizeContributions(sessionContributions);
  }

  /**
   * Analyze agreement on a contribution
   */
  analyzeAgreement(sessionId: string, contributionId: string) {
    const contributions = this.contributions.get(sessionId) || [];
    const reference = contributions.find((c) => c.id === contributionId);

    if (!reference) {
      return null;
    }

    return this.synthesizer.analyzeAgreement(reference, contributions);
  }

  /**
   * Create decision option
   */
  createDecisionOption(
    sessionId: string,
    title: string,
    description: string,
    relatedContributions: UserContribution[],
    proposedBy: Participant,
  ): DecisionOption {
    const option = this.facilitator.createDecisionOption(
      `option_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      description,
      relatedContributions,
    );

    const decisions = this.decisions.get(sessionId) || [];
    decisions.push(option);
    this.decisions.set(sessionId, decisions);

    this.historyRecorder.recordDecisionProposal(
      sessionId,
      proposedBy,
      option.id,
      title,
      description,
    );

    return option;
  }

  /**
   * Get decision options for session
   */
  getDecisionOptions(sessionId: string): DecisionOption[] {
    return this.decisions.get(sessionId) || [];
  }

  /**
   * Get decision facilitation view
   */
  getDecisionFacilitationView(sessionId: string) {
    const options = this.decisions.get(sessionId) || [];
    const participants = this.contextTracker.getAllParticipants(sessionId);
    const participantRoles = participants.map((p) => ({ id: p.id, role: p.role }));

    return this.facilitator.generateFacilitationView(options, participantRoles);
  }

  /**
   * Get role-filtered view of data for participant
   */
  getFilteredView(sessionId: string, participantId: string) {
    const contributions = this.contributions.get(sessionId) || [];
    const decisions = this.decisions.get(sessionId) || [];

    return this.contextTracker.getFilteredView(
      sessionId,
      participantId,
      contributions,
      decisions,
    );
  }

  /**
   * Record a vote on a decision
   */
  recordVote(
    sessionId: string,
    participantId: string,
    optionId: string,
    vote: 'support' | 'oppose' | 'abstain',
  ): void {
    const participant = this.contextTracker.getParticipant(sessionId, participantId);
    if (participant) {
      this.historyRecorder.recordDecisionVote(
        sessionId,
        participant,
        optionId,
        vote,
      );
    }

    const decisions = this.decisions.get(sessionId) || [];
    const option = decisions.find((d) => d.id === optionId);
    if (option) {
      if (vote === 'support' && !option.proponents.includes(participantId)) {
        option.proponents.push(participantId);
        // Remove from opponents if previously opposed
        option.opponents = option.opponents.filter((p) => p !== participantId);
      } else if (vote === 'oppose' && !option.opponents.includes(participantId)) {
        option.opponents.push(participantId);
        // Remove from proponents if previously supported
        option.proponents = option.proponents.filter((p) => p !== participantId);
      }
    }
  }

  /**
   * Identify absent stakeholders
   */
  identifyAbsentStakeholders(sessionId: string): AbsentStakeholder[] {
    const session = this.contextTracker.getSession(sessionId);
    if (!session) return [];

    const participants = this.contextTracker.getAllParticipants(sessionId);
    const organizationRoles = this.getOrganizationRoleDistribution();

    return this.notifier.identifyAbsentStakeholders(
      participants,
      session.topic,
      organizationRoles,
    );
  }

  /**
   * Get session history
   */
  getSessionHistory(sessionId: string) {
    return this.historyRecorder.getSessionHistory(sessionId);
  }

  /**
   * Get session audit trail
   */
  getSessionAuditTrail(sessionId: string) {
    return this.historyRecorder.generateAuditTrail(sessionId);
  }

  /**
   * Get session metrics
   */
  getSessionMetrics(sessionId: string): CollaborationMetrics | null {
    const sessionStats = this.contextTracker.getSessionStats(sessionId);
    if (!sessionStats) return null;

    const contributions = this.contributions.get(sessionId) || [];
    const decisions = this.decisions.get(sessionId) || [];
    const synthesized = this.synthesizer.synthesizeContributions(contributions);

    const consensusLevels = synthesized.map((s) => s.consensusScore);
    const consensusLevel =
      consensusLevels.length > 0
        ? consensusLevels.reduce((a, b) => a + b, 0) / consensusLevels.length
        : 0;

    const session = this.contextTracker.getSession(sessionId);
    const sessionDurationMs = session
      ? new Date().getTime() - session.createdAt.getTime()
      : 0;
    const sessionDurationMinutes = Math.round(sessionDurationMs / 60000);

    const avgParticipationRate =
      sessionStats.totalParticipants > 0
        ? (sessionStats.activeParticipants / sessionStats.totalParticipants) * 100
        : 0;

    return {
      sessionId,
      totalParticipants: sessionStats.totalParticipants,
      activeParticipants: sessionStats.activeParticipants,
      totalContributions: contributions.length,
      consensusLevel: Math.round(consensusLevel),
      decisionsMade: decisions.length,
      averageParticipationRate: Math.round(avgParticipationRate),
      sessionDurationMinutes,
    };
  }

  /**
   * Get unread notifications for stakeholder
   */
  getUnreadNotifications(stakeholderEmail: string): SessionNotification[] {
    return this.notifier.getUnreadNotifications(stakeholderEmail);
  }

  /**
   * Mark notification as read
   */
  markNotificationAsRead(notificationId: string): boolean {
    return this.notifier.markAsRead(notificationId);
  }

  /**
   * Check if participant can perform action
   */
  canPerformAction(
    sessionId: string,
    participantId: string,
    action: string,
  ): boolean {
    return this.contextTracker.canPerformAction(sessionId, participantId, action);
  }

  /**
   * Get participants in session
   */
  getParticipants(sessionId: string): Participant[] {
    return this.contextTracker.getAllParticipants(sessionId);
  }

  /**
   * Get active participants
   */
  getActiveParticipants(sessionId: string): Participant[] {
    return this.contextTracker.getActiveParticipants(sessionId);
  }

  /**
   * Detect consensus
   */
  detectConsensus(
    sessionId: string,
  ): { exists: boolean; score: number; mainTheme: string } {
    const contributions = this.contributions.get(sessionId) || [];
    return this.synthesizer.detectConsensus(contributions);
  }

  /**
   * Identify disagreements
   */
  identifyDisagreements(sessionId: string) {
    const contributions = this.contributions.get(sessionId) || [];
    return this.synthesizer.identifyDisagreements(contributions);
  }

  /**
   * Get action items from session
   */
  getActionItems(sessionId: string) {
    const synthesized = this.synthesizeContributions(sessionId);
    return this.synthesizer.generateActionItems(synthesized);
  }

  /**
   * Helper: Get organization role distribution
   * In a real implementation, this would query the identity service
   */
  private getOrganizationRoleDistribution(): Array<{
    role: ParticipantRole;
    count: number;
  }> {
    return [
      { role: 'owner', count: 1 },
      { role: 'admin', count: 2 },
      { role: 'executive', count: 3 },
      { role: 'manager', count: 5 },
      { role: 'member', count: 20 },
      { role: 'viewer', count: 10 },
    ];
  }

  /**
   * Pause session
   */
  pauseSession(sessionId: string): CollaborativeSession | null {
    return this.contextTracker.pauseSession(sessionId);
  }

  /**
   * Resume paused session
   */
  resumeSession(sessionId: string): CollaborativeSession | null {
    return this.contextTracker.resumeSession(sessionId);
  }

  /**
   * Get role permissions
   */
  getRolePermissions(role: ParticipantRole) {
    return this.contextTracker.getRolePermissions(role);
  }

  /**
   * Get session consensus details
   */
  getConsensusDetails(sessionId: string) {
    const contributions = this.contributions.get(sessionId) || [];
    const consensus = this.synthesizer.detectConsensus(contributions);
    const disagreements = this.synthesizer.identifyDisagreements(contributions);

    return {
      consensus,
      disagreements,
      analysisTimestamp: new Date(),
    };
  }

  /**
   * Generate decision summary
   */
  generateDecisionSummary(sessionId: string): {
    sessionTitle: string;
    topic: string;
    participants: number;
    contributions: number;
    decisions: number;
    primaryDecision?: DecisionOption;
    status: string;
  } | null {
    const session = this.contextTracker.getSession(sessionId);
    if (!session) return null;

    const contributions = this.contributions.get(sessionId) || [];
    const decisions = this.decisions.get(sessionId) || [];

    return {
      sessionTitle: session.title,
      topic: session.topic,
      participants: session.participants.length,
      contributions: contributions.length,
      decisions: decisions.length,
      primaryDecision: decisions[0],
      status: session.status,
    };
  }
}
