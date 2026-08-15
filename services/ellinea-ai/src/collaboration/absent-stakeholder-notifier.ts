/**
 * Absent Stakeholder Notifier
 * Notifies stakeholders when decisions are made in their absence
 */

import {
  AbsentStakeholder,
  SessionNotification,
  Participant,
  CollaborativeSession,
} from './types';

export class AbsentStakeholderNotifier {
  private notifications: Map<string, SessionNotification[]> = new Map();

  /**
   * Identify relevant absent stakeholders for a session
   */
  identifyAbsentStakeholders(
    presentParticipants: Participant[],
    topicArea: string,
    organizationRoles: Array<{ role: string; count: number }>,
  ): AbsentStakeholder[] {
    const presentRoles = new Set(presentParticipants.map((p) => p.role));
    const absentStakeholders: AbsentStakeholder[] = [];

    // Define critical roles per topic
    const criticalRolesByTopic: Record<string, string[]> = {
      financial: ['owner', 'admin', 'executive'],
      operational: ['admin', 'executive', 'manager'],
      strategic: ['owner', 'executive'],
      personnel: ['admin', 'manager'],
      technical: ['admin', 'manager'],
      governance: ['owner', 'admin'],
      default: ['owner', 'executive', 'admin'],
    };

    const criticalRoles = criticalRolesByTopic[topicArea] || criticalRolesByTopic.default;

    for (const role of criticalRoles) {
      if (!presentRoles.has(role)) {
        const roleCount = organizationRoles.find((r) => r.role === role)?.count || 0;
        if (roleCount > 0) {
          absentStakeholders.push({
            id: `absent_${role}_${Date.now()}`,
            name: `${this.formatRoleName(role)} (Absent)`,
            email: `${role}@organization.local`,
            role: role as any,
            relevanceToDecision: this.calculateRelevance(role, topicArea),
            potentialConcerns: this.identifyConcerns(role, topicArea),
          });
        }
      }
    }

    return absentStakeholders;
  }

  /**
   * Create notification for absent stakeholder
   */
  notifyAbsentStakeholder(
    sessionId: string,
    session: CollaborativeSession,
    absentStakeholder: AbsentStakeholder,
    decisionTitle: string,
    impact: string,
  ): SessionNotification {
    const notification: SessionNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      type: 'decision_made',
      recipient: {
        id: absentStakeholder.id,
        name: absentStakeholder.name,
        email: absentStakeholder.email,
        role: absentStakeholder.role,
        isActive: false,
        joinedAt: new Date(),
        lastActivityAt: new Date(),
      },
      title: `Decision Made: ${decisionTitle}`,
      message: this.generateNotificationMessage(
        session,
        absentStakeholder,
        decisionTitle,
        impact,
      ),
      actionUrl: `/app/decisions/${sessionId}`,
      createdAt: new Date(),
    };

    if (!this.notifications.has(sessionId)) {
      this.notifications.set(sessionId, []);
    }

    this.notifications.get(sessionId)!.push(notification);
    return notification;
  }

  /**
   * Generate email message for absent stakeholder
   */
  private generateNotificationMessage(
    session: CollaborativeSession,
    absentStakeholder: AbsentStakeholder,
    decisionTitle: string,
    impact: string,
  ): string {
    const presentCount = session.participants.length;
    const decision = decisionTitle;
    const relevance = absentStakeholder.relevanceToDecision;

    const message = `A decision has been made in the "${session.topic}" collaborative session while you were absent.

Decision: ${decision}
Relevance to your role: ${relevance}
Participants present: ${presentCount}

Impact summary: ${impact}

Your input would have been valuable, particularly regarding:
${absentStakeholder.potentialConcerns?.map((c) => `- ${c}`).join('\n') || '- General governance and oversight'}

Please review the decision details and provide feedback if needed. You can access the full session discussion at the link below.`;

    return message;
  }

  /**
   * Batch notify multiple absent stakeholders
   */
  notifyAbsentStakeholders(
    sessionId: string,
    session: CollaborativeSession,
    absentStakeholders: AbsentStakeholder[],
    decisionTitle: string,
    impact: string,
  ): SessionNotification[] {
    return absentStakeholders.map((stakeholder) =>
      this.notifyAbsentStakeholder(
        sessionId,
        session,
        stakeholder,
        decisionTitle,
        impact,
      ),
    );
  }

  /**
   * Get unread notifications for stakeholder
   */
  getUnreadNotifications(
    stakeholderEmail: string,
  ): SessionNotification[] {
    const allNotifications: SessionNotification[] = [];

    for (const sessionNotifications of this.notifications.values()) {
      allNotifications.push(
        ...sessionNotifications.filter(
          (n) => n.recipient.email === stakeholderEmail && !n.readAt,
        ),
      );
    }

    return allNotifications;
  }

  /**
   * Mark notification as read
   */
  markAsRead(notificationId: string): boolean {
    for (const sessionNotifications of this.notifications.values()) {
      const notification = sessionNotifications.find((n) => n.id === notificationId);
      if (notification) {
        notification.readAt = new Date();
        return true;
      }
    }
    return false;
  }

  /**
   * Get notification statistics
   */
  getNotificationStats(sessionId: string): {
    total: number;
    unread: number;
    byType: Record<string, number>;
  } {
    const sessionNotifications = this.notifications.get(sessionId) || [];

    const byType: Record<string, number> = {};
    let unreadCount = 0;

    for (const notification of sessionNotifications) {
      byType[notification.type] = (byType[notification.type] || 0) + 1;
      if (!notification.readAt) unreadCount++;
    }

    return {
      total: sessionNotifications.length,
      unread: unreadCount,
      byType,
    };
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevance(
    role: string,
    topicArea: string,
  ): 'high' | 'medium' | 'low' {
    const relevanceMap: Record<string, Record<string, 'high' | 'medium' | 'low'>> = {
      owner: {
        financial: 'high',
        operational: 'high',
        strategic: 'high',
        personnel: 'high',
        technical: 'medium',
        governance: 'high',
        default: 'high',
      },
      admin: {
        financial: 'high',
        operational: 'high',
        strategic: 'medium',
        personnel: 'high',
        technical: 'high',
        governance: 'high',
        default: 'high',
      },
      executive: {
        financial: 'high',
        operational: 'high',
        strategic: 'high',
        personnel: 'medium',
        technical: 'low',
        governance: 'medium',
        default: 'high',
      },
      manager: {
        financial: 'low',
        operational: 'high',
        strategic: 'low',
        personnel: 'high',
        technical: 'medium',
        governance: 'low',
        default: 'medium',
      },
      member: {
        financial: 'low',
        operational: 'medium',
        strategic: 'low',
        personnel: 'low',
        technical: 'medium',
        governance: 'low',
        default: 'low',
      },
      viewer: {
        financial: 'low',
        operational: 'low',
        strategic: 'low',
        personnel: 'low',
        technical: 'low',
        governance: 'low',
        default: 'low',
      },
    };

    const roleMap = relevanceMap[role] || relevanceMap.member;
    return roleMap[topicArea] || roleMap.default;
  }

  /**
   * Identify potential concerns for a role
   */
  private identifyConcerns(role: string, topicArea: string): string[] {
    const concernMap: Record<string, Record<string, string[]>> = {
      owner: {
        financial: ['Strategic impact on profitability', 'Stakeholder alignment'],
        operational: ['Business continuity', 'Risk exposure'],
        strategic: ['Long-term competitive advantage', 'Market positioning'],
        personnel: ['Cultural fit', 'Retention impact'],
      },
      admin: {
        financial: ['Budget implications', 'Approval authority'],
        operational: ['System impact', 'Process changes'],
        strategic: ['Enterprise roadmap alignment'],
        technical: ['Infrastructure requirements', 'Security implications'],
      },
      executive: {
        financial: ['P&L impact', 'Budget allocation'],
        operational: ['Execution feasibility', 'Resource requirements'],
        strategic: ['Market response', 'Competitive positioning'],
      },
      manager: {
        operational: ['Team workload', 'Resource allocation'],
        personnel: ['Staff impact', 'Training needs'],
      },
    };

    const roleConcerns = concernMap[role] || {};
    return roleConcerns[topicArea] || ['General governance and oversight'];
  }

  /**
   * Format role name for display
   */
  private formatRoleName(role: string): string {
    const names: Record<string, string> = {
      owner: 'Owner',
      admin: 'Administrator',
      executive: 'Executive',
      manager: 'Manager',
      member: 'Member',
      viewer: 'Viewer',
    };
    return names[role] || role.charAt(0).toUpperCase() + role.slice(1);
  }

  /**
   * Generate callback URL for action
   */
  generateActionUrl(sessionId: string, notificationId: string): string {
    return `/app/collaboration/sessions/${sessionId}/notifications/${notificationId}`;
  }

  /**
   * Get notifications by session
   */
  getSessionNotifications(sessionId: string): SessionNotification[] {
    return this.notifications.get(sessionId) || [];
  }

  /**
   * Get notification count by role
   */
  getNotificationCountByRole(sessionId: string): Record<string, number> {
    const sessionNotifications = this.notifications.get(sessionId) || [];
    const counts: Record<string, number> = {};

    for (const notification of sessionNotifications) {
      const role = notification.recipient.role;
      counts[role] = (counts[role] || 0) + 1;
    }

    return counts;
  }
}
