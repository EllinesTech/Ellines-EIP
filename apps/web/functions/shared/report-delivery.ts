/**
 * Shared helpers for scheduled report multi-recipient delivery (B.2.3).
 */
import { normalizeAddressList } from './mail';

export type ReportDeliveryFields = {
  recipients: string[];
  cc: string[];
  bcc: string[];
  /** Preferred send hour in UTC (0–23). null = unspecified / morning default. */
  sendHour: number | null;
};

export function parseSendHour(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const hour = Math.trunc(n);
  if (hour < 0 || hour > 23) return null;
  return hour;
}

export function parseDeliveryFromBody(body: {
  recipients?: unknown;
  cc?: unknown;
  bcc?: unknown;
  sendHour?: unknown;
}): ReportDeliveryFields {
  return {
    recipients: normalizeAddressList(
      Array.isArray(body.recipients)
        ? (body.recipients as string[])
        : typeof body.recipients === 'string'
          ? body.recipients
          : [],
    ),
    cc: normalizeAddressList(
      Array.isArray(body.cc)
        ? (body.cc as string[])
        : typeof body.cc === 'string'
          ? body.cc
          : [],
    ),
    bcc: normalizeAddressList(
      Array.isArray(body.bcc)
        ? (body.bcc as string[])
        : typeof body.bcc === 'string'
          ? body.bcc
          : [],
    ),
    sendHour: parseSendHour(body.sendHour),
  };
}

export function deliveryFromStored(report: {
  recipients?: unknown;
  cc?: unknown;
  bcc?: unknown;
  sendHour?: unknown;
}): ReportDeliveryFields {
  return {
    recipients: normalizeAddressList(
      Array.isArray(report.recipients) ? (report.recipients as string[]) : [],
    ),
    cc: normalizeAddressList(Array.isArray(report.cc) ? (report.cc as string[]) : []),
    bcc: normalizeAddressList(Array.isArray(report.bcc) ? (report.bcc as string[]) : []),
    sendHour: parseSendHour(report.sendHour),
  };
}

export function nextRunHintFor(
  cadence: string,
  enabled: boolean,
  sendHour: number | null,
): string {
  if (!enabled) return 'Paused';
  const hourLabel =
    sendHour == null
      ? 'morning'
      : `${String(sendHour).padStart(2, '0')}:00 UTC`;
  if (cadence === 'weekly') return `Next Monday · ${hourLabel}`;
  return `Tomorrow · ${hourLabel}`;
}
