/**
 * InboxService — Email Inbox Window
 *
 * Manages connected email accounts (IMAP) for an organisation:
 *   - Add / update / delete accounts (credentials encrypted at rest §5)
 *   - Fetch new messages via imapflow (incremental by UID)
 *   - Store messages in EmailMessage table (idempotent on imapUid)
 *   - Produce per-org new-email notifications (stored in Alert table)
 *   - Summarize messages via Ellinea pattern-based summarizer (no external LLM needed)
 *
 * Security:
 *   - Every query includes a mandatory organizationId filter (§6 tenant isolation)
 *   - Passwords are encrypted before write, decrypted only in-process for IMAP
 *   - Credentials are never returned in API responses
 *
 * Requirements: Email Inbox Window
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectAccountDto {
  label?: string;
  emailAddress: string;
  /** gmail | outlook | exchange | custom */
  provider: 'gmail' | 'outlook' | 'exchange' | 'custom';
  /** App password (plain — will be encrypted before persisting) */
  appPassword: string;
  /** Only for custom provider */
  customHost?: string;
  customPort?: number;
  /** full | summary */
  displayMode?: 'full' | 'summary';
  /** Polling interval in seconds (default 300) */
  pollIntervalSeconds?: number;
}

export interface UpdateAccountDto {
  label?: string;
  displayMode?: 'full' | 'summary';
  pollIntervalSeconds?: number;
  appPassword?: string; // re-encrypt on update if provided
  isActive?: boolean;
}

export interface EmailAccountSafe {
  id: string;
  label: string;
  emailAddress: string;
  provider: string;
  imapHost: string;
  imapPort: number;
  displayMode: string;
  pollIntervalSeconds: number;
  lastSyncedAt: Date | null;
  isActive: boolean;
  lastError: string | null;
  createdAt: Date;
}

export interface EmailMessageDto {
  id: string;
  accountId: string;
  subject: string;
  fromAddress: string;
  fromName: string;
  toAddresses: string[];
  bodyText: string;
  aiSummary: string | null;
  urgencyLevel: string;
  category: string;
  isRead: boolean;
  isSummarized: boolean;
  threadId: string | null;
  receivedAt: Date;
}

// ─── Provider IMAP configs ────────────────────────────────────────────────────

const IMAP_HOSTS: Record<string, { host: string; port: number }> = {
  gmail:    { host: 'imap.gmail.com',             port: 993 },
  outlook:  { host: 'imap-mail.outlook.com',       port: 993 },
  exchange: { host: 'outlook.office365.com',        port: 993 },
};

// ─── Urgency keyword sets (offline Ellinea classification) ───────────────────

const URGENCY_CRITICAL = ['urgent', 'critical', 'emergency', 'asap', 'immediate', 'breach', 'outage'];
const URGENCY_HIGH     = ['important', 'high priority', 'action required', 'deadline', 'overdue', 'alert'];
const URGENCY_MEDIUM   = ['reminder', 'follow up', 'update', 'notice', 'attention'];

const CATEGORY_SIGNALS: Record<string, string[]> = {
  internal:  ['@yourcompany', 'internal', 'team', 'department', 'colleague'],
  automated: ['no-reply', 'noreply', 'do-not-reply', 'notification@', 'automated', 'system@'],
  external:  [], // fallback
};

// ─── HTML strip helper ────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Offline summarizer ───────────────────────────────────────────────────────

function summarizeOffline(subject: string, body: string): string {
  const text = body.length > 3000 ? body.slice(0, 3000) : body;
  const sentences = text
    .split(/[.!?\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 300);

  // Score: prefer sentences with action verbs and keywords
  const actionVerbs = ['please', 'need', 'required', 'must', 'review', 'approve', 'confirm', 'update', 'send', 'complete', 'schedule'];
  const scored = sentences.map(s => ({
    s,
    score: actionVerbs.filter(v => s.toLowerCase().includes(v)).length,
  }));

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => x.s);

  if (top.length === 0) {
    return subject || 'No summary available.';
  }

  return top.join('. ') + '.';
}

function classifyUrgency(subject: string, body: string): 'critical' | 'high' | 'medium' | 'low' {
  const text = `${subject} ${body}`.toLowerCase();
  if (URGENCY_CRITICAL.some(k => text.includes(k))) return 'critical';
  if (URGENCY_HIGH.some(k => text.includes(k)))     return 'high';
  if (URGENCY_MEDIUM.some(k => text.includes(k)))   return 'medium';
  return 'low';
}

function classifyCategory(fromAddress: string, subject: string): string {
  const from = fromAddress.toLowerCase();
  const sub  = subject.toLowerCase();
  if (CATEGORY_SIGNALS.automated.some(k => from.includes(k) || sub.includes(k))) return 'automated';
  if (CATEGORY_SIGNALS.internal.some(k => from.includes(k) || sub.includes(k)))  return 'internal';
  return 'external';
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  // ── Account CRUD ──────────────────────────────────────────────────────────

  async addAccount(dto: ConnectAccountDto, orgId: string): Promise<EmailAccountSafe> {
    if (!dto.emailAddress || !dto.appPassword) {
      throw new BadRequestException('emailAddress and appPassword are required');
    }
    if (!['gmail', 'outlook', 'exchange', 'custom'].includes(dto.provider)) {
      throw new BadRequestException('provider must be gmail | outlook | exchange | custom');
    }
    if (dto.provider === 'custom' && !dto.customHost) {
      throw new BadRequestException('customHost is required for custom provider');
    }

    // Resolve IMAP host
    const { host: imapHost, port: imapPort } = dto.provider === 'custom'
      ? { host: dto.customHost!, port: dto.customPort ?? 993 }
      : IMAP_HOSTS[dto.provider];

    // Encrypt password before persisting (§5)
    const encryptedPassword = await this.encryption.encrypt(dto.appPassword, orgId);

    const account = await this.prisma.emailAccount.create({
      data: {
        organizationId:    orgId,
        label:             dto.label ?? dto.emailAddress,
        emailAddress:      dto.emailAddress,
        provider:          dto.provider,
        imapHost,
        imapPort,
        encryptedPassword,
        displayMode:       dto.displayMode ?? 'summary',
        pollIntervalSeconds: dto.pollIntervalSeconds ?? 300,
        isActive:          true,
      },
    });

    return this._toSafe(account);
  }

  async listAccounts(orgId: string): Promise<EmailAccountSafe[]> {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { organizationId: orgId }, // §6 tenant isolation
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map(a => this._toSafe(a));
  }

  async getAccount(id: string, orgId: string): Promise<EmailAccountSafe> {
    const account = await this.prisma.emailAccount.findFirst({
      where: { id, organizationId: orgId }, // §6
    });
    if (!account) throw new NotFoundException(`Email account ${id} not found`);
    return this._toSafe(account);
  }

  async updateAccount(id: string, dto: UpdateAccountDto, orgId: string): Promise<EmailAccountSafe> {
    const existing = await this.prisma.emailAccount.findFirst({
      where: { id, organizationId: orgId }, // §6
    });
    if (!existing) throw new NotFoundException(`Email account ${id} not found`);

    const updateData: Record<string, unknown> = {};
    if (dto.label             !== undefined) updateData.label             = dto.label;
    if (dto.displayMode       !== undefined) updateData.displayMode       = dto.displayMode;
    if (dto.pollIntervalSeconds !== undefined) updateData.pollIntervalSeconds = dto.pollIntervalSeconds;
    if (dto.isActive          !== undefined) updateData.isActive          = dto.isActive;
    if (dto.appPassword) {
      updateData.encryptedPassword = await this.encryption.encrypt(dto.appPassword, orgId);
    }

    const updated = await this.prisma.emailAccount.update({
      where: { id },
      data: updateData,
    });
    return this._toSafe(updated);
  }

  async deleteAccount(id: string, orgId: string): Promise<void> {
    const existing = await this.prisma.emailAccount.findFirst({
      where: { id, organizationId: orgId }, // §6
    });
    if (!existing) throw new NotFoundException(`Email account ${id} not found`);
    await this.prisma.emailAccount.delete({ where: { id } });
  }

  // ── Test connection ───────────────────────────────────────────────────────

  async testAccount(id: string, orgId: string): Promise<{ ok: boolean; error?: string }> {
    const account = await this.prisma.emailAccount.findFirst({
      where: { id, organizationId: orgId }, // §6
    });
    if (!account) throw new NotFoundException(`Email account ${id} not found`);

    const password = await this.encryption.decrypt(account.encryptedPassword, orgId);
    const client = new ImapFlow({
      host:   account.imapHost,
      port:   account.imapPort,
      secure: account.useTls,
      auth:   { user: account.emailAddress, pass: password },
      logger: false,
    });

    try {
      await client.connect();
      await client.logout();
      await this.prisma.emailAccount.update({
        where: { id },
        data:  { lastError: null },
      });
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.emailAccount.update({
        where: { id },
        data:  { lastError: msg },
      });
      return { ok: false, error: msg };
    }
  }

  // ── Message queries ───────────────────────────────────────────────────────

  async listMessages(
    orgId: string,
    opts: {
      accountId?: string;
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ messages: EmailMessageDto[]; total: number }> {
    const where: Record<string, unknown> = {
      organizationId: orgId, // §6
    };
    if (opts.accountId) where.accountId = opts.accountId;
    if (opts.unreadOnly) where.isRead = false;

    const [messages, total] = await Promise.all([
      this.prisma.emailMessage.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take:  opts.limit  ?? 50,
        skip:  opts.offset ?? 0,
      }),
      this.prisma.emailMessage.count({ where }),
    ]);

    return { messages: messages.map(m => this._toMessageDto(m)), total };
  }

  async getMessage(id: string, orgId: string): Promise<EmailMessageDto> {
    const msg = await this.prisma.emailMessage.findFirst({
      where: { id, organizationId: orgId }, // §6
    });
    if (!msg) throw new NotFoundException(`Message ${id} not found`);

    // Mark as read
    if (!msg.isRead) {
      await this.prisma.emailMessage.update({ where: { id }, data: { isRead: true } });
    }

    return this._toMessageDto({ ...msg, isRead: true });
  }

  async markRead(id: string, orgId: string): Promise<void> {
    const msg = await this.prisma.emailMessage.findFirst({
      where: { id, organizationId: orgId }, // §6
    });
    if (!msg) throw new NotFoundException(`Message ${id} not found`);
    await this.prisma.emailMessage.update({ where: { id }, data: { isRead: true } });
  }

  // ── Ellinea summary ───────────────────────────────────────────────────────

  /**
   * Generate and cache an Ellinea summary for a single message.
   * Uses offline keyword-based summarizer — no external LLM call required.
   */
  async summarizeMessage(id: string, orgId: string): Promise<{ summary: string }> {
    const msg = await this.prisma.emailMessage.findFirst({
      where: { id, organizationId: orgId }, // §6
    });
    if (!msg) throw new NotFoundException(`Message ${id} not found`);

    // Return cached summary if already generated
    if (msg.isSummarized && msg.aiSummary) {
      return { summary: msg.aiSummary };
    }

    const summary = summarizeOffline(msg.subject, msg.bodyText);

    await this.prisma.emailMessage.update({
      where: { id },
      data:  { aiSummary: summary, isSummarized: true },
    });

    return { summary };
  }

  // ── IMAP sync ─────────────────────────────────────────────────────────────

  /**
   * Sync one account: connect IMAP, fetch messages newer than lastUid,
   * upsert into EmailMessage, update lastSyncedAt.
   *
   * Returns count of new messages fetched.
   */
  async syncAccount(accountId: string, orgId: string): Promise<number> {
    const account = await this.prisma.emailAccount.findFirst({
      where: { id: accountId, organizationId: orgId, isActive: true }, // §6
    });
    if (!account) throw new NotFoundException(`Active email account ${accountId} not found`);

    let password: string;
    try {
      password = await this.encryption.decrypt(account.encryptedPassword, orgId);
    } catch {
      await this.prisma.emailAccount.update({
        where: { id: accountId },
        data:  { lastError: 'Failed to decrypt stored password' },
      });
      return 0;
    }

    const client = new ImapFlow({
      host:   account.imapHost,
      port:   account.imapPort,
      secure: account.useTls,
      auth:   { user: account.emailAddress, pass: password },
      logger: false,
    });

    let fetched = 0;

    try {
      await client.connect();

      const lock = await client.getMailboxLock('INBOX');
      try {
        // Incremental: fetch UIDs > lastUid; or unread messages on first sync
        const searchCriteria = account.lastUid > 0
          ? { uid: `${account.lastUid + 1}:*` as string }
          : { seen: false };

        const uids: number[] = [];
        for await (const msg of client.fetch(searchCriteria, {
          uid: true, envelope: true, source: true,
        })) {
          uids.push(msg.uid);
          const envelope  = msg.envelope;
          const subject   = envelope?.subject ?? '(no subject)';
          const fromAddr  = envelope?.from?.[0]?.address ?? '';
          const fromName  = envelope?.from?.[0]?.name   ?? '';
          const toArr     = (envelope?.to ?? []).map((a: { address?: string }) => a.address ?? '').filter(Boolean);
          const receivedAt = envelope?.date ?? new Date();

          // Parse body — imapflow provides source as Buffer
          let bodyText = '';
          try {
            const raw = msg.source?.toString('utf8') ?? '';
            // Very basic: strip headers (everything before first blank line), then strip HTML
            const bodyStart = raw.indexOf('\r\n\r\n');
            const rawBody = bodyStart > -1 ? raw.slice(bodyStart + 4) : raw;
            bodyText = stripHtml(rawBody).slice(0, 10000); // cap at 10 KB
          } catch {
            bodyText = '';
          }

          const urgencyLevel = classifyUrgency(subject, bodyText);
          const category     = classifyCategory(fromAddr, subject);
          const aiSummary    = account.displayMode === 'summary'
            ? summarizeOffline(subject, bodyText)
            : null;

          // Idempotent upsert on (accountId, imapUid)
          await this.prisma.emailMessage.upsert({
            where:  { accountId_imapUid: { accountId, imapUid: msg.uid } },
            create: {
              accountId,
              organizationId: orgId,
              imapUid:     msg.uid,
              subject,
              fromAddress: fromAddr,
              fromName,
              toAddresses: toArr,
              bodyText,
              aiSummary,
              urgencyLevel,
              category,
              isSummarized: aiSummary !== null,
              receivedAt,
            },
            update: {}, // don't overwrite existing messages (preserve isRead / aiSummary)
          });
          fetched++;
        }

        // Update lastUid to highest seen
        if (uids.length > 0) {
          const maxUid = Math.max(...uids);
          await this.prisma.emailAccount.update({
            where: { id: accountId },
            data:  {
              lastUid:     maxUid,
              lastSyncedAt: new Date(),
              lastError:   null,
            },
          });
        } else {
          // Still update lastSyncedAt so the next poll knows we checked
          await this.prisma.emailAccount.update({
            where: { id: accountId },
            data:  { lastSyncedAt: new Date() },
          });
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[InboxService] syncAccount ${accountId} failed: ${msg}`);
      await this.prisma.emailAccount.update({
        where: { id: accountId },
        data:  { lastError: msg },
      }).catch(() => {/* non-critical */});
    }

    return fetched;
  }

  /**
   * Sync all active accounts for an org.
   * Returns total new messages across all accounts.
   */
  async syncAllAccounts(orgId: string): Promise<{ synced: number; newMessages: number }> {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { organizationId: orgId, isActive: true }, // §6
    });

    let newMessages = 0;
    for (const account of accounts) {
      try {
        newMessages += await this.syncAccount(account.id, orgId);
      } catch (err) {
        this.logger.warn(`[InboxService] syncAllAccounts: account ${account.id} failed`, err);
      }
    }

    // Create an Alert notification if new messages arrived
    if (newMessages > 0) {
      await this._createNewEmailAlert(orgId, newMessages);
    }

    return { synced: accounts.length, newMessages };
  }

  /**
   * Trigger sync for accounts whose poll interval has elapsed.
   * Called by InboxPollerService on a schedule.
   */
  async syncDueAccounts(): Promise<void> {
    const now = new Date();

    // Find active accounts where either never synced or sync is overdue
    const accounts = await this.prisma.emailAccount.findMany({
      where: {
        isActive: true,
        OR: [
          { lastSyncedAt: null },
          // lastSyncedAt + pollIntervalSeconds <= now
          // We implement this as: lastSyncedAt <= now - pollIntervalSeconds
          // Prisma doesn't support column arithmetic, so fetch all and filter in memory
        ],
      },
    });

    const due = accounts.filter(a => {
      if (!a.lastSyncedAt) return true;
      const nextSync = new Date(a.lastSyncedAt.getTime() + a.pollIntervalSeconds * 1000);
      return nextSync <= now;
    });

    const orgGroups = new Map<string, string[]>();
    for (const a of due) {
      const list = orgGroups.get(a.organizationId) ?? [];
      list.push(a.id);
      orgGroups.set(a.organizationId, list);
    }

    for (const [orgId, accountIds] of orgGroups) {
      let newMessages = 0;
      for (const accountId of accountIds) {
        try {
          newMessages += await this.syncAccount(accountId, orgId);
        } catch (err) {
          this.logger.warn(`[InboxService] syncDueAccounts: account ${accountId} failed`, err);
        }
      }
      if (newMessages > 0) {
        await this._createNewEmailAlert(orgId, newMessages);
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _toSafe(a: {
    id: string; label: string; emailAddress: string; provider: string;
    imapHost: string; imapPort: number; displayMode: string;
    pollIntervalSeconds: number; lastSyncedAt: Date | null;
    isActive: boolean; lastError: string | null; createdAt: Date;
  }): EmailAccountSafe {
    return {
      id:                  a.id,
      label:               a.label,
      emailAddress:        a.emailAddress,
      provider:            a.provider,
      imapHost:            a.imapHost,
      imapPort:            a.imapPort,
      displayMode:         a.displayMode,
      pollIntervalSeconds: a.pollIntervalSeconds,
      lastSyncedAt:        a.lastSyncedAt,
      isActive:            a.isActive,
      lastError:           a.lastError,
      createdAt:           a.createdAt,
      // NOTE: encryptedPassword intentionally excluded (§6 — never returned in API)
    };
  }

  private _toMessageDto(m: {
    id: string; accountId: string; subject: string; fromAddress: string;
    fromName: string; toAddresses: string[]; bodyText: string;
    aiSummary: string | null; urgencyLevel: string; category: string;
    isRead: boolean; isSummarized: boolean; threadId: string | null; receivedAt: Date;
  }): EmailMessageDto {
    return {
      id:           m.id,
      accountId:    m.accountId,
      subject:      m.subject,
      fromAddress:  m.fromAddress,
      fromName:     m.fromName,
      toAddresses:  m.toAddresses,
      bodyText:     m.bodyText,
      aiSummary:    m.aiSummary,
      urgencyLevel: m.urgencyLevel,
      category:     m.category,
      isRead:       m.isRead,
      isSummarized: m.isSummarized,
      threadId:     m.threadId,
      receivedAt:   m.receivedAt,
    };
  }

  /**
   * Creates an AuditLog entry that serves as an inbox notification.
   * The frontend polls /api/v1/orgs/me/audit-logs (or equivalent) and the
   * email inbox widget can surface new-email counts.
   *
   * No external call — just a DB write.
   */
  private async _createNewEmailAlert(orgId: string, count: number): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: orgId,
          userId:   null,
          action:   'email.inbox.new_messages',
          resource: 'email_inbox',
          metadata:  {
            count,
            message: `${count} new email${count === 1 ? '' : 's'} fetched by Ellinea`,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (err) {
      // Non-critical
      this.logger.warn('[InboxService] Failed to create new-email audit log', err);
    }
  }
}
