/** Email (IMAP) — ingest mailed reports when the prime system has no API. */

export type ImapConnectorConfig = {
  host: string;
  port?: number;
  user: string;
  password: string;
  mailbox?: string;
  secure?: boolean;
  /** Max messages to read (newest first). */
  limit?: number;
};

export type ImapMessageSummary = {
  subject: string;
  from: string;
  date: string;
  snippet: string;
};

export function emailsToEnterprisePayload(
  messages: ImapMessageSummary[],
  systemName = 'Email (IMAP)',
) {
  const timeline = messages.slice(0, 12).map((m) => ({
    title: m.subject || '(no subject)',
    detail: [m.from, m.date, m.snippet].filter(Boolean).join(' · ').slice(0, 240),
  }));

  const openAlerts = messages.filter((m) =>
    /alert|urgent|critical|incident|fail/i.test(`${m.subject} ${m.snippet}`),
  ).length;

  return {
    healthScore: messages.length ? Math.min(100, 55 + Math.min(40, messages.length * 2)) : 40,
    connectedSystems: 1,
    openAlerts,
    openDecisions: Math.max(0, Math.min(5, Math.floor(openAlerts / 2))),
    briefHighlight: messages[0]
      ? `${systemName}: latest — ${messages[0].subject || '(no subject)'}`
      : `${systemName}: mailbox empty or no recent mail.`,
    timeline: timeline.length
      ? timeline
      : [
          {
            title: 'Email / IMAP sync',
            detail: 'Connected mailbox — no recent messages to surface.',
          },
        ],
  };
}

/**
 * IMAP connector — `fetchMail` is injected so Workers never need a TCP IMAP client.
 * Identity uses imapflow; Pages saves config and syncs via Nest when available.
 */
export function createImapConnector(options: {
  config: ImapConnectorConfig;
  fetchMail: (config: ImapConnectorConfig) => Promise<ImapMessageSummary[]>;
  connectorName?: string;
}) {
  let config = options.config;
  const name = options.connectorName || 'Email (IMAP)';

  return {
    id: 'email-imap' as const,
    name,
    version: '0.1.0',
    type: 'email' as const,
    async configure(next: Partial<ImapConnectorConfig>) {
      config = { ...config, ...next };
    },
    async testConnection() {
      if (!config.host?.trim() || !config.user?.trim() || !config.password) {
        throw new Error('IMAP host, user, and password are required');
      }
      const rows = await options.fetchMail({ ...config, limit: 1 });
      return Array.isArray(rows);
    },
    async sync() {
      try {
        const messages = await options.fetchMail({
          ...config,
          limit: config.limit ?? 20,
        });
        const payload = emailsToEnterprisePayload(messages, name);
        return {
          ok: true as const,
          summary: {
            connectorId: 'email-imap',
            connectorName: name,
            ...payload,
            syncedAt: new Date().toISOString(),
          },
          message: `Synced ${messages.length} message(s) from IMAP`,
        };
      } catch (err) {
        return {
          ok: false as const,
          summary: {
            connectorId: 'email-imap',
            connectorName: name,
            healthScore: 0,
            connectedSystems: 0,
            openAlerts: 0,
            openDecisions: 0,
            briefHighlight: '',
            timeline: [] as { title: string; detail: string }[],
          },
          message: err instanceof Error ? err.message : 'IMAP sync failed',
        };
      }
    },
    async disconnect() {},
  };
}
