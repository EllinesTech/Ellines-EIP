/**
 * Integration tests — Redis Cache Service
 *
 * Tests cache read/write, TTL management, invalidation strategies
 * (key-based, pattern-based, tag-based), and pipeline operations.
 *
 * The Redis client is mocked so these tests run without a live Redis instance
 * while still validating the service contract.
 *
 * Requirements: 21.1, 12.2
 */

import { RedisCacheService, RedisClient, RedisPipeline } from './redis-cache.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePipeline(overrides: Partial<RedisPipeline> = {}): RedisPipeline {
  return {
    set: jest.fn().mockReturnThis(),
    setex: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([[null, 'OK']]),
    ...overrides,
  } as unknown as RedisPipeline;
}

function makeRedis(overrides: Partial<RedisClient> = {}): RedisClient {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(-2),
    keys: jest.fn().mockResolvedValue([]),
    sadd: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    pipeline: jest.fn().mockReturnValue(makePipeline()),
    ping: jest.fn().mockResolvedValue('PONG'),
    ...overrides,
  } as unknown as RedisClient;
}

// ─── Ping ─────────────────────────────────────────────────────────────────────

describe('RedisCacheService — ping', () => {
  it('returns true when Redis responds with PONG', async () => {
    const redis = makeRedis({ ping: jest.fn().mockResolvedValue('PONG') });
    const svc = new RedisCacheService(redis);

    expect(await svc.ping()).toBe(true);
  });

  it('returns false when Redis responds with unexpected value', async () => {
    const redis = makeRedis({ ping: jest.fn().mockResolvedValue('ERR') });
    const svc = new RedisCacheService(redis);

    expect(await svc.ping()).toBe(false);
  });
});

// ─── Get / Set ────────────────────────────────────────────────────────────────

describe('RedisCacheService — get', () => {
  it('returns null on cache miss', async () => {
    const redis = makeRedis({ get: jest.fn().mockResolvedValue(null) });
    const svc = new RedisCacheService(redis);

    expect(await svc.get('nonexistent:key')).toBeNull();
  });

  it('deserializes JSON on cache hit', async () => {
    const payload = { userId: 'u1', score: 99 };
    const redis = makeRedis({ get: jest.fn().mockResolvedValue(JSON.stringify(payload)) });
    const svc = new RedisCacheService(redis);

    const result = await svc.get<typeof payload>('some:key');

    expect(result).toEqual(payload);
  });

  it('returns primitive string as-is when JSON parse fails', async () => {
    const redis = makeRedis({ get: jest.fn().mockResolvedValue('plain-string') });
    const svc = new RedisCacheService(redis);

    const result = await svc.get<string>('key');

    expect(result).toBe('plain-string');
  });
});

describe('RedisCacheService — set', () => {
  it('serializes value to JSON with default TTL of 300s', async () => {
    const setexMock = jest.fn().mockResolvedValue('OK');
    const redis = makeRedis({ setex: setexMock });
    const svc = new RedisCacheService(redis);

    await svc.set('cache:org:org1:metrics', { revenue: 12000 });

    expect(setexMock).toHaveBeenCalledWith(
      'cache:org:org1:metrics',
      300,
      JSON.stringify({ revenue: 12000 }),
    );
  });

  it('accepts custom TTL', async () => {
    const setexMock = jest.fn().mockResolvedValue('OK');
    const redis = makeRedis({ setex: setexMock });
    const svc = new RedisCacheService(redis);

    await svc.set('cache:realtime:stats', { count: 5 }, 10);

    expect(setexMock).toHaveBeenCalledWith('cache:realtime:stats', 10, expect.any(String));
  });

  it('stores array values as JSON', async () => {
    const setexMock = jest.fn().mockResolvedValue('OK');
    const redis = makeRedis({ setex: setexMock });
    const svc = new RedisCacheService(redis);

    const data = [{ id: 1 }, { id: 2 }];
    await svc.set('cache:list', data, 60);

    const stored = JSON.parse((setexMock.mock.calls[0] as [string, number, string])[2]);
    expect(stored).toEqual(data);
  });
});

// ─── Invalidation ─────────────────────────────────────────────────────────────

describe('RedisCacheService — invalidate (key-based)', () => {
  it('deletes a single key', async () => {
    const delMock = jest.fn().mockResolvedValue(1);
    const redis = makeRedis({ del: delMock });
    const svc = new RedisCacheService(redis);

    const deleted = await svc.invalidate('cache:user:u1');

    expect(deleted).toBe(1);
    expect(delMock).toHaveBeenCalledWith('cache:user:u1');
  });

  it('deletes multiple keys in one call', async () => {
    const delMock = jest.fn().mockResolvedValue(3);
    const redis = makeRedis({ del: delMock });
    const svc = new RedisCacheService(redis);

    const deleted = await svc.invalidate('key:a', 'key:b', 'key:c');

    expect(deleted).toBe(3);
    expect(delMock).toHaveBeenCalledWith('key:a', 'key:b', 'key:c');
  });

  it('returns 0 when called with no keys', async () => {
    const delMock = jest.fn().mockResolvedValue(0);
    const redis = makeRedis({ del: delMock });
    const svc = new RedisCacheService(redis);

    const deleted = await svc.invalidate();

    expect(deleted).toBe(0);
    expect(delMock).not.toHaveBeenCalled();
  });
});

describe('RedisCacheService — invalidatePattern (pattern-based)', () => {
  it('scans keys by pattern and deletes them', async () => {
    const keysList = ['cache:org:o1:v1', 'cache:org:o1:v2'];
    const delMock = jest.fn().mockResolvedValue(2);
    const redis = makeRedis({
      keys: jest.fn().mockResolvedValue(keysList),
      del: delMock,
    });
    const svc = new RedisCacheService(redis);

    const count = await svc.invalidatePattern('cache:org:o1:*');

    expect(count).toBe(2);
    expect(delMock).toHaveBeenCalledWith(...keysList);
  });

  it('returns 0 when no keys match pattern', async () => {
    const redis = makeRedis({ keys: jest.fn().mockResolvedValue([]) });
    const svc = new RedisCacheService(redis);

    expect(await svc.invalidatePattern('cache:nothing:*')).toBe(0);
  });
});

// ─── Tag-Based Invalidation ───────────────────────────────────────────────────

describe('RedisCacheService — tag-based invalidation', () => {
  it('tagKey adds the key to a tag set', async () => {
    const saddMock = jest.fn().mockResolvedValue(1);
    const redis = makeRedis({ sadd: saddMock });
    const svc = new RedisCacheService(redis);

    await svc.tagKey('cache:dashboard:d1', 'org:org_acme');

    expect(saddMock).toHaveBeenCalledWith('cache:tag:org:org_acme', 'cache:dashboard:d1');
  });

  it('invalidateTag deletes all keys in the tag set and the tag itself', async () => {
    const taggedKeys = ['cache:dashboard:d1', 'cache:dashboard:d2', 'cache:widget:w1'];
    const delMock = jest.fn().mockResolvedValue(taggedKeys.length);
    const redis = makeRedis({
      smembers: jest.fn().mockResolvedValue(taggedKeys),
      del: delMock,
    });
    const svc = new RedisCacheService(redis);

    const deleted = await svc.invalidateTag('org:org_acme');

    // Should delete tagged keys and the tag set itself
    expect(delMock).toHaveBeenCalledTimes(2);
    expect(delMock).toHaveBeenNthCalledWith(1, ...taggedKeys);
    expect(delMock).toHaveBeenNthCalledWith(2, 'cache:tag:org:org_acme');
  });

  it('invalidateTag returns 0 when tag has no keys', async () => {
    const delMock = jest.fn();
    const redis = makeRedis({
      smembers: jest.fn().mockResolvedValue([]),
      del: delMock,
    });
    const svc = new RedisCacheService(redis);

    const deleted = await svc.invalidateTag('empty:tag');

    expect(deleted).toBe(0);
    expect(delMock).not.toHaveBeenCalled();
  });

  it('tag-based invalidation simulates event-driven cache clearing', async () => {
    // Simulate: connector sync completes → invalidate all org cache
    const orgId = 'org_acme';
    const cacheKeys = [
      `cache:org:${orgId}:dashboard`,
      `cache:org:${orgId}:metrics`,
      `cache:org:${orgId}:connectors`,
    ];

    const delMock = jest.fn().mockResolvedValue(cacheKeys.length);
    const redis = makeRedis({
      smembers: jest.fn().mockResolvedValue(cacheKeys),
      del: delMock,
    });
    const svc = new RedisCacheService(redis);

    await svc.invalidateTag(`org:${orgId}`);

    // All org-specific caches are wiped in one operation
    expect(delMock).toHaveBeenNthCalledWith(1, ...cacheKeys);
  });
});

// ─── Exists / TTL ─────────────────────────────────────────────────────────────

describe('RedisCacheService — exists', () => {
  it('returns true when key is present', async () => {
    const redis = makeRedis({ exists: jest.fn().mockResolvedValue(1) });
    const svc = new RedisCacheService(redis);

    expect(await svc.exists('active:key')).toBe(true);
  });

  it('returns false when key is absent', async () => {
    const redis = makeRedis({ exists: jest.fn().mockResolvedValue(0) });
    const svc = new RedisCacheService(redis);

    expect(await svc.exists('gone:key')).toBe(false);
  });
});

describe('RedisCacheService — ttl', () => {
  it('returns remaining TTL for a key', async () => {
    const redis = makeRedis({ ttl: jest.fn().mockResolvedValue(245) });
    const svc = new RedisCacheService(redis);

    expect(await svc.ttl('cache:metric:m1')).toBe(245);
  });

  it('returns -2 for a key that does not exist', async () => {
    const redis = makeRedis({ ttl: jest.fn().mockResolvedValue(-2) });
    const svc = new RedisCacheService(redis);

    expect(await svc.ttl('nonexistent')).toBe(-2);
  });

  it('returns -1 for a key with no TTL set', async () => {
    const redis = makeRedis({ ttl: jest.fn().mockResolvedValue(-1) });
    const svc = new RedisCacheService(redis);

    expect(await svc.ttl('persistent:key')).toBe(-1);
  });
});

// ─── Real-World Integration Scenarios ────────────────────────────────────────

describe('RedisCacheService — integration scenarios', () => {
  it('cache-aside: stores result on miss, returns cached value on second call', async () => {
    const store = new Map<string, string>();
    const redis = makeRedis({
      get: jest.fn().mockImplementation((k: string) => Promise.resolve(store.get(k) ?? null)),
      setex: jest.fn().mockImplementation((_k: string, _ttl: number, v: string) => {
        store.set(_k, v);
        return Promise.resolve('OK' as const);
      }),
    });
    const svc = new RedisCacheService(redis);

    const key = 'cache:query:org1:connectors';
    const payload = { connectors: [{ id: 'c1', status: 'healthy' }] };

    // First call — miss
    const miss = await svc.get<typeof payload>(key);
    expect(miss).toBeNull();

    // Populate cache
    await svc.set(key, payload, 60);

    // Second call — hit
    const hit = await svc.get<typeof payload>(key);
    expect(hit).toEqual(payload);
  });

  it('write-invalidate pattern: update triggers cache deletion', async () => {
    const delMock = jest.fn().mockResolvedValue(1);
    const redis = makeRedis({ del: delMock });
    const svc = new RedisCacheService(redis);

    // Simulate a data update that invalidates related caches
    const orgId = 'org1';
    await svc.invalidate(
      `cache:org:${orgId}:dashboard`,
      `cache:org:${orgId}:metrics`,
    );

    expect(delMock).toHaveBeenCalledWith(
      `cache:org:${orgId}:dashboard`,
      `cache:org:${orgId}:metrics`,
    );
  });

  it('dashboard cache respects short TTL for real-time data', async () => {
    const setexMock = jest.fn().mockResolvedValue('OK' as const);
    const redis = makeRedis({ setex: setexMock });
    const svc = new RedisCacheService(redis);

    // Real-time dashboard widget — 10 second cache
    await svc.set('cache:realtime:widget:w1', { value: 42 }, 10);

    const [, ttl] = setexMock.mock.calls[0] as [string, number, string];
    expect(ttl).toBe(10);
  });

  it('connector lock pattern uses correct key format', async () => {
    const setexMock = jest.fn().mockResolvedValue('OK' as const);
    const redis = makeRedis({ setex: setexMock });
    const svc = new RedisCacheService(redis);

    const connectorId = 'conn_123';
    await svc.set(`connector:lock:${connectorId}`, { lockedAt: new Date().toISOString() }, 30);

    const [key] = setexMock.mock.calls[0] as [string];
    expect(key).toBe('connector:lock:conn_123');
  });
});
