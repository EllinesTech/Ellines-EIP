# Notification delivery (MVP)

Outbound email/push for Ellines EIP.

## Live path (now)

Pages Functions on the web app:

| Endpoint | Role |
|----------|------|
| `GET/PUT /api/v1/orgs/me/notify-policy` | Org delivery prefs (Owner/IT) |
| `GET/POST /api/v1/notifications/deliver` | Outbox list + enqueue / send |
| `GET/PUT/DELETE /api/v1/notifications/push-subscription` | Browser push subscription + VAPID public key |

UI: `/app/notify-policy` · Service worker: `/sw-push.js`

Audit: `notify.policy_updated`, `notify.simulated`, `notify.skipped`, `notify.delivered`, `notify.failed`, `notify.push_subscribed`, `notify.push_unsubscribed`.

### Behaviour

1. Policy channels gate whether a job is attempted or `skipped`.
2. **Email — no mail secrets** → status `simulated` (CI-safe).
3. **Email — secrets present** → attempt real send:
   - `RESEND_API_KEY` or `ELLINEA_SMTP_API_KEY` → Resend HTTPS (preferred on Pages)
   - else `SMTP_*` / `ELLINEA_SMTP_*` → SMTP via Workers TCP sockets
4. **Push — no VAPID** → `simulated`.
5. **Push — VAPID present, no browser subscription** → `failed` with clear message.
6. **Push — VAPID + subscription** → payload-less Web Push (VAPID JWT) → `delivered` / `failed`.

Recipient for email defaults to the authenticated user; optional body field `to`.

### Secrets (Pages / `.env`)

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` / `ELLINEA_SMTP_API_KEY` | Resend (recommended for email) |
| `SMTP_*` / `ELLINEA_SMTP_*` | Classic SMTP |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push |
| `ELLINEA_VAPID_*` | Same VAPID fields with Ellinea prefix |

Generate VAPID: `npx web-push generate-vapid-keys`

**Go-live:** a human must add mail and/or VAPID secrets on Cloudflare Pages. Builds and CI do not need them.

## Future Nest worker

This folder is reserved for digest cron and long-running drain. The Pages outbox contract above stays the client API.
