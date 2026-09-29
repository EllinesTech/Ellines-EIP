/**
 * CacheService
 *
 * A thin wrapper around RedisService that namespaces all cache keys with
 * the pattern `eip:{orgId}:{domain}:{key}` (Rule §6 — tenant isolation).
 *
 * Usage:
 *   const cached = await cacheService.get('org_abc', 'snapshot', 'summary');
 *   await cacheService.set('org_abc', 'snapshot', 'summary', payload, 300);
 *   await cacheService.del('org_abc', 'snapshot', 'summary');
 *
 * Requirement 22.1: Distributed cache strategy with namespaced keys.
 */

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../database/redis.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  // ---------------------------------------------------------------------------
  // Key helper
  // ---------------------------------------------------------------------------

  /**
   * Build a fully-qualified cache key following `eip:{orgId}:{domain}:{key}`.
   * Pass `'platform'` as orgId for platform-level (shared) keys.
   */
  buildKey(orgId: string, domain: string, key: string): string {
    return this.redis.buildKey(orgId, domain, key);
  }

  // ---------------------------------------------------------------------------
  // Core operations
  // ---------------------------------------------------------------------------

  /**
   * Retrieve a cached value.  Returns `null` on cache miss or when Redis is
   * not configured.
   *
   * @param orgId   Org scope (`'platform'` for shared keys).
   * @param domain  Logical sub-domain, e.g. `'snapshot'`.
   * @param key     Specific key within the domain.
   */
  async get<T = unknown>(orgId: string, domain: string, key: string): Promise<T | null> {
    const raw = await this.redis.get(this.buildKey(orgId, domain, key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.warn(`CacheService.get: JSON parse error for key=${key}`);
      return null;
    }
  }

  /**
   * Store a value in the cache with a TTL (seconds).
   *
   * @param orgId   Org scope.
   * @param domain  Logical sub-domain.
   * @param key     Specific key.
   * @param value   Value to serialise and store.
   * @param ttl     Time-to-live in seconds (default: 300s).
   */
  async set<T = unknown>(
    orgId: string,
    domain: string,
    key: string,
    value: T,
    ttl = 300,
  ): Promise<void> {
    await this.redis.setex(this.buildKey(orgId, domain, key), ttl, JSON.stringify(value));
  }

  /**
   * Delete a cached entry.
   */
  async del(orgId: string, domain: string, key: string): Promise<void> {
    await this.redis.del(this.buildKey(orgId, domain, key));
  }

  /**
   * Get-or-set pattern: return the cached value if it exists, otherwise call
   * `loader()`, cache the result, and return it.
   *
   * @param orgId   Org scope.
   * @param domain  Logical sub-domain.
   * @param key     Specific key.
   * @param loader  Async function that returns the fresh value on cache miss.
   * @param ttl     Cache TTL in seconds (default: 300s).
   */
  async getOrSet<T = unknown>(
    orgId: string,
    domain: string,
    key: string,
    loader: () => Promise<T>,
    ttl = 300,
  ): Promise<T> {
    const cached = await this.get<T>(orgId, domain, key);
    if (cached !== null) return cached;

    const fresh = await loader();
    await this.set(orgId, domain, key, fresh, ttl);
    return fresh;
  }

  /**
   * Invalidate all keys within a domain for an org.
   * Implemented via Redis SCAN + DEL to avoid blocking KEYS.
   *
   * @param orgId   Org scope.
   * @param domain  Domain prefix to clear.
   */
  async clearDomain(orgId: string, domain: string): Promise<number> {
    const pattern = `eip:${orgId}:${domain}:*`;
    return this.redis.clearPattern(pattern);
  }
}
