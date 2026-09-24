import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../../shared/auth';
import { isSafeEgressTarget, safeFetch, SsrfError, isSafeTcpHost, isSafeTcpPort } from '../../../../../shared/egress';
import demoSeed from '../../../../../shared/demo-enterprise.json';
import restSample from '../../../../../shared/rest-enterprise-sample.json';
import {
  buildAuthHeaders,
  decryptConnectorConfig,
  normalizeEnterprisePayload,
  parseCsvToEnterprisePayload,
  parseOpenApiDocument,
  syncOpenApiRoutes,
  toTimelineStorage,
  withScheduleAfterSync,
  appendDateWindowToUrl,
  applyFieldMap,
  type InstallConfig,
} from '../../../../../shared/connectors';
import { isOrganizationSuspended, mergeUemModels } from '@ellines-eip/shared';
import {
  isFirestoreResponse,
  normalizeFirestoreResponse,
} from '../../../../../shared/firestore-normalizer';

// ─── IMAP sync via Cloudflare TCP sockets ─────────────────────────────────────

type SocketLike = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  opened: Promise<unknown>;
  close: () => void;
  startTls?: () => void;
};

async function openSocket(host: string, port: number, secure: boolean): Promise<SocketLike> {
  try {
    const mod = (await import('cloudflare:sockets')) as {
      connect: (opts: { hostname: string; port: number; secureTransport?: 'on' | 'starttls' | 'off' }) => SocketLike;
    };
    return mod.connect({ hostname: host, port, secureTransport: secure ? 'on' : 'starttls' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Failed to connect to ${host}:${port} (secure=${secure}): ${msg}`);
  }
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

  // Egress policy for TCP hosts (same private-range rules, no URL parsing needed)
  const hostCheck = isSafeTcpHost(host);
  if (!hostCheck.safe) {
    throw new SsrfError(hostCheck.reason ?? 'IMAP host blocked by egress policy', host);
  }
  const portCheck = isSafeTcpPort(port);
  if (!portCheck.safe) {
    throw new SsrfError(portCheck.reason ?? 'IMAP port blocked by egress policy', `${host}:${port}`);
  }

  // Check if cloudflare:sockets is available
  let mod: { connect: (opts: any) => SocketLike } | null = null;
  try {
    mod = (await import('cloudflare:sockets')) as any;
  } catch {
    throw new Error(
      `cloudflare:sockets module not available. This may happen on Cloudflare Pages. ` +
      `Alternative: use REST API connector or upload sample emails as CSV/JSON.`
    );
  }

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

type StoredPayload = {
  healthScore?: number;
  connectedSystems?: number;
  openAlerts?: number;
  openDecisions?: number;
  briefHighlight?: string;
  timeline?: { title: string; detail: string }[];
  model?: import('@ellines-eip/shared').UemModel | null;
};

/**
 * Persist this one connector's payload on its installation row, then
 * recompute the org's single EnterpriseSnapshot as the aggregate across
 * every connected system — so a business with several different APIs/DBs
 * connected at once sees a combined view, not just whichever synced last.
 */
async function upsertSnapshot(
  env: Env,
  organizationId: string,
  actorUserId: string,
  installationId: string,
  connectorId: string,
  connectorName: string,
  payload: ReturnType<typeof normalizeEnterprisePayload>,
) {
  const syncedAt = new Date().toISOString();
  const supabase = getAdminClient(env);

  const ownPayload: StoredPayload = { ...payload };
  await supabase
    .from('connector_installations')
    .update({ last_payload: ownPayload })
    .eq('id', installationId);

  const { data: installs } = await supabase
    .from('connector_installations')
    .select('id, display_name, last_payload')
    .eq('organization_id', organizationId)
    .eq('status', 'synced');

  const rows = (installs || []) as Array<{ id: string; display_name: string; last_payload: StoredPayload | null }>;
  // Include this connector's fresh payload even if its own status row hasn't flipped to 'synced' yet.
  const byId = new Map(rows.map((r) => [r.id, r]));
  byId.set(installationId, { id: installationId, display_name: connectorName, last_payload: ownPayload });
  const merged = Array.from(byId.values()).filter((r) => r.last_payload);

  let weightedHealth = 0;
  let totalWeight = 0;
  let connectedSystems = 0;
  let openAlerts = 0;
  let openDecisions = 0;
  let bestHighlight = '';
  let bestAlerts = -1;
  const names: string[] = [];
  const timeline: { title: string; detail: string }[] = [];
  const models: (import('@ellines-eip/shared').UemModel | null)[] = [];

  for (const inst of merged) {
    const p = inst.last_payload as StoredPayload;
    const weight = Math.max(1, p.connectedSystems || 1);
    weightedHealth += (p.healthScore || 0) * weight;
    totalWeight += weight;
    connectedSystems += p.connectedSystems || 0;
    openAlerts += p.openAlerts || 0;
    openDecisions += p.openDecisions || 0;
    names.push(inst.display_name || 'System');
    timeline.push(...(p.timeline || []));
    models.push(p.model ?? null);
    if ((p.openAlerts || 0) > bestAlerts) {
      bestAlerts = p.openAlerts || 0;
      bestHighlight = p.briefHighlight || '';
    }
  }

  const aggHealthScore = totalWeight ? Math.round(weightedHealth / totalWeight) : payload.healthScore;
  const aggConnectorName =
    names.length > 1
      ? `${names.length} connected systems (${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''})`
      : names[0] || connectorName;
  const aggConnectorId = names.length > 1 ? 'aggregate' : connectorId;
  const aggModel = mergeUemModels(models);
  const aggTimeline = timeline.slice(0, 24);
  const aggPacked = toTimelineStorage({
    healthScore: aggHealthScore,
    connectedSystems,
    openAlerts,
    openDecisions,
    briefHighlight: bestHighlight,
    timeline: aggTimeline,
    model: aggModel,
  });

  const row = {
    id: crypto.randomUUID(),
    organization_id: organizationId,
    connector_id: aggConnectorId,
    connector_name: aggConnectorName,
    health_score: aggHealthScore,
    connected_systems: connectedSystems,
    open_alerts: openAlerts,
    open_decisions: openDecisions,
    brief_highlight: bestHighlight,
    timeline: aggPacked,
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

  // Return this one connector's own result (not the aggregate) so the
  // installation's own status message reflects what was just synced.
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

  const config = await decryptConnectorConfig(
    (existing.config || {}) as InstallConfig,
    existing.organization_id as string,
    context.env,
  );
  const catalogId = existing.catalog_id as string;
  const displayName = existing.display_name as string;

  try {
    let summary;
    if (catalogId === 'demo-json') {
      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        id,
        'demo-json',
        displayName || 'Demo JSON Systems',
        normalizeEnterprisePayload(demoSeed),
      );
    } else if (catalogId === 'rest-api') {
      const rawEndpoint = resolveEndpoint(context.request.url, config.endpoint);
      const isSample =
        rawEndpoint.includes('/api/v1/connectors/rest-sample') ||
        rawEndpoint.endsWith('/connectors/rest-sample');
      // Append date-window query params when configured (?window=today|week|month&from=...&to=...)
      const endpoint = isSample ? rawEndpoint : appendDateWindowToUrl(rawEndpoint, config);
      let raw: unknown = restSample;
      if (!isSample) {
        // Egress policy check before fetch
        const egressCheck = isSafeEgressTarget(endpoint);
        if (!egressCheck.safe) {
          return json(
            { statusCode: 400, message: egressCheck.reason ?? 'Endpoint blocked by egress policy' },
            400,
          );
        }
        const res = await safeFetch(endpoint, {
          method: 'GET',
          headers: { Accept: 'application/json', ...buildAuthHeaders(config) },
        });
        if (!res.ok) {
          return json(
            { statusCode: 502, message: `REST endpoint returned ${res.status}` },
            502,
          );
        }
        const text = await res.text();
        try {
          raw = JSON.parse(text);
        } catch {
          raw = {
            briefHighlight: text.slice(0, 400) || `Sync from ${new URL(endpoint).hostname}`,
            timeline: [{ title: 'HTTP sync', detail: `200 from ${new URL(endpoint).hostname}` }],
          };
        }
        // Unpack Firestore REST typed-value envelopes if present — applies to any
        // endpoint backed by Firestore's REST API regardless of which system it is.
        if (isFirestoreResponse(raw)) {
          raw = normalizeFirestoreResponse(raw);
        }
        // Apply field-name remapping (config.fieldMap) before normalization.
        // Lets operators map upstream-specific field names to EIP field names
        // without touching EIP code.
        if (config.fieldMap && typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
          raw = applyFieldMap(raw as Record<string, unknown>, config.fieldMap);
        }
      }
      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        id,
        'rest-api',
        displayName || 'REST API Systems',
        normalizeEnterprisePayload(raw),
      );
    } else if (catalogId === 'graphql') {
      // ── GraphQL connector ─────────────────────────────────────────────────
      // Uses the query stored in config.graphqlQuery + the endpoint in config.endpoint.
      // Auth headers are applied the same way as REST (apiKey, bearer, basic).
      // The response is normalized generically — operators can use fieldMap to
      // remap GraphQL-specific response fields to EIP names.
      const gqlEndpoint = (config.endpoint || '').trim();
      if (!gqlEndpoint) {
        return json({ statusCode: 400, message: 'GraphQL endpoint is required' }, 400);
      }
      const gqlQuery = (config.graphqlQuery || '').trim();
      if (!gqlQuery) {
        return json({ statusCode: 400, message: 'GraphQL query is required' }, 400);
      }
      const egressCheck = isSafeEgressTarget(gqlEndpoint);
      if (!egressCheck.safe) {
        return json({ statusCode: 400, message: egressCheck.reason ?? 'Endpoint blocked by egress policy' }, 400);
      }
      const gqlRes = await safeFetch(gqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...buildAuthHeaders(config),
        },
        body: JSON.stringify({ query: gqlQuery }),
      });
      if (!gqlRes.ok) {
        return json({ statusCode: 502, message: `GraphQL endpoint returned ${gqlRes.status}` }, 502);
      }
      let gqlRaw: unknown;
      try {
        gqlRaw = await gqlRes.json();
      } catch {
        return json({ statusCode: 502, message: 'GraphQL endpoint returned non-JSON' }, 502);
      }
      // GraphQL responses are { data: {...}, errors: [...] }
      // Extract data node before normalization
      const gqlRoot = gqlRaw && typeof gqlRaw === 'object' ? gqlRaw as Record<string, unknown> : {};
      let gqlData: unknown = gqlRoot.data ?? gqlRoot;
      if (config.fieldMap && typeof gqlData === 'object' && gqlData !== null && !Array.isArray(gqlData)) {
        gqlData = applyFieldMap(gqlData as Record<string, unknown>, config.fieldMap);
      }
      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        id,
        'graphql',
        displayName || 'GraphQL API',
        normalizeEnterprisePayload(gqlData),
      );
    } else if (catalogId === 'webhook-inbound') {
      // ── Webhook inbound connector ─────────────────────────────────────────
      // Push-based: the external system posts data to /api/v1/webhooks/enterprise.
      // This sync call returns the current snapshot for the org — there is nothing
      // to fetch because the data arrives when Haven/the external system fires.
      const { data: snap } = await supabase
        .from('enterprise_snapshots')
        .select('*')
        .eq('organization_id', auth.organizationId)
        .maybeSingle();
      if (!snap) {
        return json({
          statusCode: 200,
          connectorId: 'webhook-inbound',
          connectorName: displayName || 'Webhook Receiver',
          healthScore: 0, connectedSystems: 0, openAlerts: 0, openDecisions: 0,
          briefHighlight: 'Webhook receiver ready — no data pushed yet. Configure the external system to POST to /api/v1/webhooks/enterprise.',
          timeline: [], model: null,
          syncedAt: new Date().toISOString(), status: 'synced',
        });
      }
      return json({
        connectorId: snap.connector_id,
        connectorName: displayName || snap.connector_name,
        healthScore: snap.health_score,
        connectedSystems: snap.connected_systems,
        openAlerts: snap.open_alerts,
        openDecisions: snap.open_decisions,
        briefHighlight: snap.brief_highlight,
        timeline: [],
        model: null,
        syncedAt: new Date(snap.synced_at as string).toISOString(),
        status: 'synced',
      });
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
        id,
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
        id,
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
      
      let messages: Awaited<ReturnType<typeof fetchImapMessages>> = [];
      try {
        messages = await fetchImapMessages(config, 50);
      } catch (imapErr) {
        // If IMAP sync fails, provide helpful context
        const errorMsg = imapErr instanceof Error ? imapErr.message : 'IMAP sync failed';
        console.error(`[sync] IMAP error for ${config.imapUser}@${config.imapHost}: ${errorMsg}`);
        
        // Cloudflare Pages doesn't support persistent TCP connections like Workers do
        return json(
          { 
            statusCode: 503, 
            message: 'IMAP sync is not currently supported on Cloudflare Pages.',
            detail: `Error connecting to ${config.imapHost}:${config.imapPort || 993}: ${errorMsg}`,
            advice: 'Use one of these alternatives instead:\n1. Export emails as REST API (configure OpenAPI endpoint)\n2. Forward reports as POST webhooks to /api/v1/webhooks/enterprise\n3. Upload emails as CSV (one per row, with subject/from/date columns)\n4. Copy/paste JSON samples directly',
            catalogId: 'email-imap',
            config: { host: config.imapHost, port: config.imapPort, user: config.imapUser }
          },
          503,
        );
      }
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
        id,
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
    const stack = err instanceof Error ? err.stack : '';
    console.error(`[sync] Error syncing ${catalogId} connector ${id}:`, msg, stack?.slice(0, 200));

    // SSRF policy violations are a 400, not a 500
    const statusCode = err instanceof SsrfError ? 400 : 500;

    // Mark installation as error so the UI shows a clear status
    try {
      await supabase
        .from('connector_installations')
        .update({
          status: 'error',
          last_message: msg.slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('organization_id', auth.organizationId);
    } catch (updateErr) {
      console.error('[sync] Failed to mark connector as error:', updateErr);
    }

    return json(
      {
        statusCode,
        message: msg,
        catalogId,
        installationId: id
      },
      statusCode,
    );
  }
};
