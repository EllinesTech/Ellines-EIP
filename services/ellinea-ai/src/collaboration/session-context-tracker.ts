/**
 * Session Context Tracker
 * Manages participant states, roles, permissions, and session context
 */

import {
  CollaborativeSession,
  Participant,
  RolePermission,
  ParticipantRole,
  FilteredViewData,
  AbsentStakeholder,
} from './types';

export class SessionContextTracker {
  private sessions: Map<string, CollaborativeSession> = new Map();
  private rolePermissions: Map<ParticipantRole, RolePermission> = new Map([
    [
      'owner',
      {
        role: 'owner',
        canViewFinancialData: true,
        canViewPersonnelData: true,
        canViewOperationalMetrics: true,
        canViewStrategicAnalysis: true,
        canProposeLargeDecisions: true,
        canApproveDecisions: true,
        canExcludeParticipants: true,
      },
    ],
    [
      'admin',
      {
        role: 'admin',
        canViewFinancialData: true,
        canViewPersonnelData: true,
        canViewOperationalMetrics: true,
        canViewStrategicAnalysis: true,
        canProposeLargeDecisions: true,
        canApproveDecisions: true,
        canExcludeParticipants: false,
      },
    ],
    [
      'executive',
      {
        role: 'executive',
        canViewFinancialData: true,
        canViewPersonnelData: true,
        canViewOperationalMetrics: true,
        canViewStrategicAnalysis: true,
        canProposeLargeDecisions: true,
        canApproveDecisions: false,
        canExcludeParticipants: false,
      },
    ],
    [
      'manager',
      {
        role: 'manager',
        canViewFinancialData: false,
        canViewPersonnelData: true,
        canViewOperationalMetrics: true,
        canViewStrategicAnalysis: false,
        canProposeLargeDecisions: false,
        canApproveDecisions: false,
        canExcludeParticipants: false,
      },
    ],
    [
      'member',
      {
        role: 'member',
        canViewFinancialData: false,
        canViewPersonnelData: false,
        canViewOperationalMetrics: true,
        canViewStrategicAnalysis: false,
        canProposeLargeDecisions: false,
        canApproveDecisions: false,
        canExcludeParticipants: false,
      },
    ],
    [
      'viewer',
      {
        role: 'viewer',
        canViewFinancialData: false,
        canViewPersonnelData: false,
        canViewOperationalMetrics: false,
        canViewStrategicAnalysis: false,
        canProposeLargeDecisions: false,
        canApproveDecisions: false,
        canExcludeParticipants: false,
      },
    ],
  ]);

  /**
   * Create a new collaborative session
   */
  createSession(
    sessionId: string,
    organizationId: string,
    title: string,
    topic: string,
    initialParticipant: Participant,
  ): CollaborativeSession {
    const session: CollaborativeSession = {
      id: sessionId,
      organizationId,
      title,
      topic,
      participants: [initialParticipant],
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): CollaborativeSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Add participant to session
   */
  addParticipant(sessionId: string, participant: Participant): CollaborativeSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const exists = session.participants.some((p) => p.id === participant.id);
    if (exists) return session;

    session.participants.push(participant);
    session.updatedAt = new Date();
    return session;
  }

  /**
   * Remove participant from session
   */
  removeParticipant(sessionId: string, participantId: string): CollaborativeSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const index = session.participants.findIndex((p) => p.id === participantId);
    if (index === -1) return session;

    session.participants.splice(index, 1);
    session.updatedAt = new Date();
    return session;
  }

  /**
   * Update participant activity timestamp
   */
  recordParticipantActivity(sessionId: string, participantId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.find((p) => p.id === participantId);
    if (participant) {
      participant.lastActivityAt = new Date();
    }
  }

  /**
   * Get active participants in session
   */
  getActiveParticipants(sessionId: string): Participant[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.participants.filter((p) => p.isActive);
  }

  /**
   * Get all participants in session
   */
  getAllParticipants(sessionId: string): Participant[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.participants;
  }

  /**
   * Get participant by ID
   */
  getParticipant(sessionId: string, participantId: string): Participant | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    return session.participants.find((p) => p.id === participantId);
  }

  /**
   * Get role permissions for a specific role
   */
  getRolePermissions(role: ParticipantRole): RolePermission | undefined {
    return this.rolePermissions.get(role);
  }

  /**
   * Check if participant can perform action
   */
  canPerformAction(sessionId: string, participantId: string, action: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const participant = session.participants.find((p) => p.id === participantId);
    if (!participant) return false;

    const permissions = this.rolePermissions.get(participant.role);
    if (!permissions) return false;

    // Map actions to permissions
    const actionMap: Record<string, keyof RolePermission> = {
      'view_financial_data': 'canViewFinancialData',
      'view_personnel_data': 'canViewPersonnelData',
      'view_operational_metrics': 'canViewOperationalMetrics',
      'view_strategic_analysis': 'canViewStrategicAnalysis',
      'propose_large_decisions': 'canProposeLargeDecisions',
      'approve_decisions': 'canApproveDecisions',
      'exclude_participants': 'canExcludeParticipants',
    };

    const permissionKey = actionMap[action];
    if (!permissionKey) return false;

    return (permissions[permissionKey] as boolean) || false;
  }

  /**
   * Mark session as concluded
   */
  concludeSession(sessionId: string): CollaborativeSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.status = 'concluded';
    session.concludedAt = new Date();
    session.updatedAt = new Date();
    return session;
  }

  /**
   * Pause session
   */
  pauseSession(sessionId: string): CollaborativeSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.status = 'paused';
    session.updatedAt = new Date();
    return session;
  }

  /**
   * Resume paused session
   */
  resumeSession(sessionId: string): CollaborativeSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (session.status === 'paused') {
      session.status = 'active';
      session.updatedAt = new Date();
    }
    return session;
  }

  /**
   * Get filtered view for a participant based on role
   */
  getFilteredView(
    sessionId: string,
    participantId: string,
    allContributions: any[],
    allOptions: any[],
  ): FilteredViewData | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const participant = session.participants.find((p) => p.id === participantId);
    if (!participant) return null;

    const permissions = this.rolePermissions.get(participant.role);
    if (!permissions) return null;

    // Filter contributions based on permissions
    const filteredContributions = allContributions.filter((contribution) => {
      // Always show their own contributions and neutral ones
      if (contribution.participantId === participantId) return true;
      if (contribution.type === 'analysis') return true;

      // Apply data type filtering
      if (
        contribution.dataType === 'financial' &&
        !permissions.canViewFinancialData
      )
        return false;
      if (
        contribution.dataType === 'personnel' &&
        !permissions.canViewPersonnelData
      )
        return false;

      return true;
    });

    // Filter options based on permissions
    const accessibleInsights = allOptions.filter((option) => {
      if (!permissions.canViewStrategicAnalysis && option.type === 'strategic')
        return false;
      if (!permissions.canViewFinancialData && option.type === 'financial')
        return false;
      return true;
    });

    return {
      participantId,
      role: participant.role,
      filteredContributions,
      accessibleInsights,
    };
  }

  /**
   * Identify absent stakeholders who should be involved
   */
  identifyAbsentStakeholders(
    sessionId: string,
    topic: string,
    allOrganizationRoles: Record<ParticipantRole, number>,
  ): AbsentStakeholder[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const presentRoles = new Set(
      session.participants.map((p) => p.role),
    );
    const absentStakeholders: AbsentStakeholder[] = [];

    // Determine which roles are critical for this topic
    const criticalRoles: Record<string, ParticipantRole[]> = {
      financial: ['owner', 'admin', 'executive'],
      operational: ['admin', 'executive', 'manager'],
      strategic: ['owner', 'executive'],
      personnel: ['admin', 'manager'],
    };

    const relevantRoles = criticalRoles[topic] || [];

    for (const role of relevantRoles) {
      if (!presentRoles.has(role) && allOrganizationRoles[role] > 0) {
        absentStakeholders.push({
          id: `absent_${role}_${Date.now()}`,
          name: `${role.charAt(0).toUpperCase() + role.slice(1)} (Absent)`,
          email: `${role}@org.local`,
          role,
          relevanceToDecision: 'high',
          potentialConcerns: [
            `Key insights from ${role} perspective missing`,
          ],
        });
      }
    }

    return absentStakeholders;
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    totalParticipants: number;
    activeParticipants: number;
    averageLastActivity: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const activeParticipants = session.participants.filter((p) => p.isActive)
      .length;
    const now = new Date().getTime();
    const avgLastActivity =
      session.participants.length > 0
        ? session.participants.reduce(
            (sum, p) => sum + (now - p.lastActivityAt.getTime()),
            0,
          ) / session.participants.length
        : 0;

    return {
      totalParticipants: session.participants.length,
      activeParticipants,
      averageLastActivity: avgLastActivity,
    };
  }
}
