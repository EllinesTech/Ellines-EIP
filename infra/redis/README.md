# Ellines EIP 2.0 — Redis Distributed Cache Setup

## Overview

Redis provides distributed caching for EIP 2.0, supporting:
- High-performance data caching (Requirement 21.1)
- Session management
- Rate limiting enforcement (Requirement B.3.2)
- Real-time pub/sub messaging
- Temporary data storage for workflows

## Architecture

- **Redis 7**: In-memory data store with persistence
- **LRU Eviction**: Automatic eviction of least recently used keys when memory limit reached
- **AOF Persistence**: Append-only file for data durability
- **Configuration**: 256MB max memory with allkeys-lru policy

## Setup Instructions

### 1. Start Redis Container

```bash
# From project root
npm run docker:up

# Or directly:
docker compose -f infra/docker/docker-compose.yml up -d redis
```

### 2. Verify Redis is Running

```bash
# Check container status
docker ps | grep redis

# Check logs
docker logs eip-redis

# Test connection
docker exec eip-redis redis-cli ping
# Expected: PONG
```

### 3. Connect to Redis CLI

```bash
# Interactive CLI
docker exec -it eip-redis redis-cli

# Execute single command
docker exec eip-redis redis-cli INFO
```

## Configuration

Environment variables (in `.env`):

```bash
REDIS_URL=redis://127.0.0.1:6379
REDIS_CLUSTER_ENABLED=false
REDIS_TTL_DEFAULT=3600
```

### Docker Compose Configuration

```yaml
redis:
  image: redis:7-alpine
  container_name: eip-redis
  command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
```

## Key Naming Conventions

Use consistent key naming patterns for easy management:

```
<service>:<resource>:<identifier>:<field>
```

### Examples

```
# User sessions
session:user:usr_123:data

# API rate limiting
ratelimit:org:org_456:endpoint:/api/v1/auth:minute:2024-01-01T10:30
ratelimit:org:org_456:endpoint:/api/v1/auth:hour:2024-01-01T10
ratelimit:org:org_456:endpoint:/api/v1/auth:day:2024-01-01

# Cached query results
cache:query:org_456:dashboard_metrics:v1

# Model orchestrator results
cache:ai:model_decision:query_789

# Knowledge graph entity cache
cache:kg:entity:person_123
cache:kg:relationships:person_123

# Connector sync status
connector:status:conn_456
connector:lock:conn_456

# Self-healing incident tracking
healing:incident:inc_789:status
healing:incident:inc_789:attempts

# Temporary workflow state
workflow:execution:exec_123:state
workflow:execution:exec_123:context
```

## Use Cases

### 1. API Response Caching

```typescript
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Cache API response
async function cacheApiResponse(key: string, data: any, ttl: number = 300) {
  await redis.setex(key, ttl, JSON.stringify(data));
}

// Get cached response
async function getCachedResponse(key: string) {
  const cached = await redis.get(key);
  return cached ? JSON.parse(cached) : null;
}

// Usage
const cacheKey = `cache:query:${orgId}:dashboard_metrics:v1`;
let metrics = await getCachedResponse(cacheKey);

if (!metrics) {
  metrics = await fetchDashboardMetrics(orgId);
  await cacheApiResponse(cacheKey, metrics, 300); // 5 min TTL
}
```

### 2. Rate Limiting

```typescript
// Sliding window rate limit
async function checkRateLimit(
  orgId: string,
  endpoint: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const key = `ratelimit:org:${orgId}:endpoint:${endpoint}`;

  // Remove old entries
  await redis.zremrangebyscore(key, 0, windowStart);

  // Count requests in window
  const count = await redis.zcard(key);

  if (count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  // Add current request
  await redis.zadd(key, now, `${now}`);
  await redis.expire(key, windowSeconds);

  return { allowed: true, remaining: limit - count - 1 };
}

// Usage: 100 requests per minute
const { allowed, remaining } = await checkRateLimit(
  orgId,
  '/api/v1/connectors',
  100,
  60
);

if (!allowed) {
  throw new Error('Rate limit exceeded');
}
```

### 3. Distributed Locking

```typescript
// Acquire lock for connector sync
async function acquireLock(
  resource: string,
  ttl: number = 30
): Promise<boolean> {
  const lockKey = `lock:${resource}`;
  const lockValue = `${Date.now()}`;

  // SET NX (only if not exists) EX (with expiry)
  const result = await redis.set(lockKey, lockValue, 'EX', ttl, 'NX');
  return result === 'OK';
}

// Release lock
async function releaseLock(resource: string): Promise<void> {
  const lockKey = `lock:${resource}`;
  await redis.del(lockKey);
}

// Usage
const lockAcquired = await acquireLock(`connector:sync:${connectorId}`, 60);

if (!lockAcquired) {
  throw new Error('Connector sync already in progress');
}

try {
  await performConnectorSync(connectorId);
} finally {
  await releaseLock(`connector:sync:${connectorId}`);
}
```

### 4. Session Management

```typescript
// Store user session
async function createSession(
  userId: string,
  sessionData: any,
  ttl: number = 86400
): Promise<string> {
  const sessionId = generateSessionId();
  const key = `session:user:${userId}:${sessionId}`;

  await redis.setex(key, ttl, JSON.stringify(sessionData));
  return sessionId;
}

// Get session data
async function getSession(userId: string, sessionId: string) {
  const key = `session:user:${userId}:${sessionId}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

// Extend session TTL
async function extendSession(userId: string, sessionId: string, ttl: number = 86400) {
  const key = `session:user:${userId}:${sessionId}`;
  await redis.expire(key, ttl);
}

// Delete session
async function deleteSession(userId: string, sessionId: string) {
  const key = `session:user:${userId}:${sessionId}`;
  await redis.del(key);
}
```

### 5. Pub/Sub for Real-Time Updates

```typescript
import { Redis } from 'ioredis';

// Publisher
const publisher = new Redis(process.env.REDIS_URL);

// Publish dashboard update
await publisher.publish(
  `dashboard:updates:${orgId}`,
  JSON.stringify({
    widgetId: 'widget_123',
    data: { value: 42 },
    timestamp: new Date().toISOString(),
  })
);

// Subscriber
const subscriber = new Redis(process.env.REDIS_URL);

subscriber.subscribe(`dashboard:updates:${orgId}`);

subscriber.on('message', (channel, message) => {
  const update = JSON.parse(message);
  console.log('Dashboard update:', update);
  // Push to WebSocket clients
});
```

### 6. Cached Aggregations

```typescript
// Cache expensive aggregation results
async function getCachedAggregation(
  key: string,
  fetchFn: () => Promise<any>,
  ttl: number = 300
) {
  // Try cache first
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch and cache
  const data = await fetchFn();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
}

// Usage
const orgMetrics = await getCachedAggregation(
  `cache:metrics:org:${orgId}:summary`,
  async () => {
    return await database.query(`
      SELECT 
        COUNT(DISTINCT users.id) as active_users,
        COUNT(DISTINCT connectors.id) as active_connectors,
        AVG(health_score) as avg_health_score
      FROM organizations
      LEFT JOIN users ON organizations.id = users.organization_id
      LEFT JOIN connector_installations connectors ON organizations.id = connectors.organization_id
      WHERE organizations.id = $1
    `, [orgId]);
  },
  600 // 10 min cache
);
```

## Cache Invalidation Strategies

### 1. Time-Based (TTL)

```typescript
// Automatic expiry after TTL
await redis.setex('cache:key', 300, JSON.stringify(data)); // 5 min
```

### 2. Event-Based

```typescript
// Invalidate when data changes
async function updateUser(userId: string, updates: any) {
  await database.updateUser(userId, updates);

  // Invalidate related caches
  await redis.del(`cache:user:${userId}`);
  await redis.del(`cache:org:${user.organizationId}:users`);
}
```

### 3. Tag-Based (Using Sets)

```typescript
// Track cache keys by tag
async function cacheWithTags(key: string, data: any, tags: string[], ttl: number) {
  // Store data
  await redis.setex(key, ttl, JSON.stringify(data));

  // Add key to tag sets
  for (const tag of tags) {
    await redis.sadd(`cache:tag:${tag}`, key);
  }
}

// Invalidate all caches with a tag
async function invalidateTag(tag: string) {
  const keys = await redis.smembers(`cache:tag:${tag}`);

  if (keys.length > 0) {
    await redis.del(...keys);
  }

  await redis.del(`cache:tag:${tag}`);
}

// Usage
await cacheWithTags(
  `cache:dashboard:${dashboardId}`,
  dashboardData,
  [`org:${orgId}`, `dashboard`, `user:${userId}`],
  300
);

// Invalidate all org caches
await invalidateTag(`org:${orgId}`);
```

## Monitoring

### Check Memory Usage

```bash
docker exec eip-redis redis-cli INFO memory
```

### Monitor Key Statistics

```bash
# Total keys
docker exec eip-redis redis-cli DBSIZE

# Key distribution by pattern
docker exec eip-redis redis-cli --scan --pattern "cache:*" | wc -l
docker exec eip-redis redis-cli --scan --pattern "ratelimit:*" | wc -l
docker exec eip-redis redis-cli --scan --pattern "session:*" | wc -l
```

### Monitor Performance

```bash
# Real-time monitoring
docker exec eip-redis redis-cli MONITOR

# Slow log (queries > 10ms)
docker exec eip-redis redis-cli SLOWLOG GET 10
```

### Check Hit Rate

```bash
docker exec eip-redis redis-cli INFO stats | grep keyspace
```

## Best Practices

### 1. Use Appropriate TTLs

```typescript
// Short TTL for frequently changing data
await redis.setex('cache:realtime:metrics', 10, data); // 10 sec

// Medium TTL for moderate frequency
await redis.setex('cache:dashboard:summary', 300, data); // 5 min

// Long TTL for rarely changing data
await redis.setex('cache:config:org', 3600, data); // 1 hour
```

### 2. Serialize Efficiently

```typescript
// Use JSON for complex objects
await redis.set(key, JSON.stringify(data));

// Use MessagePack for better compression (optional)
import msgpack from 'msgpack-lite';
await redis.set(key, msgpack.encode(data));
```

### 3. Handle Cache Failures Gracefully

```typescript
async function getCachedOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error('Redis get error:', error);
    // Continue to fetch from source
  }

  const data = await fetchFn();

  try {
    await redis.setex(key, 300, JSON.stringify(data));
  } catch (error) {
    console.error('Redis set error:', error);
    // Return data anyway
  }

  return data;
}
```

### 4. Batch Operations

```typescript
// Use pipeline for multiple operations
const pipeline = redis.pipeline();

pipeline.set('key1', 'value1');
pipeline.set('key2', 'value2');
pipeline.set('key3', 'value3');

await pipeline.exec();
```

### 5. Avoid Large Keys

```typescript
// Bad: Store entire dataset in one key
await redis.set(`cache:users:all`, JSON.stringify(allUsers));

// Good: Store as hash with individual fields
for (const user of users) {
  await redis.hset(`cache:users`, user.id, JSON.stringify(user));
}

// Get individual user
const user = await redis.hget(`cache:users`, userId);
```

## Backup & Persistence

### AOF (Append-Only File)

Configured in docker-compose.yml with `--appendonly yes`

```bash
# Trigger manual save
docker exec eip-redis redis-cli BGSAVE

# Check last save time
docker exec eip-redis redis-cli LASTSAVE
```

### Backup

```bash
# Copy RDB snapshot
docker cp eip-redis:/data/dump.rdb ./backups/redis-$(date +%Y%m%d).rdb

# Copy AOF file
docker cp eip-redis:/data/appendonly.aof ./backups/redis-$(date +%Y%m%d).aof
```

### Restore

```bash
# Stop Redis
docker compose -f infra/docker/docker-compose.yml stop redis

# Replace backup files
docker cp ./backups/redis-20240101.rdb eip-redis:/data/dump.rdb
docker cp ./backups/redis-20240101.aof eip-redis:/data/appendonly.aof

# Start Redis
docker compose -f infra/docker/docker-compose.yml start redis
```

## Troubleshooting

### High Memory Usage

1. Check memory stats: `docker exec eip-redis redis-cli INFO memory`
2. Check key count: `docker exec eip-redis redis-cli DBSIZE`
3. Find large keys: `docker exec eip-redis redis-cli --bigkeys`
4. Increase maxmemory or adjust eviction policy in docker-compose.yml

### Connection Issues

1. Check container: `docker ps | grep redis`
2. Check logs: `docker logs eip-redis`
3. Test connection: `docker exec eip-redis redis-cli ping`
4. Check port: `netstat -an | grep 6379`

### Performance Issues

1. Monitor slow queries: `docker exec eip-redis redis-cli SLOWLOG GET 10`
2. Check CPU: `docker stats eip-redis`
3. Review key patterns and data structures
4. Consider connection pooling

## Scaling to Redis Cluster

For production deployments with high availability:

```yaml
# docker-compose.cluster.yml
services:
  redis-node-1:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf
    ports:
      - "7000:6379"

  redis-node-2:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf
    ports:
      - "7001:6379"

  redis-node-3:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf
    ports:
      - "7002:6379"
```

Update `.env`:
```bash
REDIS_CLUSTER_ENABLED=true
REDIS_CLUSTER_NODES=redis-node-1:7000,redis-node-2:7001,redis-node-3:7002
```

## Resources

- [Redis Documentation](https://redis.io/docs/)
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)
- [ioredis Client](https://github.com/luin/ioredis)
- [Redis Data Types](https://redis.io/docs/data-types/)
