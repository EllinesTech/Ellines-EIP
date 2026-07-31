# Notification delivery (MVP)

Outbound email/push for Ellines EIP.

## Live path (now)

Pages Functions on the web app:

| Endpoint | Role |
|----------|------|
| `GET/PUT /api/v1/orgs/me/notify-policy` | Org delivery prefs (Owner/IT) |
| `GET/POST /api/v1/notifications/deliver` | Outbox list + enqueue / send |

UI: `/app/notify-policy` · Audit: `notify.policy_updated`, `notify.simulated`, `notify.skipped`, `notify.delivered`, `notify.failed`.

### Behaviour

1. Policy channels gate whether a job is attempted or `skipped`.
2. **No mail secrets** → status `simulated` (CI / local without keys). Clear detail message.
3. **Secrets present** (email channel) → attempt real send:
   - `RESEND_API_KEY` or `ELLINEA_SMTP_API_KEY` → [Resend](https://resend.com) HTTPS (preferred on Pages)
   - else `SMTP_*` or `ELLINEA_SMTP_*` (host + user + pass) → SMTP via Workers TCP sockets
4. Result → `delivered` or `failed` in org settings `notifyOutbox` + audit.

Recipient defaults to the authenticated user email; optional body field `to`.

### Secrets (Pages / `.env`)

Set on Cloudflare Pages → Settings → Environment variables (production), and optionally in root `.env` for local docs:

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API key (recommended) |
| `ELLINEA_SMTP_API_KEY` | Alias for Resend key |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_SECURE` | Classic SMTP |
| `ELLINEA_SMTP_*` | Same SMTP fields with Ellinea prefix |

**Go-live:** a human must add at least `RESEND_API_KEY` (or SMTP pair) on Pages. Builds and CI do not need them.

Push / VAPID remains simulated until a later slice.

## Future Nest worker

This folder is reserved for `services/notification` (digest cron, VAPID push, long-running SMTP drain). The Pages outbox contract above stays the client API.
