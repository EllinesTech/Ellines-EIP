/** UEM helpers for Pages Functions (mirrors @ellines-eip/shared uem). */

export type UemObjectKind =
  | 'organization'
  | 'branch'
  | 'department'
  | 'person'
  | 'user'
  | 'document'
  | 'asset'
  | 'task'
  | 'notification'
  | 'event';

export type UemObject = {
  id: string;
  kind: UemObjectKind;
  name: string;
  status?: string;
  branchId?: string;
};

export type UemCounts = {
  branches: number;
  departments: number;
  people: number;
  documents: number;
  assets: number;
  tasks: number;
  notifications: number;
  events: number;
};

export type UemModel = {
  version: '1.0';
  sourceSystem?: string;
  capabilities: string[];
  counts: UemCounts;
  objects: UemObject[];
};

export type TimelineEvent = { title: string; detail: string };

const KINDS: UemObjectKind[] = [
  'organization',
  'branch',
  'department',
  'person',
  'user',
  'document',
  'asset',
  'task',
  'notification',
  'event',
];

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function emptyUemCounts(): UemCounts {
  return {
    branches: 0,
    departments: 0,
    people: 0,
    documents: 0,
    assets: 0,
    tasks: 0,
    notifications: 0,
    events: 0,
  };
}

export function normalizeUemModel(
  raw: unknown,
  opts?: { sourceSystem?: string; fallbackCapabilities?: string[] },
): UemModel {
  const root = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const modelRoot =
    root.model && typeof root.model === 'object'
      ? (root.model as Record<string, unknown>)
      : root.uem && typeof root.uem === 'object'
        ? (root.uem as Record<string, unknown>)
        : root;

  const countsRaw =
    modelRoot.counts && typeof modelRoot.counts === 'object'
      ? (modelRoot.counts as Record<string, unknown>)
      : {};

  const counts: UemCounts = {
    branches: Math.max(0, asNumber(countsRaw.branches ?? root.branches, 0)),
    departments: Math.max(0, asNumber(countsRaw.departments ?? root.departments, 0)),
    people: Math.max(0, asNumber(countsRaw.people ?? countsRaw.persons ?? root.people, 0)),
    documents: Math.max(0, asNumber(countsRaw.documents ?? root.documents, 0)),
    assets: Math.max(0, asNumber(countsRaw.assets ?? root.assets, 0)),
    tasks: Math.max(0, asNumber(countsRaw.tasks ?? root.tasks, 0)),
    notifications: Math.max(0, asNumber(countsRaw.notifications ?? root.notifications, 0)),
    events: Math.max(0, asNumber(countsRaw.events ?? root.events, 0)),
  };

  const objectsRaw = modelRoot.objects ?? root.objects ?? [];
  const objects: UemObject[] = Array.isArray(objectsRaw)
    ? objectsRaw
        .flatMap((item, index): UemObject[] => {
          if (!item || typeof item !== 'object') return [];
          const row = item as Record<string, unknown>;
          const kindRaw = String(row.kind ?? row.type ?? 'event');
          const kind = (KINDS.includes(kindRaw as UemObjectKind)
            ? kindRaw
            : 'event') as UemObjectKind;
          const name = asString(row.name ?? row.title, '');
          if (!name) return [];
          return [
            {
              id: asString(row.id, `${kind}-${index + 1}`),
              kind,
              name,
              status: asString(row.status, '') || undefined,
              branchId: asString(row.branchId ?? row.branch_id, '') || undefined,
            },
          ];
        })
        .slice(0, 40)
    : [];

  const explicitTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  if (explicitTotal === 0 && objects.length) {
    const fromObjects = emptyUemCounts();
    for (const obj of objects) {
      if (obj.kind === 'branch') fromObjects.branches += 1;
      else if (obj.kind === 'department') fromObjects.departments += 1;
      else if (obj.kind === 'person') fromObjects.people += 1;
      else if (obj.kind === 'document') fromObjects.documents += 1;
      else if (obj.kind === 'asset') fromObjects.assets += 1;
      else if (obj.kind === 'task') fromObjects.tasks += 1;
      else if (obj.kind === 'notification') fromObjects.notifications += 1;
      else if (obj.kind === 'event') fromObjects.events += 1;
    }
    Object.assign(counts, fromObjects);
  }

  const capsRaw = modelRoot.capabilities ?? root.capabilities;
  const capabilities = Array.isArray(capsRaw)
    ? capsRaw.map((c) => asString(c, '')).filter(Boolean).slice(0, 24)
    : opts?.fallbackCapabilities || ['read', 'sync'];

  return {
    version: '1.0',
    sourceSystem:
      asString(modelRoot.sourceSystem ?? root.sourceSystem, '') ||
      opts?.sourceSystem ||
      undefined,
    capabilities,
    counts,
    objects,
  };
}

export function inferUemFromMetrics(input: {
  connectedSystems?: number;
  openAlerts?: number;
  openDecisions?: number;
  sourceSystem?: string;
  timelineLength?: number;
}): UemModel {
  const systems = Math.max(0, input.connectedSystems || 0);
  return {
    version: '1.0',
    sourceSystem: input.sourceSystem,
    capabilities: ['read', 'sync'],
    counts: {
      ...emptyUemCounts(),
      branches: systems > 0 ? Math.min(systems, 8) : 0,
      tasks: Math.max(0, input.openDecisions || 0),
      notifications: Math.max(0, input.openAlerts || 0),
      events: Math.max(0, input.timelineLength || 0),
    },
    objects: [],
  };
}

export function packTimelineStorage(events: TimelineEvent[], model?: UemModel | null) {
  return {
    version: 1 as const,
    events: events.slice(0, 24),
    model: model || null,
  };
}

export function unpackTimelineStorage(raw: unknown): {
  events: TimelineEvent[];
  model: UemModel | null;
} {
  if (Array.isArray(raw)) {
    const events = raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const title = asString(row.title ?? row.name, '');
        const detail = asString(row.detail ?? row.description, '');
        if (!title) return null;
        return { title, detail: detail || title };
      })
      .filter((x): x is TimelineEvent => Boolean(x));
    return { events, model: null };
  }
  if (raw && typeof raw === 'object') {
    const envelope = raw as Record<string, unknown>;
    const eventsRaw = Array.isArray(envelope.events) ? envelope.events : [];
    const events = eventsRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const title = asString(row.title, '');
        const detail = asString(row.detail, '');
        if (!title) return null;
        return { title, detail: detail || title };
      })
      .filter((x): x is TimelineEvent => Boolean(x));
    const model =
      envelope.model && typeof envelope.model === 'object'
        ? normalizeUemModel({ model: envelope.model })
        : null;
    return { events, model };
  }
  return { events: [], model: null };
}
