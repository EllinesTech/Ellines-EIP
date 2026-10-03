import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../../shared/auth';
import { isSafeEgressTarget, safeFetch, SsrfError, isSafeTcpHost, isSafeTcpPort } from '../../../../../shared/egress';

/**
 * Delegate a sync to the identity service proxy endpoint.
 * Called when isSafeEgressTarget blocks the connector's URL (private/LAN IP or http://)
 * but IDENTITY_API_URL is set, meaning the identity service runs on the same LAN
 * and CAN reach the private endpoint.
 *
 * Only the installationId is sent — no raw credentials or URLs travel over the wire.
 * The identity service reads config from DB, decrypts credentials, makes the call,
 * and writes enterprise_snapshots itself.
 */
async function delegateToProxy(
  identityApiUrl: string,
  installationId: string,
  authHeader: string,
): Promise<Response> {
  return fetch(`${identityApiUrl}/api/v1/connectors/proxy-sync`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ installationId }),
  });
}
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
  validateFieldMap,
  injectConfigContext,
  type InstallConfig,
} from '../../../../../shared/connectors';
import {
  applyOutcomes,
  buildInstallationRegistry,
  saveCapabilityRegistry,
} from '../../../../../shared/capability-store';
import {
  availableCapabilityCount,
  deriveRegistryFromResponse,
} from '@ellines-eip/shared';
import { isOrganizationSuspended, mergeUemModels } from '@ellines-eip/shared';
import {
  retrieveAllPages,
  type RetrievalResult,
} from '../../../../../shared/pagination';
import {
  isFirestoreResponse,
  normalizeFirestoreResponse,
} from '../../../../../shared/firestore-normalizer';

/**
 * Explicit, non-optimistic sync states. EIP never reports a fabricated success:
 * a source system that could not be read is UNAVAILABLE / AUTHENTICATION_FAILED.
 */
type SyncFailureStatus = 'AUTHENTICATION_FAILED' | 'INVALID_RESPONSE' | 'UNAVAILABLE' | 'PARTIAL';

/** Raised when a source returns 200 with a body that is not the expected format. */
class InvalidResponseError extends Error {
  readonly kind = 'INVALID_RESPONSE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResponseError';
  }
}

/** Projection of a retrieval result that is safe to persist and to return. */
function retrievalMeta(r: RetrievalResult) {
  return {
    retrievedRecordCount: r.retrievedRecordCount,
    reportedRecordCount: r.reportedRecordCount,
    complete: r.complete,
    stopReason: r.stopReason,
    pagesFetched: r.pagesFetched,
    duplicateCount: r.duplicateCount,
    warnings: r.warnings,
    errors: r.errors,
  };
}

/** A non-secret identifier for a resource, safe to log and store. */
function safeResourceName(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.slice(0, 200);
  } catch {
    return String(url).slice(0, 200);
  }
}

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

type StoredPayload = {
  healthScore?: number | null;
  connectedSystems?: number;
  recordCount?: number;
  openAlerts?: number;
  openDecisions?: number;
  briefHighlight?: string;
  timeline?: { title: string; detail: string }[];
  model?: import('@ellines-eip/shared').UemModel | null;
  /**
   * Truthful retrieval metadata. `retrievalComplete` is the load-bearing field:
   * it is false whenever EIP could not prove it read the whole authorized set.
   */
  retrieval?: {
    retrievedRecordCount: number;
    reportedRecordCount: number;
    complete: boolean;
    stopReason: string;
    pagesFetched: number;
    duplicateCount: number;
    warnings: string[];
    errors: { page: number; reason: string }[];
    /** Resources retrieved independently — never collapsed into one "best". */
    resources: ResourceResult[];
  };
};

/** One API resource (route) retrieved independently, with its own outcome. */
type ResourceResult = {
  /** Path/URL identifier preserved so resource identity is never lost. */
  resource: string;
  ok: boolean;
  retrievedRecordCount: number;
  reportedRecordCount: number;
  complete: boolean;
  stopReason: string;
  error?: string;
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
  payload: StoredPayload & {
    /** Present when the connector retrieved via the pagination engine. */
    retrievedRecordCount?: number;
    reportedRecordCount?: number;
    complete?: boolean;
    resources?: import('../../../../../shared/connectors').OpenApiResourceResult[];
  },
  fieldMapWarnings?: string[],
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

  let connectedSystems = 0;
  let totalRecordCount = 0;
  let openAlerts = 0;
  let openDecisions = 0;
  let bestHighlight = '';
  let bestAlerts = -1;
  const names: string[] = [];
  const timeline: { title: string; detail: string }[] = [];
  const models: (import('@ellines-eip/shared').UemModel | null)[] = [];

  for (const inst of merged) {
    const p = inst.last_payload as StoredPayload;
    connectedSystems += p.connectedSystems || 0;
    totalRecordCount += p.recordCount || 0;
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

  // Health is aggregated ONLY from connectors that published a real health
  // metric. Connectors reporting null (unknown) are excluded from the average
  // rather than being counted as 0 (which would unfairly drag health down) or as
  // a fabricated baseline (which would invent a score EIP does not have).
  const scored = merged.filter((inst) => {
    const p = inst.last_payload as StoredPayload;
    return typeof p.healthScore === 'number';
  });
  const aggHealthScore = scored.length
    ? Math.round(
        scored.reduce((sum, inst) => sum + ((inst.last_payload as StoredPayload).healthScore as number), 0) /
          scored.length,
      )
    : null;

  // Completeness across every connected connector. A single incomplete connector
  // makes the organization's aggregate data partial — the Command Center must be
  // able to tell the difference between a full read and a partial one.
  const retrievals = merged
    .map((inst) => (inst.last_payload as StoredPayload).retrieval)
    .filter((r): r is NonNullable<StoredPayload['retrieval']> => Boolean(r));
  const resourcesRetrieved = retrievals.filter((r) => r.complete).length;
  const resourcesFailed = retrievals.length - resourcesRetrieved;
  const retrievedCount = retrievals.reduce((s, r) => s + r.retrievedRecordCount, 0);
  const reportedCount = retrievals.reduce((s, r) => s + r.reportedRecordCount, 0);
  const retrievalComplete = retrievals.length > 0 && retrievals.every((r) => r.complete);
  const syncStatus: 'synced' | 'partial' =
    retrievals.length === 0 ? 'synced' : retrievalComplete ? 'synced' : 'partial';
  const syncError =
    syncStatus === 'partial'
      ? `Incomplete retrieval: ${retrievals
          .filter((r) => !r.complete)
          .map((r) => `${r.stopReason} (${r.retrievedRecordCount} of ${r.reportedRecordCount || '?'} records)`)
          .join('; ')}`
      : null;

  const { count: activeCount } = await supabase
    .from('connector_installations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .in('status', ['active', 'synced']);
  const activeConnectorCount = activeCount ?? merged.length;

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
    // `health_score` stores the SOURCE's own metric. It is null whenever no
    // connector published one, and null is what the API layer reads back as
    // UNKNOWN. Coercing it to 0 here — as this previously did — made an
    // unmeasured system look like the worst possible one, and any consumer that
    // treated a non-null score as "measured" would be reading a fabrication.
    health_score: aggHealthScore,
    connected_systems: activeConnectorCount,
    record_count: totalRecordCount,
    retrieved_count: retrievedCount,
    reported_count: reportedCount,
    retrieval_complete: retrievalComplete,
    retrieval_stop_reason: retrievals.find((r) => !r.complete)?.stopReason ?? '',
    resources_retrieved: resourcesRetrieved,
    resources_failed: resourcesFailed,
    sync_status: syncStatus,
    sync_error: syncError,
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
        record_count: row.record_count,
        retrieved_count: row.retrieved_count,
        reported_count: row.reported_count,
        retrieval_complete: row.retrieval_complete,
        retrieval_stop_reason: row.retrieval_stop_reason,
        resources_retrieved: row.resources_retrieved,
        resources_failed: row.resources_failed,
        sync_status: row.sync_status,
        sync_error: row.sync_error,
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
    // null = the source published no health metric. Not zero, not a baseline.
    healthScore: payload.healthScore ?? null,
    connectedSystems: activeConnectorCount,
    recordCount: payload.recordCount,
    retrievedCount,
    reportedCount,
    retrievalComplete,
    syncStatus,
    syncError,
    openAlerts: payload.openAlerts,
    openDecisions: payload.openDecisions,
    briefHighlight: payload.briefHighlight,
    timeline: payload.timeline,
    model: payload.model || null,
    syncedAt,
    status: syncStatus,
    fieldMapWarnings: fieldMapWarnings ?? [],
  };
}


function resolveEndpoint(endpoint?: string): string {
  const raw = (endpoint || '').trim();
  if (!raw) throw new Error('REST endpoint URL is required');
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
    if (catalogId === 'rest-api') {
      const rawEndpoint = resolveEndpoint(config.endpoint);
      const endpoint = appendDateWindowToUrl(rawEndpoint, config);
      // Egress policy check before fetch
      const egressCheck = isSafeEgressTarget(endpoint);
      if (!egressCheck.safe) {
        // If the identity service is available (same LAN as on-prem systems),
        // delegate the entire sync through it instead of blocking.
        const identityApiUrl = (context.env as unknown as Record<string, string>)['IDENTITY_API_URL'];
        if (identityApiUrl) {
          const proxyRes = await delegateToProxy(
            identityApiUrl,
            id,
            context.request.headers.get('Authorization') || '',
          );
          const proxyBody = await proxyRes.text();
          return new Response(proxyBody, {
            status: proxyRes.status,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return json(
          { statusCode: 400, message: egressCheck.reason ?? 'Endpoint blocked by egress policy' },
          400,
        );
      }

      // The real first successful body, kept for capability derivation. This is
      // the only thing discovery is allowed to learn from for this connector.
      let discoveryBody: unknown = null;

      // Retrieve the FULL authorized result set, following pagination to the end.
      // retrieveAllPages reports completeness explicitly; we never assume page 1
      // is the whole dataset.
      const retrieval = await retrieveAllPages({
        startUrl: endpoint,
        strategy: config.paginationStrategy ?? 'auto',
        pageSize: Number(config.pageSize) || 100,
        fetchPage: async (pageUrl) => {
          const check = isSafeEgressTarget(pageUrl);
          if (!check.safe) {
            throw new SsrfError(check.reason ?? 'Pagination URL blocked by egress policy', pageUrl);
          }
          const res = await safeFetch(pageUrl, {
            method: 'GET',
            headers: { Accept: 'application/json', ...buildAuthHeaders(config) },
          });
          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => {
            headers[k.toLowerCase()] = v;
          });
          const text = await res.text();
          if (!res.ok) {
            // Return the status; the engine classifies it (auth/rate-limit/other).
            return { status: res.status, body: null, headers };
          }
          let parsed: unknown = null;
          let parseError = false;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            parseError = true;
          }
          if (parseError) {
            // A 200 that is not JSON is almost always a login/error page. It must
            // never be presented as a successful sync of business data.
            const looksLikeHtml = /^\s*<(?:!doctype|html)/i.test(text);
            throw new InvalidResponseError(
              looksLikeHtml
                ? 'Endpoint returned an HTML page instead of JSON. This usually means the request was not authenticated and the server returned a login page.'
                : 'Endpoint returned a 200 response that is not valid JSON.',
            );
          }
          // Keep the source's OWN body. Discovery must learn the real field names
          // the publisher used, so a reconstructed or normalized shape is never
          // substituted here.
          if (discoveryBody === null) discoveryBody = parsed;
          return { status: res.status, body: parsed, headers };
        },
      });

      // Classify an authentication failure explicitly rather than as a generic error.
      if (retrieval.errors.some((e) => /HTTP 40[13]/.test(e.reason))) {
        const authLike = retrieval.errors.find((e) => /HTTP 40[13]/.test(e.reason));
        const status: SyncFailureStatus =
          authLike && /HTTP 401|HTTP 403/.test(authLike.reason)
            ? 'AUTHENTICATION_FAILED'
            : 'UNAVAILABLE';
        return json(
          {
            statusCode: 502,
            status,
            connectorId: catalogId,
            connectorName: displayName,
            message: `Source system rejected the request (${authLike?.reason}). Credentials or permissions may be wrong.`,
            retrieval: retrievalMeta(retrieval),
          },
          502,
        );
      }

      if (retrieval.errors.length && retrieval.retrievedRecordCount === 0) {
        return json(
          {
            statusCode: 502,
            status: 'UNAVAILABLE',
            connectorId: catalogId,
            connectorName: displayName,
            message: `Retrieval failed: ${retrieval.errors.map((e) => `page ${e.page} ${e.reason}`).join('; ')}`,
            retrieval: retrievalMeta(retrieval),
          },
          502,
        );
      }

      // Build a payload from what was ACTUALLY retrieved. reportedRecordCount is
      // carried separately and is never presented as EIP's own retrieval count.
      let raw: unknown = {
        records: retrieval.records,
        retrievedCount: retrieval.retrievedRecordCount,
      };
      if (isFirestoreResponse(raw)) {
        raw = normalizeFirestoreResponse(raw);
      }
      if (config.fieldMap && typeof raw === 'object' && raw !== null) {
        raw = applyFieldMap(raw as Record<string, unknown>, config.fieldMap);
      }
      const fieldMapWarnings = validateFieldMap(config.fieldMap);
      if (typeof raw === 'object' && raw !== null) {
        raw = injectConfigContext(raw as Record<string, unknown>, config);
      }
      const normalized = normalizeEnterprisePayload(raw);
      // recordCount must reflect what EIP retrieved, not what the API claimed.
      normalized.recordCount = retrieval.retrievedRecordCount;

      // ── Phase 4: derive capabilities from the REAL response ──────────────
      // Resources come only from collections that genuinely exist in the body
      // the source returned. Nothing is inferred from the endpoint name, the
      // connector name, or the HTTP status, and no path is probed speculatively
      // against a customer's system.
      const derived = deriveRegistryFromResponse({
        systemName: config.systemLabel || displayName || 'REST API System',
        payload: discoveryBody,
        // Only claim paging the source actually demonstrated. A single-page
        // walk proves the source served one response, not that paging exists.
        paginationObserved:
          retrieval.pagesFetched > 1 && retrieval.strategy !== 'single'
            ? retrieval.strategy === 'token' || retrieval.strategy === 'next-link'
              ? 'cursor'
              : retrieval.strategy
            : 'none',
      });
      // Only a real retrieval may move a resource out of NOT_YET_SUPPORTED.
      // The evidence is bound to the resource DISCOVERY actually found, so the
      // registry and the retrieval evidence can never describe different things.
      // `retrieval.resourceName` is the source's own container name, which is
      // what ties a record count to a capability; `derived.discovered[0]` is the
      // fallback when the source published a bare array.
      const retrievedResource =
        (retrieval.resourceName && derived.discovered.includes(retrieval.resourceName)
          ? retrieval.resourceName
          : null) ?? derived.discovered[0] ?? safeResourceName(endpoint);

      // A retrieval that produced no records is never a successful read, even
      // when the request itself returned 200. The availability helper maps this
      // to UNAVAILABLE so the registry cannot claim AVAILABLE over an empty read.
      const retrievalOk = retrieval.errors.length === 0;
      const registry = applyOutcomes(derived.registry, [
        {
          resource: retrievedResource,
          ok: retrievalOk,
          retrievedRecordCount: retrieval.retrievedRecordCount,
          reportedRecordCount: retrieval.reportedRecordCount,
          complete: retrieval.complete,
          stopReason: retrieval.stopReason,
          ...(retrievalOk ? {} : { error: retrieval.errors.map((e) => e.reason).join('; ') }),
        },
      ]);
      await saveCapabilityRegistry(context.env, {
        installationId: id,
        organizationId: auth.organizationId,
        registry,
      });
      await supabase.from('connector_installations').update({
        discovery_snapshot: {
          discoveredAt: new Date().toISOString(),
          method: 'response-analysis',
          resources: registry.resources.length,
          available: availableCapabilityCount(registry),
          notes: derived.notes,
        },
      })
        .eq('id', id)
        .eq('organization_id', auth.organizationId);

      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        id,
        'rest-api',
        config.systemLabel || displayName || 'REST API Systems',
        {
          ...normalized,
          retrieval: {
            ...retrievalMeta(retrieval),
            resources: [
              {
                resource: safeResourceName(endpoint),
                ok: retrieval.errors.length === 0,
                retrievedRecordCount: retrieval.retrievedRecordCount,
                reportedRecordCount: retrieval.reportedRecordCount,
                complete: retrieval.complete,
                stopReason: retrieval.stopReason,
                error: retrieval.errors.map((e) => e.reason).join('; ') || undefined,
              },
            ],
          },
        },
        fieldMapWarnings,
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
        const identityApiUrl = (context.env as unknown as Record<string, string>)['IDENTITY_API_URL'];
        if (identityApiUrl) {
          const proxyRes = await delegateToProxy(
            identityApiUrl,
            id,
            context.request.headers.get('Authorization') || '',
          );
          const proxyBody = await proxyRes.text();
          return new Response(proxyBody, {
            status: proxyRes.status,
            headers: { 'Content-Type': 'application/json' },
          });
        }
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

        // Capability discovery is built from EVERY selectable operation the
        // source published, not just the handful EIP reads. A customer must be
        // able to see that their ERP exposes fleet and payroll even before EIP
        // has a reader for them. Knowing a capability is not the same as
        // reading it, and conflating the two is how a system looks smaller
        // than it really is.
        const allSelectable = parsed.endpoints.filter((e) => e.selectable);
        const routes = config.selectedRoutes?.length
          ? config.selectedRoutes
          : allSelectable
              .slice(0, 5)
              .map((e) => ({ method: e.method, path: e.path, capability: e.capability }));
        const payload = await syncOpenApiRoutes({
          baseUrl,
          routes,
          headers: buildAuthHeaders(config),
          systemName,
        });

        // Record the honest inventory for this one connection. Resources that
        // were not read stay NOT_YET_SUPPORTED; only real retrieval outcomes
        // can promote them to AVAILABLE or PARTIAL.
        const registry = buildInstallationRegistry({
          systemName,
          endpoints: allSelectable,
          outcomes: payload.resources ?? [],
        });
        await saveCapabilityRegistry(context.env, {
          installationId: id,
          organizationId: auth.organizationId,
          registry,
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
      } else {
        // No OpenAPI document was supplied, so there is nothing to discover
        // and nothing to read. Sync the (empty) selection honestly rather than
        // inventing resources, and say so in the installation's own message.
        summary = await upsertSnapshot(
          context.env,
          auth.organizationId,
          auth.sub,
          id,
          'openapi',
          systemName,
          normalizeEnterprisePayload({}),
        );
      }
    } else if (catalogId === 'csv-file') {
      const csvText = (config.csvText && config.csvText.trim());
      if (!csvText) {
        return json(
          { statusCode: 400, message: 'CSV text is required. Edit this connector and paste your system\'s export into the CSV content field.' },
          400,
        );
      }
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
    // Collect any fieldMap semantic warnings to surface in the admin UI.
    const fieldMapWarnSuffix =
      Array.isArray((summary as Record<string,unknown>).fieldMapWarnings) &&
      ((summary as Record<string,unknown>).fieldMapWarnings as string[]).length > 0
        ? ' ⚠ ' + ((summary as Record<string,unknown>).fieldMapWarnings as string[])[0].slice(0, 150)
        : '';
    await supabase
      .from('connector_installations')
      .update({
        status: 'synced',
        // Both timestamps are written on purpose. `last_synced_at` is the
        // historical record; `last_sync_at` is the column the health and
        // capability endpoints read to decide freshness. Previously NO path
        // wrote `last_sync_at`, so freshness could never be verified and every
        // connector drifted to STALE no matter how recently it had synced.
        last_synced_at: now,
        last_sync_at: now,
        last_message: `Synced — health ${summary.healthScore ?? 'unknown'}${fieldMapWarnSuffix}`,
        // Clear the previous failure so a recovered connector does not keep
        // advertising a stale error.
        last_error: null,
        error_count: 0,
        config: nextConfig,
        updated_at: now,
      })
      .eq('id', id)
      .eq('organization_id', auth.organizationId);

    return json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    const stack = err instanceof Error ? err.stack : '';
    console.error(`[sync] Error syncing ${catalogId} connector ${id}:`, msg, stack?.slice(0, 200));

    // SSRF policy violations are a 400, not a 500
    const statusCode = err instanceof SsrfError ? 400 : 500;

    // Record the real failure. `last_error` and `error_count` are maintained
    // here so the Super Admin inventory can report an actual error state
    // instead of inferring one from free text. `last_sync_at` is deliberately
    // NOT touched: a failed attempt is not a successful retrieval, and writing
    // it here would reset freshness and hide the failure behind a green light.
    try {
      const { data: current } = await supabase
        .from('connector_installations')
        .select('error_count')
        .eq('id', id)
        .eq('organization_id', auth.organizationId)
        .maybeSingle();
      await supabase
        .from('connector_installations')
        .update({
          status: 'error',
          last_message: msg.slice(0, 300),
          last_error: msg.slice(0, 300),
          error_count: (Number(current?.error_count) || 0) + 1,
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
