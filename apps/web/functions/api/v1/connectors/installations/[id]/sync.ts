import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../../shared/auth';
import demoSeed from '../../../../../shared/demo-enterprise.json';
import restSample from '../../../../../shared/rest-enterprise-sample.json';
import {
  buildAuthHeaders,
  normalizeEnterprisePayload,
  parseCsvToEnterprisePayload,
  parseOpenApiDocument,
  syncOpenApiRoutes,
  toTimelineStorage,
  withScheduleAfterSync,
  type InstallConfig,
} from '../../../../../shared/connectors';
import { isOrganizationSuspended } from '@ellines-eip/shared';

// ─── IMAP sync via Cloudflare TCP sockets ─────────────────────────────────────

type SocketLike = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  opened: Promise<unknown>;
  close: () => void;
  startTls?: () => void;
};

async function openSocket(host: string, port: number, secure: boolean): Promise<SocketLike> {
  const mod = (await import('cloudflare:sockets')) as {
    connect: (opts: { hostname: string; port: number; secureTransport?: 'on' | 'starttls' | 'off' }) => SocketLike;
  };
  return mod.connect({ hostname: host, port, secureTransport: secure ? 'on' : 'starttls' });
}

/**
 * Minimal IMAP client: authenticate, fetch recent message summaries, quit.
 * Returns plain-text subjects/from/dates for up to `limit` messages.
 */
async function fetchImapMessages(config: InstallConfig, limit = 30): Promise<{
  subject: string;
  from: string;
  date: string;
  preview: string;
}[]> {
  const host = (config.imapHost || '').trim();
  const port = Number(config.imapPort) || 993;
  const user = (config.imapUser || '').trim();
  const pass = (config.imapPassword || '').trim();
  const mailbox = (config.imapMailbox || 'INBOX').trim();
  const secure = config.imapSecure !== false; // default TLS

  if (!host || !user || !pass) throw new Error('IMAP host, user, and password are required for sync');

  const socket = await openSocket(host, port, secure);
  await socket.opened;

  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const decoder = new TextDecoder();
  let buf = '';

  async function readLine(): Promise<string> {
    while (!buf.includes('\n')) {
      const { value, done } = await reader.read();
      if (done) throw new Error('IMAP connection closed unexpectedly');
      buf += decoder.decode(value, { stream: true });
    }
    const nl = buf.indexOf('\n');
    const line = buf.slice(0, nl).replace(/\r$/, '');
    buf = buf.slice(nl + 1);
    return line;
  }

  async function readUntilTag(tag: string): Promise<string[]> {
    const lines: string[] = [];
    while (true) {
      const line = await readLine();
      lines.push(line);
      if (line.startsWith(tag + ' ')) break;
      // Also break on untagged 'BYE' to avoid hang
      if (line.startsWith('* BYE')) break;
    }
    return lines;
  }

  async function cmd(tag: string, command: string): Promise<string[]> {
    await writer.write(new TextEncoder().encode(`${tag} ${command}\r\n`));
    return readUntilTag(tag);
  }

  try {
    // Wait for server greeting
    await readLine();

    // STARTTLS if not secure
    if (!secure && typeof socket.startTls === 'function') {
      await cmd('A0', 'STARTTLS');
      socket.startTls();
    }

    // LOGIN
    const loginResp = await cmd('A1', `LOGIN "${user.replace(/"/g, '\\"')}" "${pass.replace(/"/g, '\\"')}"`);
    const loginOk = loginResp.some((l) => l.startsWith('A1 OK'));
    if (!loginOk) throw new Error('IMAP LOGIN failed — check credentials');

    // SELECT mailbox
    const selectResp = await cmd('A2', `SELECT "${mailbox}"`);
    const existsLine = selectResp.find((l) => /^\* \d+ EXISTS/.test(l));
    const total = existsLine ? parseInt(existsLine.split(' ')[1], 10) : 0;

    const messages: { subject: string; from: string; date: string; preview: string }[] = [];

    if (total > 0) {
      // Fetch the last `limit` message headers
      const start = Math.max(1, total - limit + 1);
      const fetchResp = await cmd('A3', `FETCH ${start}:${total} (ENVELOPE)`);

      // Parse ENVELOPE responses: * N FETCH (ENVELOPE (...))
      for (const line of fetchResp) {
        if (!line.startsWith('* ') || !line.includes('ENVELOPE')) continue;
        try {
          const env = parseImapEnvelope(line);
          if (env) messages.push(env);
        } catch {
          // skip unparseable lines
        }
      }
    }

    // LOGOUT
    await cmd('A4', 'LOGOUT').catch(() => {/* ignore */});
    socket.close();

    return messages.reverse(); // newest first
  } catch (err) {
    try { socket.close(); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Very lightweight IMAP ENVELOPE parser.
 * ENVELOPE format: (date subject from sender reply-to to cc bcc in-reply-to message-id)
 * Each field is either NIL or a quoted string or a nested list.
 */
function parseImapEnvelope(line: string): { subject: string; from: string; date: string; preview: string } | null {
  // Extract the ENVELOPE (...) portion
  const envStart = line.indexOf('(ENVELOPE (');
  if (envStart === -1) return null;
  const envSection = line.slice(envStart + 10); // starts at first (

  // Tokenize
  function readToken(s: string, pos: number): { value: string | null; end: number } {
    while (pos < s.length && s[pos] === ' ') pos++;
    if (pos >= s.length) return { value: null, end: pos };
    if (s[pos] === '"') {
      // Quoted string
      let out = '';
      pos++;
      while (pos < s.length && s[pos] !== '"') {
        if (s[pos] === '\\') { pos++; }
        out += s[pos++];
      }
      return { value: out, end: pos + 1 };
    }
    if (s.slice(pos, pos + 3).toUpperCase() === 'NIL') {
      return { value: null, end: pos + 3 };
    }
    if (s[pos] === '(') {
      // Nested list — find matching close paren
      let depth = 0; let start = pos;
      while (pos < s.length) {
        if (s[pos] === '(') depth++;
        else if (s[pos] === ')') { depth--; if (depth === 0) break; }
        else if (s[pos] === '"') { pos++; while (pos < s.length && s[pos] !== '"') { if (s[pos] === '\\') pos++; pos++; } }
        pos++;
      }
      return { value: s.slice(start, pos + 1), end: pos + 1 };
    }
    // Literal or atom
    let end = pos;
    while (end < s.length && s[end] !== ' ' && s[end] !== ')' && s[end] !== '(') end++;
    return { value: s.slice(pos, end), end };
  }

  // Skip opening '('
  let pos = envSection.indexOf('(');
  if (pos === -1) return null;
  pos++;

  const fields: (string | null)[] = [];
  for (let i = 0; i < 10; i++) {
    const tok = readToken(envSection, pos);
    fields.push(tok.value);
    pos = tok.end;
  }

  const [dateRaw, subjectRaw, fromRaw] = fields;

  const subject = decodeImapText(subjectRaw || '(no subject)');
  const date = dateRaw || new Date().toISOString();

  // Parse FROM list: ((name NIL mailbox host))
  let from = '';
  if (fromRaw && fromRaw.startsWith('((')) {
    const inner = fromRaw.slice(2, -2);
    let fPos = 0;
    const nameTok = readToken(inner, fPos);
    fPos = nameTok.end;
    readToken(inner, fPos); // at-domain
    const atEnd = readToken(inner, fPos);
    fPos = atEnd.end;
    const mboxTok = readToken(inner, fPos);
    fPos = mboxTok.end;
    const hostTok = readToken(inner, fPos);
    const mbox = mboxTok.value || '';
    const host = hostTok.value || '';
    const name = decodeImapText(nameTok.value || '');
    from = name ? `${name} <${mbox}@${host}>` : `${mbox}@${host}`;
  }

  return {
    subject,
    from: from || 'Unknown sender',
    date,
    preview: subject,
  };
}

function decodeImapText(text: string): string {
  if (!text) return '';
  // Decode RFC 2047 encoded words: =?charset?encoding?text?=
  return text.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _charset, enc, encoded) => {
    try {
      if (enc.toUpperCase() === 'B') {
        return atob(encoded);
      } else {
        // Q encoding: replace _ with space, decode quoted-printable
        return encoded.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m: string, h: string) =>
          String.fromCharCode(parseInt(h, 16)),
        );
      }
    } catch {
      return encoded;
    }
  });
}

const CSV_SAMPLE = `metric,value
healthScore,81
connectedSystems,4
openAlerts,1
openDecisions,3
briefHighlight,"Branch ops CSV export — no vendor API; file landed from nightly ERP dump."
`;

async function upsertSnapshot(
  env: Env,
  organizationId: string,
  actorUserId: string,
  connectorId: string,
  connectorName: string,
  payload: ReturnType<typeof normalizeEnterprisePayload>,
) {
  const syncedAt = new Date().toISOString();
  const supabase = getAdminClient(env);
  const packedTimeline = toTimelineStorage(payload);
  const row = {
    id: crypto.randomUUID(),
    organization_id: organizationId,
    connector_id: connectorId,
    connector_name: connectorName,
    health_score: payload.healthScore,
    connected_systems: payload.connectedSystems,
    open_alerts: payload.openAlerts,
    open_decisions: payload.openDecisions,
    brief_highlight: payload.briefHighlight,
    timeline: packedTimeline,
    synced_at: syncedAt,
    created_at: syncedAt,
    updated_at: syncedAt,
  };

  const { data: existing } = await supabase
    .from('enterprise_snapshots')
    .select('id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  let error;
  if (existing?.id) {
    ({ error } = await supabase
      .from('enterprise_snapshots')
      .update({
        connector_id: row.connector_id,
        connector_name: row.connector_name,
        health_score: row.health_score,
        connected_systems: row.connected_systems,
        open_alerts: row.open_alerts,
        open_decisions: row.open_decisions,
        brief_highlight: row.brief_highlight,
        timeline: row.timeline,
        synced_at: syncedAt,
        updated_at: syncedAt,
      })
      .eq('id', existing.id));
  } else {
    ({ error } = await supabase.from('enterprise_snapshots').insert(row));
  }
  if (error) throw new Error(`enterprise_snapshots write failed: ${error.message} (code: ${error.code})`);

  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: organizationId,
    user_id: actorUserId,
    action: 'connector.sync',
    resource: 'enterprise_snapshot',
    metadata: { connectorId },
  });

  return {
    organizationId,
    connectorId,
    connectorName,
    healthScore: payload.healthScore,
    connectedSystems: payload.connectedSystems,
    openAlerts: payload.openAlerts,
    openDecisions: payload.openDecisions,
    briefHighlight: payload.briefHighlight,
    timeline: payload.timeline,
    model: payload.model || null,
    syncedAt,
    status: 'synced' as const,
  };
}

function resolveEndpoint(requestUrl: string, endpoint?: string): string {
  const origin = new URL(requestUrl).origin;
  const raw = (endpoint || '/api/v1/connectors/rest-sample').trim();
  if (raw.startsWith('/')) return `${origin}${raw}`;
  return raw;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // connector:sync permission required
  const permErr = await requirePermissionAsync(
    context.env,
    auth.sub,
    auth.organizationId,
    auth.role,
    'connector:sync',
  );
  if (permErr) return permErr;

  const id = context.params.id as string;
  const supabase = getAdminClient(context.env);

  const { data: orgRow } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (isOrganizationSuspended(orgRow?.settings)) {
    return json({ statusCode: 403, message: 'Organization is suspended' }, 403);
  }

  const { data: existing } = await supabase
    .from('connector_installations')
    .select('*')
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();
  if (!existing) return json({ statusCode: 404, message: 'Installation not found' }, 404);

  const config = (existing.config || {}) as InstallConfig;
  const catalogId = existing.catalog_id as string;
  const displayName = existing.display_name as string;

  try {
    let summary;
    if (catalogId === 'demo-json') {
      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'demo-json',
        displayName || 'Demo JSON Systems',
        normalizeEnterprisePayload(demoSeed),
      );
    } else if (catalogId === 'rest-api') {
      const endpoint = resolveEndpoint(context.request.url, config.endpoint);
      const isSample =
        endpoint.includes('/api/v1/connectors/rest-sample') ||
        endpoint.endsWith('/connectors/rest-sample');
      let raw: unknown = restSample;
      if (!isSample) {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: { Accept: 'application/json', ...buildAuthHeaders(config) },
        });
        if (!res.ok) {
          return json(
            { statusCode: 502, message: `REST endpoint returned ${res.status}` },
            502,
          );
        }
        raw = await res.json();
      }
      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'rest-api',
        displayName || 'REST API Systems',
        normalizeEnterprisePayload(raw),
      );
    } else if (catalogId === 'openapi') {
      let baseUrl = (config.openApiBaseUrl || '').trim();
      let systemName = displayName || config.systemName || 'OpenAPI System';
      if (config.openApiDocument) {
        const parsed = parseOpenApiDocument(config.openApiDocument);
        if (!baseUrl) baseUrl = parsed.baseUrl;
        systemName = displayName || config.systemName || parsed.title;
      }
      const routes = config.selectedRoutes?.length
        ? config.selectedRoutes
        : config.openApiDocument
          ? parseOpenApiDocument(config.openApiDocument)
              .endpoints.filter((e) => e.selectable)
              .slice(0, 5)
              .map((e) => ({
                method: e.method,
                path: e.path,
                capability: e.capability,
              }))
          : [];
      const payload = await syncOpenApiRoutes({
        baseUrl,
        routes,
        headers: buildAuthHeaders(config),
        systemName,
      });
      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'openapi',
        systemName,
        payload,
      );
    } else if (catalogId === 'csv-file') {
      const csvText = (config.csvText && config.csvText.trim()) || CSV_SAMPLE;
      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'csv-file',
        displayName || 'CSV / File Import',
        parseCsvToEnterprisePayload(csvText),
      );
    } else if (catalogId === 'email-imap') {
      // Real IMAP sync via Cloudflare TCP sockets
      if (!config.imapHost?.trim() || !config.imapUser?.trim() || !config.imapPassword?.trim()) {
        return json(
          { statusCode: 400, message: 'IMAP host, user, and password are required to sync. Edit the connector and provide credentials.' },
          400,
        );
      }
      const messages = await fetchImapMessages(config, 50);
      const timeline = messages.slice(0, 12).map((m) => ({
        title: m.subject,
        detail: m.from ? `From: ${m.from} · ${m.date}` : m.date,
      }));
      const urgentCount = messages.filter((m) =>
        /urgent|critical|asap|action required|alert|escalat|overdue|deadline/i.test(m.subject),
      ).length;
      const reportCount = messages.filter((m) =>
        /report|statement|invoice|ledger|analytics|export|sales|stock|inventory|finance|revenue/i.test(m.subject),
      ).length;
      const briefHighlight =
        messages.length === 0
          ? 'IMAP mailbox is empty or no messages found.'
          : urgentCount > 0
            ? `${messages.length} messages synced — ${urgentCount} urgent. Top: "${messages[0].subject}"`
            : `${messages.length} messages synced from ${config.imapUser}. Latest: "${messages[0]?.subject || 'n/a'}"`;

      const imapPayload = normalizeEnterprisePayload({
        healthScore: urgentCount > 0 ? Math.max(20, 80 - urgentCount * 5) : 85,
        connectedSystems: 1,
        openAlerts: urgentCount,
        openDecisions: reportCount,
        briefHighlight,
        systemName: displayName || config.imapUser,
        timeline,
      });
      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'email-imap',
        displayName || `Email (${config.imapUser})`,
        imapPayload,
      );
    } else if (
      catalogId === 'postgres' ||
      catalogId === 'sqlserver' ||
      catalogId === 'mysql' ||
      catalogId === 'sftp'
    ) {
      return json(
        {
          statusCode: 501,
          message:
            `${catalogId} sync requires the Identity API (Nest/TCP). Config is saved — point NEXT_PUBLIC_API_URL at Nest Identity, or use CSV/REST/OpenAPI on Pages.`,
        },
        501,
      );
    } else {
      return json({ statusCode: 404, message: 'Unknown connector' }, 404);
    }

    const now = new Date().toISOString();
    const nextConfig = withScheduleAfterSync(config, new Date(now));
    await supabase
      .from('connector_installations')
      .update({
        status: 'synced',
        last_synced_at: now,
        last_message: `Synced — health ${summary.healthScore}`,
        config: nextConfig,
        updated_at: now,
      })
      .eq('id', id);

    return json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    // Mark installation as error so the UI shows a clear status
    await supabase
      .from('connector_installations')
      .update({
        status: 'error',
        last_message: msg.slice(0, 300),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', auth.organizationId);
    return json(
      { statusCode: 500, message: msg },
      500,
    );
  }
};
