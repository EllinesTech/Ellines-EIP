import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';

/**
 * EmailIntelligenceService — EIP 2.0 Tasks 14.1 / 14.2
 *
 * Provides AI-assisted email classification, action extraction, thread
 * summarisation, and account management for the Email Intelligence connector.
 *
 * Security rules (§5, §6):
 *   - Email account credentials (tokens, passwords) are AES-256-GCM encrypted
 *     at rest via EncryptionService before writing to ConnectorInstallation.
 *   - Every DB query carries a mandatory organizationId equality filter for
 *     tenant isolation (§6).
 *
 * Requirements: 26.4, 32.1–32.8
 */

// ── Shared types ─────────────────────────────────────────────────────────────

export type EmailMessage = {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  receivedAt: Date;
};

export type EmailSummary = {
  urgent: EmailMessage[];
  actionRequired: EmailMessage[];
  information: EmailMessage[];
};

export type ActionItem = {
  verb: string;
  description: string;
  dueDate?: Date;
};

// ── Classification constants ─────────────────────────────────────────────────

const URGENCY_KEYWORDS = [
  'urgent',
  'asap',
  'immediately',
  'critical',
  'emergency',
  'deadline',
  'overdue',
  'escalat',
  'priority',
  'action required',
];

const ACTION_KEYWORDS = [
  'please',
  'review',
  'approve',
  'confirm',
  'respond',
  'complete',
  'submit',
  'send',
  'provide',
  'update',
  'schedule',
  'check',
  'verify',
  'sign',
  'forward',
];

type EmailCategory =
  | 'customerInquiry'
  | 'vendorCommunication'
  | 'internalUpdate'
  | 'spam'
  | 'newsletter'
  | 'other';

const CATEGORY_SIGNALS: Record<EmailCategory, string[]> = {
  customerInquiry: ['customer', 'inquiry', 'question', 'support', 'help', 'issue', 'problem', 'ticket'],
  vendorCommunication: ['invoice', 'vendor', 'supplier', 'purchase', 'order', 'payment', 'billing', 'contract'],
  internalUpdate: ['team', 'internal', 'fyi', 'update', 'company', 'department', 'hr', 'policy'],
  spam: ['unsubscribe', 'click here', 'earn money', 'winner', 'free gift', 'congratulations', 'offer expires'],
  newsletter: ['newsletter', 'subscribe', 'weekly digest', 'monthly update', 'bulletin'],
  other: [],
};

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class EmailIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  // ── Account management ──────────────────────────────────────────────────────

  /**
   * Connect an email account for an organisation.
   *
   * Sensitive fields (token, password) are encrypted before persisting.
   * Stored in ConnectorInstallation with connectorType='email'.
   *
   * Requirement 32.1
   */
  async connectAccount(
    credentials: {
      type: 'gmail' | 'app_password';
      email: string;
      token?: string;
      password?: string;
    },
    orgId: string,
  ) {
    const encryptedToken = credentials.token
      ? await this.encryption.encrypt(credentials.token, orgId)
      : null;

    const encryptedPassword = credentials.password
      ? await this.encryption.encrypt(credentials.password, orgId)
      : null;

    const config = {
      accountType: credentials.type,
      email: credentials.email,
      ...(encryptedToken && { token: encryptedToken }),
      ...(encryptedPassword && { password: encryptedPassword }),
    };

    const installation = await this.prisma.connectorInstallation.create({
      data: {
        organizationId: orgId,
        catalogId: `email-${credentials.type}`,
        displayName: `Email: ${credentials.email}`,
        config,
        status: 'active',
      },
    });

    return {
      id: installation.id,
      email: credentials.email,
      type: credentials.type,
      status: installation.status,
      connectedAt: installation.createdAt,
    };
  }

  // ── Intelligence operations ─────────────────────────────────────────────────

  /**
   * Summarise unread messages from a connected email account.
   *
   * Loads account from ConnectorInstallation (mandatory orgId filter), parses
   * lastPayload JSON, classifies messages by urgency.
   *
   * Requirement 32.2
   */
  async summarizeUnread(accountId: string, orgId: string): Promise<EmailSummary> {
    const installation = await this.prisma.connectorInstallation.findFirst({
      where: {
        id: accountId,
        organizationId: orgId, // mandatory tenant isolation filter (§6)
        catalogId: { startsWith: 'email-' },
      },
    });

    if (!installation) {
      throw new NotFoundException(`Email account ${accountId} not found`);
    }

    let messages: EmailMessage[] = [];

    if (installation.lastPayload) {
      try {
        const raw = installation.lastPayload as unknown;
        const rawArray = Array.isArray(raw) ? raw : [];
        messages = rawArray.map((m: unknown) => this._coerceToEmailMessage(m));
      } catch {
        messages = [];
      }
    }

    const summary: EmailSummary = {
      urgent: [],
      actionRequired: [],
      information: [],
    };

    for (const msg of messages) {
      const textLower = `${msg.subject} ${msg.body}`.toLowerCase();

      if (this._containsAny(textLower, URGENCY_KEYWORDS)) {
        summary.urgent.push(msg);
      } else if (this._containsAny(textLower, ACTION_KEYWORDS)) {
        summary.actionRequired.push(msg);
      } else {
        summary.information.push(msg);
      }
    }

    return summary;
  }

  /**
   * Classify an array of email messages into categories.
   *
   * Requirement 32.3
   */
  categorizeEmails(emails: EmailMessage[]): Array<{ email: EmailMessage; category: EmailCategory }> {
    return emails.map((email) => ({
      email,
      category: this._classifyEmail(email),
    }));
  }

  /**
   * Extract action items from an email body by scanning for action verbs.
   *
   * Requirement 32.4
   */
  extractActions(email: EmailMessage): ActionItem[] {
    const actions: ActionItem[] = [];
    const sentences = email.body
      .replace(/\r\n/g, '\n')
      .split(/[.!?;\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      for (const verb of ACTION_KEYWORDS) {
        if (lower.includes(verb)) {
          const dueDateMatch = sentence.match(
            /\b(?:by|before|due|on)\s+((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\w+ \d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}?))/i,
          );
          actions.push({
            verb,
            description: sentence.slice(0, 200),
            ...(dueDateMatch ? { dueDate: new Date(dueDateMatch[1]) } : {}),
          });
          break; // one action per sentence
        }
      }
    }

    return actions;
  }

  /**
   * Generate a stub draft response for an email.
   *
   * Requirement 32.5
   */
  draftResponse(
    email: EmailMessage,
    context: string,
  ): { to: string; subject: string; body: string } {
    return {
      to: email.from,
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: [
        `Thank you for your email regarding "${email.subject}".`,
        '',
        context ? `Context: ${context}` : '',
        '',
        'We will review your message and get back to you shortly.',
        '',
        'Best regards,',
        '[Your Name]',
      ]
        .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
        .join('\n'),
    };
  }

  /**
   * Track a thread and extract key points, decisions, and pending actions.
   *
   * Requirement 32.6
   */
  async trackThread(
    threadId: string,
    orgId: string,
  ): Promise<{
    keyPoints: string[];
    decisionsMade: string[];
    pendingActions: string[];
  }> {
    // Fetch all connector installations for this org to find the thread
    const installations = await this.prisma.connectorInstallation.findMany({
      where: {
        organizationId: orgId, // mandatory tenant isolation filter (§6)
        catalogId: { startsWith: 'email-' },
      },
    });

    const threadMessages: EmailMessage[] = [];

    for (const installation of installations) {
      if (!installation.lastPayload) continue;
      try {
        const raw = installation.lastPayload as unknown;
        const rawArray = Array.isArray(raw) ? raw : [];
        const messages = rawArray
          .map((m: unknown) => this._coerceToEmailMessage(m))
          .filter((m) => m.threadId === threadId);
        threadMessages.push(...messages);
      } catch {
        // skip malformed payload
      }
    }

    if (threadMessages.length === 0) {
      return { keyPoints: [], decisionsMade: [], pendingActions: [] };
    }

    const keyPoints: string[] = threadMessages.map(
      (m) => `[${m.from}] ${m.subject}: ${m.body.slice(0, 120)}`,
    );

    const decisionsMade: string[] = threadMessages.flatMap((m) =>
      m.body
        .split(/[.!?\n]/)
        .filter((s) =>
          /\b(decided|agreed|approved|confirmed|resolved|will proceed|going with)\b/i.test(s),
        )
        .map((s) => s.trim())
        .filter((s) => s.length > 5),
    );

    const pendingActions: string[] = threadMessages.flatMap((m) =>
      this.extractActions(m).map((a) => a.description),
    );

    return {
      keyPoints: keyPoints.slice(0, 20),
      decisionsMade: decisionsMade.slice(0, 10),
      pendingActions: pendingActions.slice(0, 20),
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _classifyEmail(email: EmailMessage): EmailCategory {
    const text = `${email.subject} ${email.body}`.toLowerCase();

    for (const [category, signals] of Object.entries(CATEGORY_SIGNALS) as [EmailCategory, string[]][]) {
      if (category === 'other') continue;
      if (signals.some((s) => text.includes(s))) return category;
    }

    return 'other';
  }

  private _containsAny(text: string, keywords: string[]): boolean {
    return keywords.some((kw) => text.includes(kw));
  }

  /** Safely coerce an unknown object into an EmailMessage. */
  private _coerceToEmailMessage(raw: unknown): EmailMessage {
    const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      id: String(m['id'] ?? crypto.randomUUID()),
      from: String(m['from'] ?? ''),
      to: String(m['to'] ?? ''),
      subject: String(m['subject'] ?? ''),
      body: String(m['body'] ?? ''),
      threadId: m['threadId'] !== undefined ? String(m['threadId']) : undefined,
      receivedAt: m['receivedAt'] ? new Date(String(m['receivedAt'])) : new Date(0),
    };
  }
}
