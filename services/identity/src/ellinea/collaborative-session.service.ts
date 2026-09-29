/**
 * CollaborativeSessionService
 *
 * Stub for real-time collaborative Ellinea AI sessions.
 * Multiple platform operators or org admins can join the same session,
 * see the same question context, and jointly review the AI response.
 *
 * Requirement 21.2: Collaborative intelligence — shared session stub.
 *
 * This is a mock implementation using in-memory Maps.  A production
 * implementation would use Redis pub/sub (via RedisService) and push
 * updates over WebSocket to all session participants.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface CollaborativeParticipant {
  userId: string;
  email: string;
  role: string;
  joinedAt: Date;
}

export interface CollaborativeSession {
  sessionId: string;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  question: string;
  answer: string | null;
  status: 'open' | 'closed';
  participants: CollaborativeParticipant[];
}

@Injectable()
export class CollaborativeSessionService {
  private readonly logger = new Logger(CollaborativeSessionService.name);

  /** In-memory session store (production: Redis + WebSocket). */
  private readonly sessions = new Map<string, CollaborativeSession>();

  /**
   * Create a new collaborative session.
   *
   * @param organizationId  Mandatory tenant scope.
   * @param createdBy       User ID of the session initiator.
   * @param question        Initial question to be collaboratively reviewed.
   */
  createSession(
    organizationId: string,
    createdBy: string,
    question: string,
  ): CollaborativeSession {
    const sessionId = crypto.randomUUID();
    const session: CollaborativeSession = {
      sessionId,
      organizationId,
      createdBy,
      createdAt: new Date(),
      question,
      answer: null,
      status: 'open',
      participants: [],
    };
    this.sessions.set(sessionId, session);
    this.logger.log(`CollaborativeSession created: ${sessionId} by ${createdBy}`);
    return session;
  }

  /**
   * Join an existing session.
   * Requirement 21.2: participants list tracking.
   */
  joinSession(
    sessionId: string,
    organizationId: string,
    participant: Omit<CollaborativeParticipant, 'joinedAt'>,
  ): CollaborativeSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.organizationId !== organizationId) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const alreadyJoined = session.participants.some(
      (p) => p.userId === participant.userId,
    );
    if (!alreadyJoined) {
      session.participants.push({ ...participant, joinedAt: new Date() });
    }

    this.logger.log(`User ${participant.userId} joined session ${sessionId}`);
    return session;
  }

  /**
   * Post the AI answer to a session (broadcasted to all participants).
   */
  postAnswer(
    sessionId: string,
    organizationId: string,
    answer: string,
  ): CollaborativeSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.organizationId !== organizationId) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    session.answer = answer;
    return session;
  }

  /**
   * Close a session.
   */
  closeSession(sessionId: string, organizationId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.organizationId !== organizationId) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    session.status = 'closed';
    this.logger.log(`CollaborativeSession closed: ${sessionId}`);
  }

  /**
   * Get session by ID (with org scope enforcement).
   */
  getSession(sessionId: string, organizationId: string): CollaborativeSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.organizationId !== organizationId) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    return session;
  }

  /**
   * List open sessions for an org.
   */
  listSessions(organizationId: string): CollaborativeSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.organizationId === organizationId && s.status === 'open',
    );
  }
}
