/**
 * Session History Recorder
 * Records and manages audit trail of collaborative decisions
 */

import { SessionHistoryEntry, Participant } from './types';

export class SessionHistoryRecorder {
  private history: Map<string, SessionHistoryEntry[]> = new Map();

  /**
   * Record an event in session history
   */
  recordEvent(
    sessionId: string,
    entry: Omit<SessionHistoryEntry, 'id'>,
  ): SessionHistoryEntry {
    const event: SessionHistoryEntry = {
      ...entry,
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    if (!this.history.has(sessionId)) {
      this.history.set(sessionId, []);
    }

    this.history.get(sessionId)!.push(event);
    return event;
  }

  /**
   * Get full history for a session
   */
  getSessionHistory(sessionId: string): SessionHistoryEntry[] {
    return this.history.get(sessionId) || [];
  }

  /**
   * Get history entries by type
   */
  getHistoryByType(
    sessionId: string,
    actionType: SessionHistoryEntry['actionType'],
  ): SessionHistoryEntry[] {
    const history = this.history.get(sessionId) || [];
    return history.filter((h) => h.actionType === actionType);
  }

  /**
   * Get recent history entries
   */
  getRecentHistory(
    sessionId: string,
    limitMinutes: number = 60,
  ): SessionHistoryEntry[] {
    const history = this.history.get(sessionId) || [];
    const cutoffTime = new Date(
      Date.now() - limitMinutes * 60 * 1000,
    );

    return history.filter((h) => h.timestamp > cutoffTime);
  }

  /**
   * Record participant join
   */
  recordParticipantJoined(
    sessionId: string,
    participant: Participant,
  ): SessionHistoryEntry {
    return this.recordEvent(sessionId, {
      timestamp: new Date(),
      actionType: 'participant_joined',
      actor: participant,
      description: `${participant.name} (${participant.role}) joined the session`,
    });
  }

  /**
   * Record participant leave
   */
  recordParticipantLeft(
    sessionId: string,
    participant: Participant,
  ): SessionHistoryEntry {
    return this.recordEvent(sessionId, {
      timestamp: new Date(),
      actionType: 'participant_joined', // Reuse for departure tracking
      actor: participant,
      description: `${participant.name} left the session`,
    });
  }

  /**
   * Record contribution
   */
  recordContribution(
    sessionId: string,
    actor: Participant,
    contributionId: string,
    content: string,
    type: string,
  ): SessionHistoryEntry {
    return this.recordEvent(sessionId, {
      timestamp: new Date(),
      actionType: 'contribution_added',
      actor,
      description: `Added ${type} contribution`,
      data: { contributionId, content, type },
    });
  }

  /**
   * Record decision proposal
   */
  recordDecisionProposal(
    sessionId: string,
    actor: Participant,
    optionId: string,
    title: string,
    rationale: string,
  ): SessionHistoryEntry {
    return this.recordEvent(sessionId, {
      timestamp: new Date(),
      actionType: 'decision_proposed',
      actor,
      description: `Proposed decision: "${title}"`,
      data: { optionId, title, rationale },
    });
  }

  /**
   * Record vote/decision
   */
  recordDecisionVote(
    sessionId: string,
    actor: Participant,
    optionId: string,
    vote: 'support' | 'oppose' | 'abstain',
  ): SessionHistoryEntry {
    return this.recordEvent(sessionId, {
      timestamp: new Date(),
      actionType: 'vote_cast',
      actor,
      description: `${actor.name} voted to ${vote} option`,
      data: { optionId, vote },
    });
  }

  /**
   * Record session conclusion
   */
  recordSessionConcluded(
    sessionId: string,
    actor: Participant,
    concludedReason: string,
  ): SessionHistoryEntry {
    return this.recordEvent(sessionId, {
      timestamp: new Date(),
      actionType: 'session_concluded',
      actor,
      description: `Session concluded: ${concludedReason}`,
      data: { reason: concludedReason },
    });
  }

  /**
   * Generate audit trail report
   */
  generateAuditTrail(sessionId: string): {
    sessionId: string;
    totalEvents: number;
    participantJoins: number;
    contributions: number;
    decisions: number;
    votes: number;
    timeline: string;
  } {
    const history = this.getSessionHistory(sessionId);

    const stats = {
      sessionId,
      totalEvents: history.length,
      participantJoins: history.filter((h) => h.actionType === 'participant_joined').length,
      contributions: history.filter((h) => h.actionType === 'contribution_added').length,
      decisions: history.filter((h) => h.actionType === 'decision_proposed').length,
      votes: history.filter((h) => h.actionType === 'vote_cast').length,
      timeline: this.formatTimeline(history),
    };

    return stats;
  }

  /**
   * Format history as timeline
   */
  private formatTimeline(entries: SessionHistoryEntry[]): string {
    if (entries.length === 0) return 'No events recorded';

    const lines = entries
      .slice(0, 20) // Show last 20 events
      .map(
        (e) =>
          `${e.timestamp.toLocaleTimeString()}: ${e.actor.name} - ${e.description}`,
      );

    return lines.join('\n');
  }

  /**
   * Get contribution timeline
   */
  getContributionTimeline(sessionId: string): Array<{
    timestamp: Date;
    participant: string;
    type: string;
    content: string;
  }> {
    const history = this.history.get(sessionId) || [];
    return history
      .filter((h) => h.actionType === 'contribution_added' && h.data)
      .map((h) => ({
        timestamp: h.timestamp,
        participant: h.actor.name,
        type: h.data.type,
        content: h.data.content,
      }));
  }

  /**
   * Get decision timeline
   */
  getDecisionTimeline(sessionId: string): Array<{
    timestamp: Date;
    participant: string;
    title: string;
    votes?: Array<{ voter: string; vote: string }>;
  }> {
    const history = this.history.get(sessionId) || [];
    const decisions = [];

    const proposals = history
      .filter((h) => h.actionType === 'decision_proposed')
      .map((h) => ({
        timestamp: h.timestamp,
        participant: h.actor.name,
        title: h.data.title,
        optionId: h.data.optionId,
      }));

    const votes = history
      .filter((h) => h.actionType === 'vote_cast')
      .reduce((acc, h) => {
        const optionId = h.data.optionId;
        if (!acc[optionId]) acc[optionId] = [];
        acc[optionId].push({
          voter: h.actor.name,
          vote: h.data.vote,
        });
        return acc;
      }, {} as Record<string, Array<{ voter: string; vote: string }>>);

    for (const proposal of proposals) {
      decisions.push({
        timestamp: proposal.timestamp,
        participant: proposal.participant,
        title: proposal.title,
        votes: votes[proposal.optionId],
      });
    }

    return decisions;
  }

  /**
   * Export history as JSON
   */
  exportAsJSON(sessionId: string): string {
    const history = this.getSessionHistory(sessionId);
    return JSON.stringify(
      {
        sessionId,
        exportedAt: new Date().toISOString(),
        eventCount: history.length,
        events: history,
      },
      null,
      2,
    );
  }

  /**
   * Get summary of key decisions
   */
  summarizeDecisions(sessionId: string): Array<{
    title: string;
    proposedBy: string;
    supportVotes: number;
    opposeVotes: number;
    abstainVotes: number;
    status: 'approved' | 'rejected' | 'pending';
  }> {
    const history = this.getSessionHistory(sessionId);

    const decisions = new Map<string, {
      title: string;
      proposedBy: string;
      optionId: string;
      supportVotes: number;
      opposeVotes: number;
      abstainVotes: number;
    }>();

    // First pass: collect decision proposals
    for (const entry of history) {
      if (entry.actionType === 'decision_proposed' && entry.data) {
        decisions.set(entry.data.optionId, {
          title: entry.data.title,
          proposedBy: entry.actor.name,
          optionId: entry.data.optionId,
          supportVotes: 0,
          opposeVotes: 0,
          abstainVotes: 0,
        });
      }
    }

    // Second pass: count votes
    for (const entry of history) {
      if (entry.actionType === 'vote_cast' && entry.data) {
        const decision = decisions.get(entry.data.optionId);
        if (decision) {
          if (entry.data.vote === 'support') decision.supportVotes++;
          else if (entry.data.vote === 'oppose') decision.opposeVotes++;
          else if (entry.data.vote === 'abstain') decision.abstainVotes++;
        }
      }
    }

    // Convert to summary format
    return Array.from(decisions.values()).map((d) => ({
      title: d.title,
      proposedBy: d.proposedBy,
      supportVotes: d.supportVotes,
      opposeVotes: d.opposeVotes,
      abstainVotes: d.abstainVotes,
      status:
        d.supportVotes > d.opposeVotes
          ? 'approved'
          : d.opposeVotes > d.supportVotes
            ? 'rejected'
            : 'pending',
    }));
  }
}
