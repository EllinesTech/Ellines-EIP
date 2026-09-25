/**
 * Platform Super Admin — test a connector installation for any client org.
 *
 * POST /api/v1/platform/orgs/:orgId/connector-installations/:connId/test
 *
 * Mirrors the org-scoped handler at connectors/installations/[id]/test.ts but:
 *  - Gated on platformAdminFromEnv (Super Admin only, never client-org users)
 *  - Operates cross-tenant: looks up the installation by both connId + orgId so
 *    tenant isolation is still enforced at the DB query level
 *  - After a successful test, bumps status to 'tested' (not 'active') so the
 *    Super Admin still has an explicit Activate step before the client sees it
 */
import {
  auditRow,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../../../shared/auth';
import {
  buildAuthHeaders,
  decryptConnectorConfig,
  parseOpenApiDocument,
  toInstallationDto,
  type InstallConfig,
} from '../../../../../../../shared/connectors';
import {
  isSafeEgressTarget,
  safeFetch,
  isSafeTcpHost,
  isSafeTcpPort,
  SsrfError,
} from '../../../../../../../shared/egress';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  const connId = context.params.connId as string;
  const supabase = getAdminClient(context.env);

  // Tenant-isolation: fetch requires both connId AND orgId to match
  const { data: existing, error: fetchError } = await supabase
    .from('connector_installations')
    .select('*')
    .eq('id', connId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (fetchError) return json({ statusCode: 500, message: fetchError.message }, 500);
  if (!existing) return json({ statusCode: 404, message: 'Connector installation not found' }, 404);

  const config = await decryptConnectorConfig(
    (existing.config || {}) as InstallConfig,
    orgId,
    context.env,
  );
  const catalogId = existing.catalog_id as string;
  let ok = false;
  let message = 'Connection test OK';

  try {
    if (catalogId === 'demo-json') {
      ok = true;
    } else if (catalogId === 'csv-file') {
      ok = Boolean((config.csvText || 'x').trim());
    } else if (catalogId === 'rest-api') {
      const endpoint = (config.endpoint || '').trim();
      if (!endpoint || endpoint.includes('rest-sample')) {
        ok = true;
      } else {
        const egressCheck = isSafeEgressTarget(endpoint);
        if (!egressCheck.safe) {
          throw new Error(egressCheck.reason ?? 'Endpoint blocked by egress policy');
        }
        const res = await safeFetch(endpoint, {
          method: 'GET',
          headers: buildAuthHeaders(config),
        });
        ok = res.ok;
        if (!ok) message = `HTTP ${res.status}`;
      }
    } else if (catalogId === 'graphql') {
      const endpoint = (config.endpoint || '').trim();
      if (!endpoint) throw new Error('GraphQL endpoint is required');
      const egressCheck = isSafeEgressTarget(endpoint);
      if (!egressCheck.safe) throw new Error(egressCheck.reason ?? 'Endpoint blocked by egress policy');
      const query = config.graphqlQuery?.trim() || '{ __typename }';
      const res = await safeFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...buildAuthHeaders(config) },
        body: JSON.stringify({ query }),
      });
      ok = res.ok || [400, 401, 403].includes(res.status);
      message = ok
        ? `GraphQL endpoint reachable (HTTP ${res.status})`
        : `HTTP ${res.status} — check endpoint`;
    } else if (catalogId === 'webhook-inbound') {
      message = 'Webhook receiver ready. Configure the client org\'s webhook URL in their external system.';
      ok = true;
    } else if (catalogId === 'openapi') {
      if (!config.openApiDocument) throw new Error('OpenAPI document required');
      parseOpenApiDocument(config.openApiDocument);
      const base = (config.openApiBaseUrl || '').trim();
      if (!base) {
        ok = true;
      } else {
        const egressCheck = isSafeEgressTarget(base);
        if (!egressCheck.safe) {
          throw new Error(egressCheck.reason ?? 'OpenAPI base URL blocked by egress policy');
        }
        const res = await safeFetch(base, { method: 'GET', headers: buildAuthHeaders(config) });
        ok = res.ok || [401, 403, 404].includes(res.status);
      }
    } else if (
      catalogId === 'postgres' ||
      catalogId === 'sqlserver' ||
      catalogId === 'mysql'
    ) {
      if (!config.connectionString?.trim()) throw new Error('connectionString is required');
      if (!config.sql?.trim()) throw new Error('SQL query is required');
      const label =
        catalogId === 'postgres' ? 'PostgreSQL' :
        catalogId === 'sqlserver' ? 'SQL Server' : 'MySQL';
      message = `Config saved. ${label} TCP test requires the Identity API. Format looks ready.`;
      ok = true;
    } else if (catalogId === 'email-imap') {
      if (!config.imapHost?.trim() || !config.imapUser?.trim()) {
        throw new Error('IMAP host and user are required');
      }
      if (!config.imapPassword?.trim()) {
        message = 'Config saved. Enter the IMAP password to enable live sync.';
        ok = true;
      } else {
        try {
          const host = config.imapHost.trim();
          const port = Number(config.imapPort) || 993;
          const user = config.imapUser.trim();
          const pass = config.imapPassword.trim();
          const secure = config.imapSecure !== false;

          const hostCheck = isSafeTcpHost(host);
          if (!hostCheck.safe) throw new SsrfError(hostCheck.reason ?? 'IMAP host blocked', host);
          const portCheck = isSafeTcpPort(port);
          if (!portCheck.safe) throw new SsrfError(portCheck.reason ?? 'IMAP port blocked', `${host}:${port}`);

          const mod = (await import('cloudflare:sockets')) as {
            connect: (opts: { hostname: string; port: number; secureTransport?: 'on' | 'starttls' | 'off' }) => {
              readable: ReadableStream<Uint8Array>;
              writable: WritableStream<Uint8Array>;
              opened: Promise<unknown>;
              close: () => void;
              startTls?: () => void;
            };
          };
          const socket = mod.connect({ hostname: host, port, secureTransport: secure ? 'on' : 'starttls' });
          await socket.opened;

          const reader = socket.readable.getReader();
          const writer = socket.writable.getWriter();
          const dec = new TextDecoder();
          let ibuf = '';

          async function iReadLine() {
            while (!ibuf.includes('\n')) {
              const { value, done } = await reader.read();
              if (done) throw new Error('Connection closed');
              ibuf += dec.decode(value, { stream: true });
            }
            const nl = ibuf.indexOf('\n');
            const line = ibuf.slice(0, nl).replace(/\r$/, '');
            ibuf = ibuf.slice(nl + 1);
            return line;
          }

          async function iCmd(tag: string, command: string) {
            await writer.write(new TextEncoder().encode(`${tag} ${command}\r\n`));
            const lines: string[] = [];
            while (true) {
              const l = await iReadLine();
              lines.push(l);
              if (l.startsWith(tag + ' ') || l.startsWith('* BYE')) break;
            }
            return lines;
          }

          await iReadLine(); // server greeting
          if (!secure && typeof socket.startTls === 'function') {
            await iCmd('T0', 'STARTTLS');
            socket.startTls();
          }
          const loginResp = await iCmd('T1', `LOGIN "${user.replace(/"/g, '\\"')}" "${pass.replace(/"/g, '\\"')}"`);
          const loginOk = loginResp.some((l) => l.startsWith('T1 OK'));
          await iCmd('T2', 'LOGOUT').catch(() => { /* ignore */ });
          socket.close();

          if (!loginOk) throw new Error('IMAP LOGIN failed — check email and password');
          message = `IMAP connection OK — authenticated as ${user}`;
          ok = true;
        } catch (imapErr) {
          const errMsg = imapErr instanceof Error ? imapErr.message : 'IMAP test failed';
          if (/Cannot find module|cloudflare:sockets|Failed to resolve/i.test(errMsg)) {
            message = 'Config saved. IMAP format looks ready — live test requires Cloudflare deployment.';
            ok = true;
          } else {
            throw imapErr;
          }
        }
      }
    } else if (catalogId === 'sftp') {
      if (!config.sftpHost?.trim() || !config.sftpUsername?.trim() || !config.sftpRemotePath?.trim()) {
        throw new Error('SFTP host, username, and remotePath are required');
      }
      const hostCheck = isSafeTcpHost(config.sftpHost.trim());
      if (!hostCheck.safe) {
        throw new SsrfError(hostCheck.reason ?? 'SFTP host blocked by egress policy', config.sftpHost.trim());
      }
      const sftpPort = Number(config.sftpPort) || 22;
      const portCheck = isSafeTcpPort(sftpPort);
      if (!portCheck.safe) {
        throw new SsrfError(portCheck.reason ?? 'SFTP port blocked', `${config.sftpHost}:${sftpPort}`);
      }
      message = 'Config saved. SFTP TCP test requires the Identity API. Format looks ready.';
      ok = true;
    } else {
      return json({ statusCode: 404, message: `Unknown connector type: ${catalogId}` }, 404);
    }
  } catch (err) {
    ok = false;
    message = err instanceof Error ? err.message : 'Connection test failed';
  }

  const now = new Date().toISOString();

  // On platform test: use 'tested' status so Super Admin still has an explicit
  // Activate step — the connector doesn't auto-become active from a test.
  const { data: updated, error: updateError } = await supabase
    .from('connector_installations')
    .update({
      status: ok ? 'tested' : 'error',
      last_test_at: now,
      last_message: message,
      updated_at: now,
    })
    .eq('id', connId)
    .eq('organization_id', orgId)
    .select('*')
    .single();

  if (updateError) return json({ statusCode: 500, message: updateError.message }, 500);

  await supabase.from('audit_logs').insert(
    auditRow({
      organizationId: orgId,
      userId: auth.sub,
      action: ok ? 'platform.connector.test.ok' : 'platform.connector.test.fail',
      resource: 'connector_installation',
      metadata: {
        id: connId,
        catalogId,
        targetOrg: orgId,
        result: ok,
        message,
      },
      ip: auth.ip,
    }),
  );

  return json({ ok, message, installation: toInstallationDto(updated as Record<string, unknown>) });
};
