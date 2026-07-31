import type { Env } from './shared/auth';

/**
 * Cloudflare Pages cron entry — keeps scheduled sync path registered.
 * Org-scoped due syncs run when IT opens Connectors (POST /connectors/run-due).
 * Platform-wide unattended sync needs CRON_SECRET + Identity TCP for DB/IMAP/SFTP.
 */
export const onSchedule: PagesFunction<Env> = async () => {
  return new Response(
    JSON.stringify({
      ok: true,
      service: 'ellines-eip-scheduler',
      note: 'Use Connectors → run-due while signed in as Org IT/Owner for due syncs.',
      ts: new Date().toISOString(),
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
};
