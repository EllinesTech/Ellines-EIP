/**
 * Integration tests — Neo4j Knowledge Graph Service
 *
 * Tests Neo4j connection patterns, entity upsert, relationship creation,
 * graph traversal queries, and query performance.
 *
 * The Neo4j driver is mocked so these tests run without a live Neo4j instance
 * while still validating the query contracts and service logic.
 *
 * Requirements: 2.1, 17.1, 17.2, 17.3
 */

import {
  Neo4jGraphService,
  Neo4jDriver,
  Neo4jSession,
  Neo4jQueryResult,
  KnowledgeGraphEntity,
  KnowledgeGraphRelationship,
} from './neo4j-graph.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRecord(data: Record<string, unknown>) {
  return {
    get: (key: string) => data[key],
    keys: Object.keys(data),
    toObject: () => data,
  };
}

function makeQueryResult(records: Array<Record<string, unknown>>, nodesCreated = 0): Neo4jQueryResult {
  return {
    records: records.map(makeRecord),
    summary: {
      counters: {
        nodesCreated: () => nodesCreated,
        nodesDeleted: () => 0,
        relationshipsCreated: () => 0,
        propertiesSet: () => Object.keys(records[0] ?? {}).length,
      },
    },
  };
}

function makeSession(runFn?: jest.Mock): Neo4jSession {
  return {
    run: runFn ?? jest.fn().mockResolvedValue(makeQueryResult([])),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function makeDriver(session?: Neo4jSession): Neo4jDriver {
  const sess = session ?? makeSession();
  return {
    session: jest.fn().mockReturnValue(sess),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

const sampleEntity: KnowledgeGraphEntity = {
  id: 'person_001',
  organizationId: 'org_test',
  type: 'Person',
  sourceSystem: 'hrms',
  sourceEntityId: 'emp_001',
  displayName: 'Alice Mwangi',
  confidence: 0.95,
  properties: { department: 'Engineering', title: 'Senior Engineer' },
};

const sampleRelationship: KnowledgeGraphRelationship = {
  fromId: 'person_001',
  toId: 'location_001',
  type: 'WORKS_AT',
  confidence: 0.9,
  properties: { since: '2022-01-01' },
};

// ─── Connection / Ping ────────────────────────────────────────────────────────

describe('Neo4jGraphService — connection', () => {
  it('ping returns latency in ms', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([{ ping: 1 }]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    const result = await svc.ping();

    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(runMock).toHaveBeenCalledWith('RETURN 1 AS ping');
  });

  it('ping query executes on a fresh session and the session is closed', async () => {
    const closeMock = jest.fn().mockResolvedValue(undefined);
    const session = { run: jest.fn().mockResolvedValue(makeQueryResult([{ ping: 1 }])), close: closeMock };
    const driver = makeDriver(session);
    const svc = new Neo4jGraphService(driver);

    await svc.ping();

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});

// ─── Entity Upsert ────────────────────────────────────────────────────────────

describe('Neo4jGraphService — upsertEntity', () => {
  it('merges a Person node and returns the node id', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([{ nodeId: '4:abc:0' }]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    const { nodeId } = await svc.upsertEntity(sampleEntity);

    expect(nodeId).toBe('4:abc:0');
    expect(runMock).toHaveBeenCalledWith(
      expect.stringContaining('MERGE (e:Person {id: $id})'),
      expect.objectContaining({
        id: 'person_001',
        props: expect.objectContaining({
          organizationId: 'org_test',
          sourceSystem: 'hrms',
          confidence: 0.95,
        }),
      }),
    );
  });

  it('includes entity type label in the Cypher query', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([{ nodeId: '1' }]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    await svc.upsertEntity({ ...sampleEntity, type: 'Product' });

    const [query] = runMock.mock.calls[0] as [string, unknown];
    expect(query).toContain('MERGE (e:Product {id: $id})');
  });

  it('includes additional properties in the MERGE params', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([{ nodeId: '2' }]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    await svc.upsertEntity({
      ...sampleEntity,
      properties: { sku: 'PROD-001', category: 'Electronics' },
    });

    const [, params] = runMock.mock.calls[0] as [string, { props: Record<string, unknown> }];
    expect(params.props['sku']).toBe('PROD-001');
    expect(params.props['category']).toBe('Electronics');
  });

  it('closes the session after upsert', async () => {
    const closeMock = jest.fn().mockResolvedValue(undefined);
    const session = {
      run: jest.fn().mockResolvedValue(makeQueryResult([{ nodeId: '1' }])),
      close: closeMock,
    };
    const driver = makeDriver(session);
    const svc = new Neo4jGraphService(driver);

    await svc.upsertEntity(sampleEntity);

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('supports all five entity types', async () => {
    const entityTypes: KnowledgeGraphEntity['type'][] = [
      'Person', 'Product', 'Location', 'Event', 'Document',
    ];

    for (const type of entityTypes) {
      const runMock = jest.fn().mockResolvedValue(makeQueryResult([{ nodeId: `node-${type}` }]));
      const driver = makeDriver(makeSession(runMock));
      const svc = new Neo4jGraphService(driver);

      const result = await svc.upsertEntity({ ...sampleEntity, type });

      expect(result.nodeId).toBe(`node-${type}`);
      const [query] = runMock.mock.calls[0] as [string];
      expect(query).toContain(`MERGE (e:${type}`);
    }
  });
});

// ─── Relationship Creation ─────────────────────────────────────────────────────

describe('Neo4jGraphService — createRelationship', () => {
  it('creates a WORKS_AT relationship between two nodes', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    await svc.createRelationship(sampleRelationship);

    expect(runMock).toHaveBeenCalledWith(
      expect.stringContaining('MERGE (from)-[r:WORKS_AT]->(to)'),
      expect.objectContaining({
        fromId: 'person_001',
        toId: 'location_001',
        props: expect.objectContaining({ confidence: 0.9 }),
      }),
    );
  });

  it('includes relationship-specific properties in params', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    await svc.createRelationship({
      ...sampleRelationship,
      properties: { since: '2023-06-01', department: 'Finance' },
    });

    const [, params] = runMock.mock.calls[0] as [string, { props: Record<string, unknown> }];
    expect(params.props['since']).toBe('2023-06-01');
    expect(params.props['department']).toBe('Finance');
  });

  it('closes the session after relationship creation', async () => {
    const closeMock = jest.fn().mockResolvedValue(undefined);
    const session = { run: jest.fn().mockResolvedValue(makeQueryResult([])), close: closeMock };
    const driver = makeDriver(session);
    const svc = new Neo4jGraphService(driver);

    await svc.createRelationship(sampleRelationship);

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});

// ─── Entity Query ─────────────────────────────────────────────────────────────

describe('Neo4jGraphService — queryEntitiesByType', () => {
  it('returns mapped entities from query results', async () => {
    const personData = {
      e: {
        id: 'person_001',
        organizationId: 'org_test',
        sourceSystem: 'hrms',
        sourceEntityId: 'emp_001',
        displayName: 'Alice Mwangi',
        confidence: 0.95,
      },
    };
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([personData]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    const entities = await svc.queryEntitiesByType('Person', 'org_test');

    expect(entities).toHaveLength(1);
    expect(entities[0].id).toBe('person_001');
    expect(entities[0].displayName).toBe('Alice Mwangi');
    expect(entities[0].confidence).toBe(0.95);
    expect(entities[0].type).toBe('Person');
  });

  it('returns empty array when no entities match', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    const entities = await svc.queryEntitiesByType('Event', 'org_empty');

    expect(entities).toEqual([]);
  });

  it('passes limit to the Cypher query', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    await svc.queryEntitiesByType('Product', 'org_test', 25);

    const [, params] = runMock.mock.calls[0] as [string, { limit: number }];
    expect(params.limit).toBe(25);
  });

  it('filters by organizationId in the query', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    await svc.queryEntitiesByType('Location', 'org_acme');

    const [, params] = runMock.mock.calls[0] as [string, { orgId: string }];
    expect(params.orgId).toBe('org_acme');
  });
});

// ─── Graph Traversal ──────────────────────────────────────────────────────────

describe('Neo4jGraphService — traverseRelationships', () => {
  it('returns traversal paths from start node', async () => {
    const runMock = jest.fn().mockResolvedValue(
      makeQueryResult([
        { nodeIds: ['person_001', 'location_001'], relTypes: ['WORKS_AT'] },
        { nodeIds: ['person_001', 'org_001', 'location_001'], relTypes: ['BELONGS_TO', 'LOCATED_IN'] },
      ]),
    );
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    const result = await svc.traverseRelationships('person_001', 3);

    expect(result.paths).toHaveLength(2);
    expect(result.paths[0].nodes).toEqual(['person_001', 'location_001']);
    expect(result.paths[0].relationships).toEqual(['WORKS_AT']);
  });

  it('includes maxHops in the Cypher pattern', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    await svc.traverseRelationships('node_x', 3);

    const [query] = runMock.mock.calls[0] as [string];
    expect(query).toContain('[*1..3]');
  });

  it('supports 3+ hop traversal as required by multi-hop reasoning', async () => {
    const runMock = jest.fn().mockResolvedValue(
      makeQueryResult([
        {
          nodeIds: ['n1', 'n2', 'n3', 'n4'],
          relTypes: ['REL_A', 'REL_B', 'REL_C'],
        },
      ]),
    );
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    const result = await svc.traverseRelationships('n1', 5);

    // Path has 4 nodes = 3 hops, satisfying Requirement 2.2
    expect(result.paths[0].nodes).toHaveLength(4);
    expect(result.paths[0].relationships).toHaveLength(3);
  });

  it('returns empty paths array when no traversal found', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    const result = await svc.traverseRelationships('isolated_node', 3);

    expect(result.paths).toEqual([]);
  });

  it('closes the session after traversal', async () => {
    const closeMock = jest.fn().mockResolvedValue(undefined);
    const session = { run: jest.fn().mockResolvedValue(makeQueryResult([])), close: closeMock };
    const driver = makeDriver(session);
    const svc = new Neo4jGraphService(driver);

    await svc.traverseRelationships('person_001', 3);

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});

// ─── Query Performance ────────────────────────────────────────────────────────

describe('Neo4jGraphService — query performance', () => {
  it('upsert completes within acceptable latency (mocked)', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([{ nodeId: '1' }]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    const start = Date.now();
    await svc.upsertEntity(sampleEntity);
    const elapsed = Date.now() - start;

    // Should complete almost instantly with a mocked driver
    expect(elapsed).toBeLessThan(100);
  });

  it('batch of 10 entity upserts all succeed', async () => {
    const runMock = jest.fn().mockResolvedValue(makeQueryResult([{ nodeId: '1' }]));
    const driver = makeDriver(makeSession(runMock));
    const svc = new Neo4jGraphService(driver);

    const upserts = Array.from({ length: 10 }, (_, i) =>
      svc.upsertEntity({ ...sampleEntity, id: `entity_${i}`, sourceEntityId: `src_${i}` }),
    );

    const results = await Promise.all(upserts);

    expect(results).toHaveLength(10);
    results.forEach((r) => expect(r.nodeId).toBeDefined());
    expect(runMock).toHaveBeenCalledTimes(10);
  });
});
