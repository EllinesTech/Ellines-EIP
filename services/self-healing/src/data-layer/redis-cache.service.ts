/**
 * Redis Cache Service
 *
 * Provides distributed caching operations for EIP 2.0.
 * Requirements: 21.1, 12.2 (distributed caching with invalidation strategies)
 */

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<'OK' | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  pipeline(): RedisPipeline;
  ping(): Promise<string>;
}

export interface RedisPipeline {
  set(key: string, value: string): this;
  setex(key: string, ttl: number, value: string): this;
  del(key: string): this;
  exec(): Promise<Array<[Error | null, unknown]>>;
}

export class RedisCacheService {
  constructor(private readonly client: RedisClient) {}

  /**
   * Get a cached value, parsed from JSON.
   * Returns null on cache miss.
   */
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  /**
   * Set a value with TTL (seconds). Default 300s.
   * Requirement 21.1: Distributed caching.
   */
  async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.client.setex(key, ttlSeconds, serialized);
  }

  /**
   * Delete one or more cache keys.
   * Requirement 21.1: Cache invalidation.
   */
  async invalidate(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  /**
   * Invalidate all keys matching a pattern.
   * Uses tag-based invalidation via Redis sets.
   * Requirement 21.1: Cache invalidation strategies.
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const keys = await this.client.keys(pattern);
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  /**
   * Check whether a key exists in the cache.
   */
  async exists(key: string): Promise<boolean> {
    const count = await this.client.exists(key);
    return count > 0;
  }

  /**
   * Get remaining TTL for a key (seconds). -2 = key not found, -1 = no TTL.
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /**
   * Tag a cache key for bulk invalidation.
   */
  async tagKey(key: string, tag: string): Promise<void> {
    await this.client.sadd(`cache:tag:${tag}`, key);
  }

  /**
   * Invalidate all keys associated with a tag.
   * Requirement 21.1: Event-based cache invalidation.
   */
  async invalidateTag(tag: string): Promise<number> {
    const tagKey = `cache:tag:${tag}`;
    const keys = await this.client.smembers(tagKey);
    if (keys.length === 0) return 0;
    const deleted = await this.client.del(...keys);
    await this.client.del(tagKey);
    return deleted;
  }

  /**
   * Ping Redis to verify connectivity.
   */
  async ping(): Promise<boolean> {
    const response = await this.client.ping();
    return response === 'PONG';
  }
}
