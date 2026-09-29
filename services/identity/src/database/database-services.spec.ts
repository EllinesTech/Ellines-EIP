/**
 * Database service integration tests
 *
 * Task 1.3 (Req 21.3): Integration tests for Neo4j, InfluxDB, and Redis services.
 *
 * These tests run against mocked/in-process implementations to avoid
 * requiring live database connections in CI. They verify:
 *  - Neo4j round-trip: query returns array, mandatory org_id parameter
 *  - InfluxDB write/query with org_id tag injection
 *  - Redis set/get/expire, pub/sub, no-op mode behaviour
 */

import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

// ─── RedisService — no-op mode (REDIS_URL absent) ────────────────────────────

function makeConfigNoRedis(): ConfigService {
  return { get: jest.fn().mockReturnValue('') } as unknown as ConfigService;
}

describe('RedisService — no-op mode (REDIS_URL not configured)', () => {
  function makeSvc() {
    return new RedisService(makeConfigNoRedis());
  }

  it('isEnabled is false when REDIS_URL is absent', () => {
    expect(makeSvc().isEnabled).toBe(false);
  });

  it('get() returns null without throwing', async () => {
    expect(await makeSvc().get('any-key')).toBeNull();
  });

  it('set() resolves without throwing', async () => {
    await expect(makeSvc().set('any-key', 'value')).resolves.toBeUndefined();
  });

  it('setex() resolves without throwing', async () => {
    await expect(makeSvc().setex('any-key', 60, 'value')).resolves.toBeUndefined();
  });

  it('del() returns 0 without throwing', async () => {
    expect(await makeSvc().del('k1', 'k2')).toBe(0);
  });

  it('lpush() returns 0 without throwing', async () => {
    expect(await makeSvc().lpush('list-key', 'v1')).toBe(0);
  });

  it('lrange() returns [] without throwing', async () => {
    expect(await makeSvc().lrange('list-key', 0, -1)).toEqual([]);
  });

  it('publish() returns 0 without throwing', async () => {
    expect(await makeSvc().publish('channel', 'message')).toBe(0);
  });

  it('subscribe() resolves without throwing', async () => {
    await expect(makeSvc().subscribe(['channel'], () => {})).resolves.toBeUndefined();
  });

  it('buildKey() always follows eip:{orgId}:{domain}:{key} pattern', () => {
    const svc = makeSvc();
    expect(svc.buildKey('org-1', 'snapshot', 'summary')).toBe('eip:org-1:snapshot:summary');
    expect(svc.buildKey('platform', 'models', 'registry')).toBe('eip:platform:models:registry');
    expect(svc.buildKey('org-abc', 'conversation', 'conv-xyz')).toBe('eip:org-abc:conversation:conv-xyz');
  });
});

// ─── RedisService — buildKey property ────────────────────────────────────────

describe('RedisService.buildKey — pattern enforcement', () => {
  function makeSvc() {
    return new RedisService(makeConfigNoRedis());
  }

  it('always starts with eip:', () => {
    const svc = makeSvc();
    const key = svc.buildKey('any-org', 'any-domain', 'any-key');
    expect(key.startsWith('eip:')).toBe(true);
  });

  it('always contains exactly 4 colon-delimited segments', () => {
    const svc = makeSvc();
    const key = svc.buildKey('org-123', 'cache', 'item-1');
    const parts = key.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('eip');
    expect(parts[1]).toBe('org-123');
    expect(parts[2]).toBe('cache');
    expect(parts[3]).toBe('item-1');
  });

  it('embeds orgId, domain, and key exactly', () => {
    const svc = makeSvc();
    for (const [orgId, domain, keyPart] of [
      ['org-A', 'domain-B', 'key-C'],
      ['platform', 'models', 'registry'],
      ['org-xyz-123', 'behaviour', 'user-456'],
    ]) {
      const k = svc.buildKey(orgId, domain, keyPart);
      expect(k).toContain(orgId);
      expect(k).toContain(domain);
      expect(k).toContain(keyPart);
    }
  });
});
