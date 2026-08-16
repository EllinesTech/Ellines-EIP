/**
 * Information Filter
 * Provides role-appropriate information filtering per participant
 */

import {
  UserContribution,
  DecisionOption,
  ParticipantRole,
  Participant,
  RolePermission,
} from './types';

export interface FilteredInformation {
  participant: Participant;
  filteredContributions: UserContribution[];
  accessibleDecisions: DecisionOption[];
  restrictedAreas: string[];
  accessLevel: 'full' | 'partial' | 'restricted';
}

export class InformationFilter {
  private dataClassifications: Map<string, ParticipantRole[]> = new Map([
    ['financial_data', ['owner', 'admin', 'executive']],
    ['personnel_data', ['owner', 'admin', 'manager']],
    ['operational_metrics', ['owner', 'admin', 'executive', 'manager', 'member']],
    ['strategic_analysis', ['owner', 'admin', 'executive']],
    ['customer_sensitive', ['owner', 'admin', 'executive']],
    ['vendor_contracts', ['owner', 'admin', 'executive']],
    ['general_information', ['owner', 'admin', 'executive', 'manager', 'member', 'viewer']],
  ]);

  /**
   * Filter contributions based on participant role
   */
  filterContributions(
    contributions: UserContribution[],
    participant: Participant,
    permissions: RolePermission,
  ): UserContribution[] {
    return contributions.filter((contrib) => {
      // Always show own contributions
      if (contrib.participantId === participant.id) {
        return true;
      }

      // Always show general analysis and opinions
      if (contrib.type === 'analysis' || contrib.type === 'opinion') {
        return true;
      }

      // Check data type restrictions
      if (contrib.type === 'data_point') {
        // Parse content for data classification hints
        if (
          this.containsFinancialData(contrib.content) &&
          !permissions.canViewFinancialData
        ) {
          return false;
        }

        if (
          this.containsPersonnelData(contrib.content) &&
          !permissions.canViewPersonnelData
        ) {
          return false;
        }

        if (
          this.containsStrategicAnalysis(contrib.content) &&
          !permissions.canViewStrategicAnalysis
        ) {
          return false;
        }
      }

      // Concerns are usually visible unless about restricted topics
      if (contrib.type === 'concern') {
        if (
          this.containsFinancialData(contrib.content) &&
          !permissions.canViewFinancialData
        ) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Filter decision options based on role
   */
  filterDecisions(
    options: DecisionOption[],
    participant: Participant,
    permissions: RolePermission,
  ): DecisionOption[] {
    return options.filter((option) => {
      // Restrict large decisions based on permissions
      if (
        option.proponents.length + option.opponents.length > 5 &&
        !permissions.canProposeLargeDecisions &&
        !permissions.canViewStrategicAnalysis
      ) {
        // Can view but with restrictions
        return true; // Still show, but will be marked as restricted
      }

      // Restrict financial impact decisions
      if (
        option.estimatedImpact.financial &&
        !permissions.canViewFinancialData
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Generate filtered view for participant
   */
  generateFilteredView(
    participant: Participant,
    contributions: UserContribution[],
    options: DecisionOption[],
    permissions: RolePermission,
  ): FilteredInformation {
    const filteredContributions = this.filterContributions(
      contributions,
      participant,
      permissions,
    );

    const accessibleDecisions = this.filterDecisions(
      options,
      participant,
      permissions,
    );

    const restrictedAreas = this.identifyRestrictedAreas(permissions);
    const accessLevel = this.calculateAccessLevel(permissions);

    return {
      participant,
      filteredContributions,
      accessibleDecisions,
      restrictedAreas,
      accessLevel,
    };
  }

  /**
   * Redact sensitive information from contribution
   */
  redactSensitiveContent(
    contribution: UserContribution,
    permissions: RolePermission,
  ): UserContribution {
    let redactedContent = contribution.content;

    if (!permissions.canViewFinancialData) {
      redactedContent = this.redactFinancialData(redactedContent);
    }

    if (!permissions.canViewPersonnelData) {
      redactedContent = this.redactPersonnelData(redactedContent);
    }

    if (!permissions.canViewStrategicAnalysis) {
      redactedContent = this.redactStrategicContent(redactedContent);
    }

    return {
      ...contribution,
      content: redactedContent,
    };
  }

  /**
   * Create audit trail for access
   */
  createAccessAuditEntry(
    participant: Participant,
    action: 'view' | 'filter',
    itemType: 'contribution' | 'decision',
    itemId: string,
    accessGranted: boolean,
  ): {
    timestamp: Date;
    participant: string;
    action: string;
    itemType: string;
    itemId: string;
    accessGranted: boolean;
  } {
    return {
      timestamp: new Date(),
      participant: participant.id,
      action: `${action}_${itemType}`,
      itemType,
      itemId,
      accessGranted,
    };
  }

  /**
   * Check if content contains financial data
   */
  private containsFinancialData(content: string): boolean {
    const financialKeywords = [
      'budget',
      'revenue',
      'cost',
      'profit',
      'margin',
      'financial',
      'spending',
      'investment',
      'capital',
      'price',
      'rate',
      '$',
      '€',
      '£',
    ];

    const lowerContent = content.toLowerCase();
    return financialKeywords.some((keyword) => lowerContent.includes(keyword));
  }

  /**
   * Check if content contains personnel data
   */
  private containsPersonnelData(content: string): boolean {
    const personnelKeywords = [
      'employee',
      'staff',
      'salary',
      'compensation',
      'performance',
      'hiring',
      'termination',
      'personal',
      'background',
      'individual',
    ];

    const lowerContent = content.toLowerCase();
    return personnelKeywords.some((keyword) => lowerContent.includes(keyword));
  }

  /**
   * Check if content is strategic analysis
   */
  private containsStrategicAnalysis(content: string): boolean {
    const strategicKeywords = [
      'strategy',
      'strategic',
      'roadmap',
      'vision',
      'mission',
      'competitive',
      'market position',
      'acquisition',
      'merger',
      'expansion',
      'confidential',
    ];

    const lowerContent = content.toLowerCase();
    return strategicKeywords.some((keyword) => lowerContent.includes(keyword));
  }

  /**
   * Redact financial data
   */
  private redactFinancialData(content: string): string {
    return content
      .replace(/\$[\d,]+(?:\.\d+)?/g, '[FINANCIAL_REDACTED]')
      .replace(/\d+%\s+(?:increase|decrease|growth|margin)/gi, '[FINANCIAL_REDACTED]')
      .replace(/budget|revenue|cost|profit/gi, '[REDACTED]');
  }

  /**
   * Redact personnel data
   */
  private redactPersonnelData(content: string): string {
    return content
      .replace(/salary|compensation|bonus/gi, '[REDACTED]')
      .replace(/hire|fire|termination/gi, '[REDACTED]')
      .replace(/performance review/gi, '[REDACTED]');
  }

  /**
   * Redact strategic content
   */
  private redactStrategicContent(content: string): string {
    return content
      .replace(/acquisition|merger|confidential|strategic plan/gi, '[REDACTED]')
      .replace(/competitive advantage|market position/gi, '[REDACTED]');
  }

  /**
   * Identify restricted areas for participant
   */
  private identifyRestrictedAreas(permissions: RolePermission): string[] {
    const restricted: string[] = [];

    if (!permissions.canViewFinancialData) {
      restricted.push('Financial Data');
    }
    if (!permissions.canViewPersonnelData) {
      restricted.push('Personnel Information');
    }
    if (!permissions.canViewStrategicAnalysis) {
      restricted.push('Strategic Analysis');
    }
    if (!permissions.canProposeLargeDecisions) {
      restricted.push('Large Decision Proposals');
    }
    if (!permissions.canApproveDecisions) {
      restricted.push('Decision Approvals');
    }

    return restricted;
  }

  /**
   * Calculate access level
   */
  private calculateAccessLevel(
    permissions: RolePermission,
  ): 'full' | 'partial' | 'restricted' {
    const restrictions =
      (permissions.canViewFinancialData ? 0 : 1) +
      (permissions.canViewPersonnelData ? 0 : 1) +
      (permissions.canViewStrategicAnalysis ? 0 : 1) +
      (permissions.canViewOperationalMetrics ? 0 : 1);

    if (restrictions === 0) {
      return 'full';
    } else if (restrictions <= 2) {
      return 'partial';
    } else {
      return 'restricted';
    }
  }

  /**
   * Create information access summary
   */
  createAccessSummary(
    participants: Participant[],
    allContributions: UserContribution[],
    allDecisions: DecisionOption[],
    rolePermissions: Map<ParticipantRole, RolePermission>,
  ): Map<string, FilteredInformation> {
    const summary = new Map<string, FilteredInformation>();

    for (const participant of participants) {
      const permissions = rolePermissions.get(participant.role);
      if (!permissions) continue;

      const filtered = this.generateFilteredView(
        participant,
        allContributions,
        allDecisions,
        permissions,
      );

      summary.set(participant.id, filtered);
    }

    return summary;
  }

  /**
   * Get data accessibility statistics
   */
  getAccessibilityStatistics(
    filteredViews: Map<string, FilteredInformation>,
  ): {
    averageVisibleContributions: number;
    averageVisibleDecisions: number;
    mostRestrictedRole: string;
    leastRestrictedRole: string;
  } {
    const views = Array.from(filteredViews.values());

    if (views.length === 0) {
      return {
        averageVisibleContributions: 0,
        averageVisibleDecisions: 0,
        mostRestrictedRole: 'N/A',
        leastRestrictedRole: 'N/A',
      };
    }

    const totalContribs = views.reduce(
      (sum, v) => sum + v.filteredContributions.length,
      0,
    );
    const totalDecisions = views.reduce(
      (sum, v) => sum + v.accessibleDecisions.length,
      0,
    );

    const avgContribs = totalContribs / views.length;
    const avgDecisions = totalDecisions / views.length;

    const mostRestricted = views.reduce((a, b) =>
      a.restrictedAreas.length > b.restrictedAreas.length ? a : b,
    );

    const leastRestricted = views.reduce((a, b) =>
      a.restrictedAreas.length < b.restrictedAreas.length ? a : b,
    );

    return {
      averageVisibleContributions: Math.round(avgContribs),
      averageVisibleDecisions: Math.round(avgDecisions),
      mostRestrictedRole: mostRestricted.participant.role,
      leastRestrictedRole: leastRestricted.participant.role,
    };
  }

  /**
   * Validate access compliance
   */
  validateAccessCompliance(
    participant: Participant,
    permissions: RolePermission,
    attemptedAction: string,
  ): { allowed: boolean; reason: string } {
    const actionPermissionMap: Record<string, keyof RolePermission> = {
      'view_financial': 'canViewFinancialData',
      'view_personnel': 'canViewPersonnelData',
      'view_operational': 'canViewOperationalMetrics',
      'view_strategic': 'canViewStrategicAnalysis',
      'propose_decision': 'canProposeLargeDecisions',
      'approve_decision': 'canApproveDecisions',
      'exclude_participant': 'canExcludeParticipants',
    };

    const permissionKey = actionPermissionMap[attemptedAction];

    if (!permissionKey) {
      return { allowed: false, reason: 'Unknown action' };
    }

    const allowed = (permissions[permissionKey] as boolean) || false;
    const reason = allowed
      ? 'Action permitted'
      : `${participant.role} role cannot ${attemptedAction}`;

    return { allowed, reason };
  }
}
