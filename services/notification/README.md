# Notification delivery (MVP)

Outbound email/push for Ellines EIP.

## Live path (now)

Pages Functions on the web app:

| Endpoint | Role |
|----------|------|
| `GET/PUT /api/v1/orgs/me/notify-policy` | Org delivery prefs (Owner/IT) |
| `GET/POST /api/v1/notifications/deliver` | Outbox list + enqueue/simulate |

UI: `/app/notify-policy` · Audit actions: `notify.policy_updated`, `notify.simulated`, `notify.skipped`.

Deliveries are **simulated** (outbox + audit) until SMTP / Web Push providers are configured. Policy channels gate whether a job is `simulated` or `skipped`.

## Future Nest worker

This folder is reserved for `services/notification` (SMTP worker, digest cron, VAPID push). The Pages outbox contract above stays the client API; the worker will drain the same settings JSON / a dedicated table later.
