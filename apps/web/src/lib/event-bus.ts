/** Minimal in-browser enterprise event bus (Phase 5.4 stub). */

export type EnterpriseEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  at: string;
};

const STORAGE = 'eip_event_bus_log';
const CHANNEL = 'eip-enterprise-events';

export function publishEnterpriseEvent(type: string, payload: Record<string, unknown> = {}) {
  const event: EnterpriseEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    at: new Date().toISOString(),
  };
  try {
    const raw = localStorage.getItem(STORAGE);
    const list = raw ? (JSON.parse(raw) as EnterpriseEvent[]) : [];
    const next = [event, ...list].slice(0, 100);
    localStorage.setItem(STORAGE, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANNEL, { detail: event }));
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
