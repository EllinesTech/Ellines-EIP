/**
 * Enterprise event bus (Phase 5.4).
 *
 * Publishes events to the server via /api/v1/orgs/me/events when possible,
 * and always mirrors to localStorage + window CustomEvent for immediate UI.
 */

export type EnterpriseEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  at: string;
};

const STORAGE = 'eip_event_bus_log';
const CHANNEL = 'eip-enterprise-events';

/** Write to localStorage ring (max 100) and fire CustomEvent. */
function writeLocal(event: EnterpriseEvent) {
  try {
    const raw = localStorage.getItem(STORAGE);
    const list = raw ? (JSON.parse(raw) as EnterpriseEvent[]) : [];
    const next = [event, ...list].slice(0, 100);
    localStorage.setItem(STORAGE, JSON.stringify(next));
  } catch {
    /* ignore storage errors */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANNEL, { detail: event }));
  }
}

/**
 * Publish an enterprise event.
 * - Always writes to localStorage + fires CustomEvent (instant UI).
 * - Fires-and-forgets to server (silently ignores network errors).
 */
export function publishEnterpriseEvent(
  type: string,
  payload: Record<string, unknown> = {},
): EnterpriseEvent {
  const event: EnterpriseEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    at: new Date().toISOString(),
  };

  // Local write is synchronous and always succeeds
  writeLocal(event);

  // Best-effort server drain — import lazily to avoid circular dependency
  if (typeof window !== 'undefined') {
    import('./api')
      .then(({ publishEnterpriseEventApi }) =>
        publishEnterpriseEventApi({ type: event.type, payload: event.payload }),
      )
      .catch(() => {
        /* server unavailable — local copy is the record */
      });
  }

  return event;
}

export function readEnterpriseEvents(): EnterpriseEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EnterpriseEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const ENTERPRISE_EVENT_CHANNEL = CHANNEL;
