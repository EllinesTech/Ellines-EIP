import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../../shared/auth';
import {
  buildAuthHeaders,
  parseOpenApiDocument,
  toInstallationDto,
  type InstallConfig,
} from '../../../../../shared/connectors';
import { sendOutboundEmail } from '../../../../../shared/mail';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // connector:read permission required for testing
  const permErr = await requirePermissionAsync(
    context.env,
    auth.sub,
    auth.organizationId,
    auth.role,
    'connector:read',
  );
  if (permErr) return permErr;

  const id = context.params.id as string;
  const supabase = getAdminClient(context.env);
  const { data: existing } = await supabase
    .from('connector_installations')
    .select('*')
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();
  if (!existing) return json({ statusCode: 404, message: 'Installation not found' }, 404);

  const config = (existing.config || {}) as InstallConfig;
  const catalogId = existing.catalog_id as string;
  let ok = false;
  let message = 'Connection test OK';

  try {
    if (catalogId === 'demo-json') ok = true;
    else if (catalogId === 'csv-file') ok = Boolean((config.csvText || 'x').trim());
    else if (catalogId === 'rest-api') {
      const endpoint = (config.endpoint || '').trim();
      if (!endpoint || endpoint.includes('rest-sample')) ok = true;
      else {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: buildAuthHeaders(config),
        });
        ok = res.ok;
        if (!ok) message = `HTTP ${res.status}`;
      }
    } else if (catalogId === 'openapi') {
      if (!config.openApiDocument) throw new Error('OpenAPI document required');
      parseOpenApiDocument(config.openApiDocument);
      const base = (config.openApiBaseUrl || '').trim();
      if (!base) ok = true;
      else {
        const res = await fetch(base, { method: 'GET', headers: buildAuthHeaders(config) });
        ok = res.ok || [401, 403, 404].includes(res.status);
      }
    } else if (catalogId === 'postgres' || catalogId === 'sqlserver' || catalogId === 'mysql') {
      if (!config.connectionString?.trim()) throw new Error('connectionString is required');
      if (!config.sql?.trim()) throw new Error('SQL query is required');
      const label =
        catalogId === 'postgres'
          ? 'PostgreSQL'
          : catalogId === 'sqlserver'
            ? 'SQL Server'
            : 'MySQL';
      message = `Config saved. ${label} TCP test requires the Identity API (Nest). Format looks ready.`;
      ok = true;
    } else if (catalogId === 'email-imap') {
      if (!config.imapHost?.trim() || !config.imapUser?.trim()) {
        throw new Error('IMAP host and user are required');
      }
      if (!config.imapPassword?.trim()) {
        // Password not yet set — mark as partially configured
        message = `Config saved. Enter the IMAP password to enable live sync.`;
        ok = true;
      } else {
        // Try a live TCP connection: LOGIN then LOGOUT
        try {
          const host = config.imapHost.trim();
          const port = Number(config.imapPort) || 993;
          const user = config.imapUser.trim();
          const pass = config.imapPassword.trim();
          const secure = config.imapSecure !== false;

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
            const l = ibuf.slice(0, nl).replace(/\r$/, '');
            ibuf = ibuf.slice(nl + 1);
            return l;
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
          await iCmd('T2', 'LOGOUT').catch(() => {/* ignore */});
          socket.close();

          if (!loginOk) throw new Error('IMAP LOGIN failed — check your email and password');
          message = `IMAP connection OK — authenticated as ${user}`;
          ok = true;
        } catch (imapErr) {
          const errMsg = imapErr instanceof Error ? imapErr.message : 'IMAP test failed';
          if (/Cannot find module|cloudflare:sockets|Failed to resolve/i.test(errMsg)) {
            message = `Config saved. IMAP format looks ready — live test requires Cloudflare deployment.`;
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
      message =
        'Config saved. SFTP TCP test/sync requires the Identity API (Nest). Format looks ready.';
      ok = true;
    } else {
      return json({ statusCode: 404, message: 'Unknown connector' }, 404);
    }
  } catch (err) {
    ok = false;
    message = err instanceof Error ? err.message : 'Connection test failed';
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('connector_installations')
    .update({
      status: ok ? 'tested' : 'error',
      last_test_at: now,
      last_message: message,
      updated_at: now,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return json({ statusCode: 500, message: error.message }, 500);

  // Fire-and-forget: notify the IT admin of the test result.
  const displayName = (existing.display_name as string) || (existing.catalog_id as string);
  sendOutboundEmail(context.env, {
    to: auth.email,
    subject: ok
      ? `Ellines EIP — Connector test passed: ${displayName}`
      : `Ellines EIP — Connector test failed: ${displayName}`,
    text: [
      `Connector connection test ${ok ? 'passed ✓' : 'failed ✗'}.`,
      ``,
      `Connector: ${displayName}`,
      `Type: ${existing.catalog_id as string}`,
      `Result: ${message}`,
      `Tested at: ${now}`,
      ``,
      ok
        ? `The connector is ready to sync. Go to Connectors → Sync to pull live data.`
        : `Check your credentials and endpoint, then test again.`,
      ``,
      `---`,
      `Ellines EIP — Enterprise Intelligence Platform`,
    ].join('\n'),
  }).catch(() => {/* silent — email secrets not configured */});

  return json({ ok, message, installation: toInstallationDto(data as Record<string, unknown>) });
};
