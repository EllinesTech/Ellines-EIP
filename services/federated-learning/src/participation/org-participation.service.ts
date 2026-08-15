import { Injectable, Logger } from '@nestjs/common';
import { OrganizationParticipation } from '../interfaces/federated-learning.interfaces';

/**
 * Organization Participation Service
 * Req 3.8: Opt-in/opt-out management per organization
 */
@Injectable()
export class OrgParticipationService {
  private readonly logger = new Logger(OrgParticipationService.name);

  // In-memory store (would be persisted in database in production)
  private participations = new Map<string, OrganizationParticipation>();

  /**
   * Register organization for federated learning
   * Req 3.8: Opt-in mechanism
   * @param orgId Organization ID
   * @returns Participation record
   */
  async optIn(orgId: string): Promise<OrganizationParticipation> {
    this.logger.debug(`Organization ${orgId} opted in to federated learning`);

    const participation: OrganizationParticipation = {
      orgId,
      optedIn: true,
      joinedAt: new Date(),
    };

    this.participations.set(orgId, participation);
    return participation;
  }

  /**
   * Unregister organization from federated learning
   * Req 3.8: Opt-out mechanism
   * @param orgId Organization ID
   * @param reason Opt-out reason
   * @returns Updated participation record
   */
  async optOut(orgId: string, reason: string): Promise<OrganizationParticipation> {
    this.logger.debug(`Organization ${orgId} opted out: ${reason}`);

    const participation = this.participations.get(orgId) || { orgId, optedIn: false };

    const updated: OrganizationParticipation = {
      ...participation,
      optedIn: false,
      optOutReason: reason,
    };

    this.participations.set(orgId, updated);
    return updated;
  }

  /**
   * Check if organization is opted in
   * Req 3.8: Verify opt-in status before including in round
   * @param orgId Organization ID
   * @returns Whether organization is opted in
   */
  isOptedIn(orgId: string): boolean {
    const participation = this.participations.get(orgId);
    return participation?.optedIn ?? false;
  }

  /**
   * Get participation status for organization
   * @param orgId Organization ID
   * @returns Participation record
   */
  getParticipationStatus(orgId: string): OrganizationParticipation {
    return this.participations.get(orgId) || { orgId, optedIn: false };
  }

  /**
   * Get all opted-in organizations
   * @returns List of opted-in organization IDs
   */
  getOptedInOrganizations(): string[] {
    const orgs: string[] = [];
    for (const [_, participation] of this.participations) {
      if (participation.optedIn) {
        orgs.push(participation.orgId);
      }
    }
    return orgs;
  }

  /**
   * Filter organizations by opt-in status
   * @param orgIds Organization IDs to filter
   * @returns Only opted-in organizations
   */
  filterOptedIn(orgIds: string[]): string[] {
    return orgIds.filter((orgId) => this.isOptedIn(orgId));
  }

  /**
   * Get participation statistics
   * @returns Statistics about participation
   */
  getParticipationStats(): {
    totalOrganizations: number;
    optedInCount: number;
    optedOutCount: number;
    optInRate: number;
  } {
    let optedInCount = 0;
    let optedOutCount = 0;

    for (const participation of this.participations.values()) {
      if (participation.optedIn) {
        optedInCount++;
      } else {
        optedOutCount++;
      }
    }

    const total = optedInCount + optedOutCount;
    return {
      totalOrganizations: total,
      optedInCount,
      optedOutCount,
      optInRate: total > 0 ? optedInCount / total : 0,
    };
  }

  /**
   * Record participation in a specific round
   * @param orgId Organization ID
   * @param roundId Training round ID
   */
  recordParticipation(orgId: string, roundId: string): void {
    const participation = this.participations.get(orgId);
    if (participation) {
      participation.lastParticipationRound = roundId;
    }
  }

  /**
   * Get organizations that haven't participated recently
   * @param daysSinceLastParticipation Number of days
   * @returns Organization IDs that haven't participated
   */
  getInactiveOrganizations(daysSinceLastParticipation: number = 30): string[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastParticipation);

    const inactive: string[] = [];
    for (const participation of this.participations.values()) {
      if (participation.optedIn && participation.joinedAt) {
        if (participation.joinedAt < cutoffDate) {
          inactive.push(participation.orgId);
        }
      }
    }
    return inactive;
  }

  /**
   * Send notification to organization about participation
   * @param orgId Organization ID
   * @param message Notification message
   */
  async notifyOrganization(orgId: string, message: string): Promise<void> {
    const participation = this.participations.get(orgId);
    if (participation && participation.optedIn) {
      this.logger.debug(`Notification to ${orgId}: ${message}`);
      // In production, would send actual notification via email/API
    }
  }

  /**
   * Send notification to all opted-in organizations
   * @param message Broadcast message
   */
  async broadcastNotification(message: string): Promise<void> {
    const optedInOrgs = this.getOptedInOrganizations();
    this.logger.debug(`Broadcasting to ${optedInOrgs.length} organizations: ${message}`);

    for (const orgId of optedInOrgs) {
      await this.notifyOrganization(orgId, message);
    }
  }

  /**
   * Clear all participation data (reset for testing)
   */
  clearAll(): void {
    this.participations.clear();
  }
}
