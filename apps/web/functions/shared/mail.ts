/**
 * Outbound email for Pages Functions.
 * Prefers Resend (HTTPS). Falls back to SMTP when SMTP_* / ELLINEA_SMTP_* are set.
 * Missing secrets → caller keeps `simulated` status (no throw).
 */

export type MailEnv = {
  RESEND_API_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  SMTP_SECURE?: string;
  ELLINEA_SMTP_HOST?: string;
  ELLINEA_SMTP_PORT?: string;
  ELLINEA_SMTP_USER?: string;
  ELLINEA_SMTP_PASS?: string;
  ELLINEA_SMTP_FROM?: string;
  ELLINEA_SMTP_SECURE?: string;
  ELLINEA_SMTP_API_KEY?: string;
};

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type MailConfig =
  | { provider: 'resend'; apiKey: string; from: string }
  | {
      provider: 'smtp';
      host: string;
      port: number;
      user: string;
      pass: string;
      from: string;
      secure: boolean;
    };

export type MailSendResult =
  | { ok: true; provider: 'resend' | 'smtp'; id?: string }
  | { ok: false; provider: 'resend' | 'smtp' | 'none'; error: string };

function pick(a?: string, b?: string): string {
  return (a || b || '').trim();
}

/** Resolve provider config from env. Returns null when nothing is configured. */
export function resolveMailConfig(env: MailEnv): MailConfig | null {
  const resendKey = pick(env.RESEND_API_KEY, env.ELLINEA_SMTP_API_KEY);
  const from =
    pick(env.SMTP_FROM, env.ELLINEA_SMTP_FROM) || 'Ellines EIP <noreply@ellines.co.ke>';

  if (resendKey) {
    return { provider: 'resend', apiKey: resendKey, from };
  }

  const host = pick(env.SMTP_HOST, env.ELLINEA_SMTP_HOST);
  const user = pick(env.SMTP_USER, env.ELLINEA_SMTP_USER);
  const pass = pick(env.SMTP_PASS, env.ELLINEA_SMTP_PASS);
  if (!host || !user || !pass) return null;

  const portRaw = pick(env.SMTP_PORT, env.ELLINEA_SMTP_PORT) || '587';
  const port = Number(portRaw) || 587;
  const secureFlag = pick(env.SMTP_SECURE, env.ELLINEA_SMTP_SECURE).toLowerCase();
  const secure = secureFlag === '1' || secureFlag === 'true' || port === 465;

  return { provider: 'smtp', host, port, user, pass, from, secure };
}

export function mailProviderLabel(env: MailEnv): 'resend' | 'smtp' | 'none' {
  return resolveMailConfig(env)?.provider ?? 'none';
}

async function sendViaResend(
  config: Extract<MailConfig, { provider: 'resend' }>,
  message: MailMessage,
): Promise<MailSendResult> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });
  const raw = await res.text();
  let parsed: { id?: string; message?: string } = {};
  try {
    parsed = raw ? (JSON.parse(raw) as { id?: string; message?: string }) : {};
  } catch {
    parsed = { message: raw.slice(0, 200) };
  }
  if (!res.ok) {
    return {
      ok: false,
      provider: 'resend',
      error: parsed.message || `Resend HTTP ${res.status}`,
    };
  }
  return { ok: true, provider: 'resend', id: parsed.id };
}

type SocketLike = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  opened: Promise<unknown>;
  close: () => void;
  startTls?: () => void;
};

async function openSmtpSocket(host: string, port: number, secure: boolean): Promise<SocketLike> {
  const mod = (await import('cloudflare:sockets')) as {
    connect: (opts: {
      hostname: string;
      port: number;
      secureTransport?: 'on' | 'starttls' | 'off';
    }) => SocketLike;
  };
  return mod.connect({
    hostname: host,
    port,
    secureTransport: secure ? 'on' : 'starttls',
  });
}

function encodeBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function sendViaSmtp(
  config: Extract<MailConfig, { provider: 'smtp' }>,
  message: MailMessage,
): Promise<MailSendResult> {
  let socket: SocketLike | null = null;
  try {
    socket = await openSmtpSocket(config.host, config.port, config.secure);
    await socket.opened;

    const reader = socket.readable.getReader();
    const writer = socket.writable.getWriter();
    const decoder = new TextDecoder();
    let buffer = '';

    async function readReply(): Promise<{ code: number; text: string }> {
      const lines: string[] = [];
      while (true) {
        while (!buffer.includes('\n')) {
          const { value, done } = await reader.read();
          if (done) throw new Error('SMTP connection closed');
          buffer += decoder.decode(value, { stream: true });
        }
        const nl = buffer.indexOf('\n');
        const rawLine = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        lines.push(rawLine);
        if (rawLine.length >= 4 && rawLine[3] === ' ') {
          const code = Number(rawLine.slice(0, 3));
          if (!Number.isFinite(code)) throw new Error(`Bad SMTP reply: ${rawLine}`);
          return { code, text: lines.join('\n') };
        }
      }
    }

    async function cmd(line: string, expect: number[]): Promise<void> {
      await writer.write(new TextEncoder().encode(`${line}\r\n`));
      const reply = await readReply();
      if (!expect.includes(reply.code)) {
        throw new Error(`SMTP ${reply.code}: ${reply.text.slice(0, 180)}`);
      }
    }

    const greet = await readReply();
    if (greet.code !== 220) throw new Error(`SMTP greet ${greet.code}`);

    await cmd('EHLO ellines-eip', [250]);
    if (!config.secure && typeof socket.startTls === 'function') {
      await cmd('STARTTLS', [220]);
      socket.startTls();
      await cmd('EHLO ellines-eip', [250]);
    }

    await cmd('AUTH LOGIN', [334]);
    await cmd(encodeBase64(config.user), [334]);
    await cmd(encodeBase64(config.pass), [235]);

    const fromAddr = config.from.includes('<')
      ? config.from.match(/<([^>]+)>/)?.[1] || config.from
      : config.from;
    await cmd(`MAIL FROM:<${fromAddr}>`, [250]);
    await cmd(`RCPT TO:<${message.to}>`, [250, 251]);
    await cmd('DATA', [354]);

    const payload = [
      `From: ${config.from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject.replace(/[\r\n]/g, ' ')}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      message.text.replace(/\r?\n\./g, '\n..'),
      '.',
    ].join('\r\n');
    await writer.write(new TextEncoder().encode(`${payload}\r\n`));
    const dataReply = await readReply();
    if (dataReply.code !== 250) {
      throw new Error(`SMTP DATA ${dataReply.code}: ${dataReply.text.slice(0, 180)}`);
    }
    try {
      await cmd('QUIT', [221, 250]);
    } catch {
      /* ignore quit errors */
    }

    return { ok: true, provider: 'smtp' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'SMTP send failed';
    if (/Cannot find module|cloudflare:sockets|Failed to resolve/i.test(msg)) {
      return {
        ok: false,
        provider: 'smtp',
        error:
          'SMTP sockets unavailable in this runtime — set RESEND_API_KEY for Pages edge delivery, or run a Nest worker.',
      };
    }
    return { ok: false, provider: 'smtp', error: msg.slice(0, 300) };
  } finally {
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
  }
}

/** Attempt real delivery. Caller decides simulated vs delivered/failed. */
export async function sendOutboundEmail(
  env: MailEnv,
  message: MailMessage,
): Promise<MailSendResult> {
  const config = resolveMailConfig(env);
  if (!config) {
    return {
      ok: false,
      provider: 'none',
      error: 'No SMTP/Resend secrets configured (SMTP_* / RESEND_API_KEY / ELLINEA_SMTP_*).',
    };
  }
  if (config.provider === 'resend') return sendViaResend(config, message);
  return sendViaSmtp(config, message);
}
