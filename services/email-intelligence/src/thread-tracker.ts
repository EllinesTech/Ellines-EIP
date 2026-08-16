import { Injectable, Logger } from '@nestjs/common';

export interface EmailThread {
  threadId: string;
  subject: string;
  participants: string[];
  messageIds: string[];
  firstMessageAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  summary: string;
  keyDecisions: string[];
  status: 'active' | 'resolved' | 'archived';
  createdAt: Date;
}

export interface ThreadMessage {
  messageId: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  timestamp: Date;
  isReply: boolean;
  replyTo?: string;
  attachments: string[];
}

@Injectable()
export class ThreadTracker {
  private readonly logger = new Logger(ThreadTracker.name);

  // In-memory storage for threads (in production, use database)
  private threads: Map<string, EmailThread> = new Map();
  private messages: Map<string, ThreadMessage> = new Map();
  private threadIndex: Map<string, string> = new Map(); // subject hash -> threadId

  /**
   * Create a hash key from subject for thread grouping
   */
  private createSubjectHash(subject: string): string {
    // Remove common prefixes like "Re:", "Fwd:", etc.
    const cleaned = subject.replace(/^(Re:|Fwd:|Re\[.+\]:|Fw:)\s*/i, '').trim().toLowerCase();
    return cleaned;
  }

  /**
   * Extract base subject for thread grouping
   */
  private extractBaseSubject(subject: string): string {
    return subject.replace(/^(Re:|Fwd:|Re\[.+\]:|Fw:)\s*/i, '').trim();
  }

  /**
   * Find or create thread for a message
   */
  private findOrCreateThread(
    subject: string,
    from: string,
    messageId: string,
    timestamp: Date,
  ): string {
    const subjectHash = this.createSubjectHash(subject);
    const baseSubject = this.extractBaseSubject(subject);

    // Look for existing thread with same base subject
    let threadId = this.threadIndex.get(subjectHash);

    if (!threadId) {
      // Create new thread
      threadId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const thread: EmailThread = {
        threadId,
        subject: baseSubject,
        participants: [from],
        messageIds: [messageId],
        firstMessageAt: timestamp,
        lastMessageAt: timestamp,
        messageCount: 1,
        summary: '',
        keyDecisions: [],
        status: 'active',
        createdAt: new Date(),
      };

      this.threads.set(threadId, thread);
      this.threadIndex.set(subjectHash, threadId);
    } else {
      // Update existing thread
      const thread = this.threads.get(threadId);
      if (thread) {
        if (!thread.participants.includes(from)) {
          thread.participants.push(from);
        }
        if (!thread.messageIds.includes(messageId)) {
          thread.messageIds.push(messageId);
        }
        thread.messageCount = thread.messageIds.length;
        thread.lastMessageAt = timestamp;
      }
    }

    return threadId;
  }

  /**
   * Add message to thread
   */
  addMessage(
    messageId: string,
    from: string,
    to: string[],
    subject: string,
    body: string,
    timestamp: Date,
    attachments: string[] = [],
    replyToMessageId?: string,
  ): ThreadMessage {
    // Find or create thread
    const threadId = this.findOrCreateThread(subject, from, messageId, timestamp);

    // Create message
    const message: ThreadMessage = {
      messageId,
      threadId,
      from,
      to,
      subject,
      body,
      timestamp,
      isReply: !!replyToMessageId,
      replyTo: replyToMessageId,
      attachments,
    };

    this.messages.set(messageId, message);

    // Update thread summary
    this.updateThreadSummary(threadId);

    return message;
  }

  /**
   * Get thread by ID
   */
  getThread(threadId: string): EmailThread | undefined {
    return this.threads.get(threadId);
  }

  /**
   * Get all messages in a thread
   */
  getThreadMessages(threadId: string): ThreadMessage[] {
    const thread = this.threads.get(threadId);
    if (!thread) {
      return [];
    }

    const threadMessages: ThreadMessage[] = [];
    for (const messageId of thread.messageIds) {
      const message = this.messages.get(messageId);
      if (message) {
        threadMessages.push(message);
      }
    }

    // Sort by timestamp
    return threadMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Generate summary of thread
   */
  generateThreadSummary(threadId: string): string {
    const thread = this.threads.get(threadId);
    if (!thread) {
      return '';
    }

    const messages = this.getThreadMessages(threadId);
    if (messages.length === 0) {
      return '';
    }

    // Create summary from thread metadata
    let summary = `Thread: ${thread.subject}\n`;
    summary += `Participants: ${thread.participants.join(', ')}\n`;
    summary += `Messages: ${thread.messageCount}\n`;
    summary += `Started: ${thread.firstMessageAt.toLocaleDateString()}\n`;
    summary += `Last Activity: ${thread.lastMessageAt.toLocaleDateString()}\n\n`;

    // Add key information from recent messages
    summary += 'Recent Messages:\n';
    const recentMessages = messages.slice(-3);
    for (const msg of recentMessages) {
      const preview = msg.body.substring(0, 100).replace(/\n/g, ' ');
      summary += `- [${msg.timestamp.toLocaleString()}] ${msg.from}: ${preview}...\n`;
    }

    return summary;
  }

  /**
   * Extract key decisions from thread
   */
  private extractKeyDecisions(threadId: string): string[] {
    const messages = this.getThreadMessages(threadId);
    const decisions: string[] = [];

    for (const message of messages) {
      // Look for decision patterns
      const decisionPatterns = [
        /(?:decided|agreed|approved|rejected|decided to)\s+(.+?)(?:\.|,|$)/gi,
        /(?:will|shall|must)\s+(.+?)(?:\.|,|$)/gi,
        /action item:\s*(.+?)(?:\.|,|$)/gi,
      ];

      for (const pattern of decisionPatterns) {
        const matches = message.body.matchAll(pattern);
        for (const match of matches) {
          const decision = match[1].trim();
          if (decision.length > 5 && !decisions.includes(decision)) {
            decisions.push(decision);
          }
        }
      }
    }

    return decisions.slice(0, 5);
  }

  /**
   * Update thread summary and metadata
   */
  private updateThreadSummary(threadId: string): void {
    const thread = this.threads.get(threadId);
    if (!thread) {
      return;
    }

    thread.summary = this.generateThreadSummary(threadId);
    thread.keyDecisions = this.extractKeyDecisions(threadId);
  }

  /**
   * Mark thread as resolved
   */
  markThreadAsResolved(threadId: string): EmailThread | undefined {
    const thread = this.threads.get(threadId);
    if (thread) {
      thread.status = 'resolved';
      return thread;
    }
    return undefined;
  }

  /**
   * Mark thread as archived
   */
  markThreadAsArchived(threadId: string): EmailThread | undefined {
    const thread = this.threads.get(threadId);
    if (thread) {
      thread.status = 'archived';
      return thread;
    }
    return undefined;
  }

  /**
   * Reopen thread (change from resolved to active)
   */
  reopenThread(threadId: string): EmailThread | undefined {
    const thread = this.threads.get(threadId);
    if (thread) {
      thread.status = 'active';
      return thread;
    }
    return undefined;
  }

  /**
   * Search for threads by subject, participant, or content
   */
  searchThreads(query: string): EmailThread[] {
    const results: EmailThread[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [, thread] of this.threads) {
      // Search in subject
      if (thread.subject.toLowerCase().includes(lowerQuery)) {
        results.push(thread);
        continue;
      }

      // Search in participants
      if (thread.participants.some((p) => p.toLowerCase().includes(lowerQuery))) {
        results.push(thread);
        continue;
      }

      // Search in message content
      const messages = this.getThreadMessages(thread.threadId);
      if (messages.some((m) => m.body.toLowerCase().includes(lowerQuery))) {
        results.push(thread);
      }
    }

    return results;
  }

  /**
   * Get conversation history for thread
   */
  getConversationHistory(threadId: string): string {
    const thread = this.threads.get(threadId);
    if (!thread) {
      return '';
    }

    const messages = this.getThreadMessages(threadId);
    let history = `=== Thread: ${thread.subject} ===\n\n`;

    for (const message of messages) {
      history += `From: ${message.from}\n`;
      history += `Date: ${message.timestamp.toLocaleString()}\n`;
      history += `To: ${message.to.join(', ')}\n`;
      history += `---\n`;
      history += `${message.body}\n`;
      if (message.attachments.length > 0) {
        history += `Attachments: ${message.attachments.join(', ')}\n`;
      }
      history += `\n`;
    }

    return history;
  }

  /**
   * Get all threads
   */
  getAllThreads(): EmailThread[] {
    return Array.from(this.threads.values());
  }

  /**
   * Get active threads
   */
  getActiveThreads(): EmailThread[] {
    return Array.from(this.threads.values()).filter((t) => t.status === 'active');
  }

  /**
   * Get thread count
   */
  getThreadCount(): number {
    return this.threads.size;
  }

  /**
   * Clear old threads (for maintenance)
   */
  clearOldThreads(daysOld: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    let cleared = 0;
    const toDelete: string[] = [];

    for (const [threadId, thread] of this.threads) {
      if (thread.lastMessageAt < cutoffDate && thread.status !== 'active') {
        toDelete.push(threadId);
      }
    }

    for (const threadId of toDelete) {
      const thread = this.threads.get(threadId);
      if (thread) {
        // Remove message references
        for (const messageId of thread.messageIds) {
          this.messages.delete(messageId);
        }

        // Remove thread index
        const subjectHash = this.createSubjectHash(thread.subject);
        this.threadIndex.delete(subjectHash);

        // Remove thread
        this.threads.delete(threadId);
        cleared++;
      }
    }

    return cleared;
  }
}
