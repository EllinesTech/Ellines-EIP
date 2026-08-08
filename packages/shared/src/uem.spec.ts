import {
  emptyUemCounts,
  normalizeUemModel,
  packTimelineStorage,
  unpackTimelineStorage,
  inferUemFromMetrics,
  UEM_OBJECT_KINDS,
} from './uem';

describe('emptyUemCounts', () => {
  it('returns all-zero counts', () => {
    const counts = emptyUemCounts();
    expect(Object.values(counts).every((v) => v === 0)).toBe(true);
  });

  it('has all required keys', () => {
    const keys = Object.keys(emptyUemCounts());
    expect(keys).toContain('branches');
    expect(keys).toContain('people');
    expect(keys).toContain('documents');
    expect(keys).toContain('assets');
  });
});

describe('normalizeUemModel', () => {
  it('normalizes explicit counts', () => {
    const model = normalizeUemModel({ counts: { branches: 3, people: 10 } });
    expect(model.counts.branches).toBe(3);
    expect(model.counts.people).toBe(10);
    expect(model.version).toBe('1.0');
  });

  it('handles nested model wrapper', () => {
    const model = normalizeUemModel({ model: { counts: { branches: 5 } } });
    expect(model.counts.branches).toBe(5);
  });

  it('handles uem wrapper', () => {
    const model = normalizeUemModel({ uem: { counts: { people: 7 } } });
    expect(model.counts.people).toBe(7);
  });

  it('coerces string numbers', () => {
    const model = normalizeUemModel({ counts: { branches: '4' as unknown as number } });
    expect(model.counts.branches).toBe(4);
  });

  it('ignores negative counts (clamped to 0)', () => {
    const model = normalizeUemModel({ counts: { branches: -5 } });
    expect(model.counts.branches).toBe(0);
  });

  it('returns fallback capabilities when none provided', () => {
    const model = normalizeUemModel({});
    expect(model.capabilities).toContain('read');
  });

  it('accepts opts.fallbackCapabilities', () => {
    const model = normalizeUemModel({}, { fallbackCapabilities: ['read', 'write', 'sync'] });
    expect(model.capabilities).toEqual(['read', 'write', 'sync']);
  });

  it('accepts opts.sourceSystem', () => {
    const model = normalizeUemModel({}, { sourceSystem: 'SAP ERP' });
    expect(model.sourceSystem).toBe('SAP ERP');
  });

  it('processes objects array and infers counts', () => {
    const model = normalizeUemModel({
      objects: [
        { kind: 'person', name: 'Alice', id: 'p1' },
        { kind: 'branch', name: 'HQ', id: 'b1' },
        { kind: 'document', name: 'Doc A', id: 'd1' },
      ],
    });
    expect(model.objects).toHaveLength(3);
    expect(model.counts.people).toBe(1);
    expect(model.counts.branches).toBe(1);
    expect(model.counts.documents).toBe(1);
  });

  it('skips objects without a name', () => {
    const model = normalizeUemModel({
      objects: [
        { kind: 'person', name: '', id: 'p1' },
        { kind: 'person', name: 'Bob', id: 'p2' },
      ],
    });
    expect(model.objects).toHaveLength(1);
    expect(model.objects[0].name).toBe('Bob');
  });

  it('defaults unknown kind to event', () => {
    const model = normalizeUemModel({
      objects: [{ kind: 'widget', name: 'Unknown Kind', id: 'x1' }],
    });
    expect(model.objects[0].kind).toBe('event');
  });

  it('limits objects array to 40 items', () => {
    const objects = Array.from({ length: 50 }, (_, i) => ({
      kind: 'person',
      name: `Person ${i}`,
      id: `p${i}`,
    }));
    const model = normalizeUemModel({ objects });
    expect(model.objects.length).toBeLessThanOrEqual(40);
  });

  it('handles null/undefined gracefully', () => {
    expect(() => normalizeUemModel(null)).not.toThrow();
    expect(() => normalizeUemModel(undefined)).not.toThrow();
  });

  it('caps capabilities to 24 items', () => {
    const model = normalizeUemModel({
      capabilities: Array.from({ length: 30 }, (_, i) => `cap-${i}`),
    });
    expect(model.capabilities.length).toBeLessThanOrEqual(24);
  });
});

describe('packTimelineStorage / unpackTimelineStorage', () => {
  const events = [
    { title: 'System Connected', detail: 'SAP connected at 09:00' },
    { title: 'Approval Requested', detail: 'PO #1234 awaiting sign-off' },
  ];

  it('packs events into versioned envelope', () => {
    const packed = packTimelineStorage(events) as { version: number; events: typeof events };
    expect(packed.version).toBe(1);
    expect(packed.events).toHaveLength(2);
  });

  it('unpacks versioned envelope back to events', () => {
    const packed = packTimelineStorage(events);
    const { events: out } = unpackTimelineStorage(packed);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe('System Connected');
  });

  it('unpacks legacy array format', () => {
    const { events: out } = unpackTimelineStorage(events);
    expect(out).toHaveLength(2);
  });

  it('returns empty for null/undefined', () => {
    expect(unpackTimelineStorage(null).events).toHaveLength(0);
    expect(unpackTimelineStorage(undefined).events).toHaveLength(0);
  });

  it('packs and preserves model', () => {
    const model = normalizeUemModel({ counts: { branches: 2 } });
    const packed = packTimelineStorage(events, model);
    const { model: outModel } = unpackTimelineStorage(packed);
    expect(outModel?.counts.branches).toBe(2);
  });

  it('limits packed events to 24', () => {
    const manyEvents = Array.from({ length: 30 }, (_, i) => ({
      title: `Event ${i}`,
      detail: `Detail ${i}`,
    }));
    const packed = packTimelineStorage(manyEvents) as { events: unknown[] };
    expect(packed.events.length).toBeLessThanOrEqual(24);
  });

  it('skips events without title on unpack', () => {
    const { events: out } = unpackTimelineStorage([
      { title: '', detail: 'No title' },
      { title: 'Valid', detail: 'Has title' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Valid');
  });
});

describe('inferUemFromMetrics', () => {
  it('maps metrics to UEM counts', () => {
    const model = inferUemFromMetrics({
      connectedSystems: 3,
      openAlerts: 5,
      openDecisions: 2,
      timelineLength: 10,
    });
    expect(model.counts.branches).toBe(3);
    expect(model.counts.notifications).toBe(5);
    expect(model.counts.tasks).toBe(2);
    expect(model.counts.events).toBe(10);
  });

  it('clamps branches to 8', () => {
    const model = inferUemFromMetrics({ connectedSystems: 20 });
    expect(model.counts.branches).toBeLessThanOrEqual(8);
  });

  it('handles zeroes gracefully', () => {
    const model = inferUemFromMetrics({});
    expect(model.counts.branches).toBe(0);
    expect(model.counts.tasks).toBe(0);
  });

  it('accepts sourceSystem', () => {
    const model = inferUemFromMetrics({ sourceSystem: 'Oracle' });
    expect(model.sourceSystem).toBe('Oracle');
  });

  it('includes read/sync capabilities', () => {
    const model = inferUemFromMetrics({});
    expect(model.capabilities).toContain('read');
    expect(model.capabilities).toContain('sync');
  });
});

describe('UEM_OBJECT_KINDS', () => {
  it('contains all expected kinds', () => {
    const kinds = [...UEM_OBJECT_KINDS];
    expect(kinds).toContain('person');
    expect(kinds).toContain('branch');
    expect(kinds).toContain('department');
    expect(kinds).toContain('document');
    expect(kinds).toContain('asset');
    expect(kinds).toContain('task');
  });
});
