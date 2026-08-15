/**
 * Impossible Travel Detector Service
 *
 * Identifies compromised credentials by detecting concurrent sessions from
 * geo-locations that cannot be reached within the configured time delta.
 *
 * Requirements: 15.3 — Identify compromised credentials through impossible
 * travel and concurrent sessions detection.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  SecurityEvent,
  SecurityPolicy,
  UserSession,
} from './security-anomaly.interfaces';

@Injectable()
export class ImpossibleTravelDetectorService {
  private readonly logger = new Logger(ImpossibleTravelDetectorService.name);

  /** Active sessions keyed by sessionId */
  private readonly activeSessions = new Map<string, UserSession>();

  // ── Session lifecycle ─────────────────────────────────────────────────────

  registerSession(session: UserSession): void {
    this.activeSessions.set(session.sessionId, session);
  }

  updateSession(sessionId: string, updates: Partial<UserSession>): void {
    const s = this.activeSessions.get(sessionId);
    if (s) Object.assign(s, updates);
  }

  terminateSession(sessionId: string): void {
    const s = this.activeSessions.get(sessionId);
    if (s) s.isActive = false;
  }

  getActiveSessions(userId: string): UserSession[] {
    return Array.from(this.activeSessions.values()).filter(
      (s) => s.userId === userId && s.isActive,
    );
  }

  // ── Detection ─────────────────────────────────────────────────────────────

  /**
   * Check a newly registered / updated session for impossible travel.
   *
   * Detection logic:
   *  - Find other active sessions for the same user
   *  - If any concurrent session originates from a different country
   *    within the configured impossibleTravelWindowHours, flag as impossible travel
   *  - Assign critical severity (0.95 confidence) since this is a very strong signal
   */
  detect(session: UserSession, policy: SecurityPolicy): SecurityEvent | null {
    const windowMs = policy.impossibleTravelWindowHours * 60 * 60 * 1000;
    const now = session.lastActivityAt.getTime();

    const otherSessions = this.getActiveSessions(session.userId).filter(
      (s) =>
        s.sessionId !== session.sessionId &&
        s.isActive &&
        Math.abs(s.lastActivityAt.getTime() - now) <= windowMs,
    );

    for (const other of otherSessions) {
      if (
        other.countryCode &&
        session.countryCode &&
        other.countryCode !== session.countryCode
      ) {
        const timeDeltaMinutes = Math.abs(
          other.lastActivityAt.getTime() - now,
        ) / 60_000;

        const event: SecurityEvent = {
          id: `travel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          organizationId: session.organizationId,
          userId: session.userId,
          sessionId: session.sessionId,
          type: 'impossible_travel',
          severity: 'critical',
          confidence: 0.95,
          evidence: {
            description:
              `Concurrent sessions from different countries within ` +
              `${policy.impossibleTravelWindowHours}h: ` +
              `${other.countryCode} (${other.sessionId}) and ` +
              `${session.countryCode} (${session.sessionId})`,
            data: {
              session1: {
                id: session.sessionId,
                country: session.countryCode,
                ip: session.ipAddress,
                lastActivity: session.lastActivityAt.toISOString(),
              },
              session2: {
                id: other.sessionId,
                country: other.countryCode,
                ip: other.ipAddress,
                lastActivity: other.lastActivityAt.toISOString(),
              },
              timeDeltaMinutes,
              windowHours: policy.impossibleTravelWindowHours,
            },
            relatedSessions: [other.sessionId],
          },
          timestamp: new Date(),
          resolved: false,
        };

        this.logger.warn(
          `[ImpossibleTravel] user=${session.userId} org=${session.organizationId} ` +
            `countries=[${other.countryCode},${session.countryCode}] ` +
            `delta=${timeDeltaMinutes.toFixed(1)}min`,
        );
        return event;
      }
    }

    // Also check for concurrent_session from same country (less severe)
    if (otherSessions.length > 0) {
      const sameCounrty = otherSessions.filter(
        (s) => s.countryCode === session.countryCode,
      );
      if (sameCounrty.length >= 2) {
        const event: SecurityEvent = {
          id: `concurrent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          organizationId: session.organizationId,
          userId: session.userId,
          sessionId: session.sessionId,
          type: 'concurrent_session',
          severity: 'medium',
          confidence: 0.7,
          evidence: {
            description: `${sameCounrty.length + 1} concurrent sessions from same country`,
            data: {
              concurrentCount: sameCounrty.length + 1,
              country: session.countryCode,
            },
            relatedSessions: sameCounrty.map((s) => s.sessionId),
          },
          timestamp: new Date(),
          resolved: false,
        };
        return event;
      }
    }

    return null;
  }
}
