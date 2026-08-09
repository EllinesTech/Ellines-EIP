# Ellines EIP 2.0 — Neo4j Knowledge Graph Setup

## Overview

The Knowledge Graph is a core component of EIP 2.0's Advanced Enterprise Reasoning capability. It stores entities (People, Products, Locations, Events, Documents) and their relationships extracted from all connected System of Record sources.

## Architecture

- **Neo4j Database**: Stores the graph structure (nodes and relationships)
- **PostgreSQL (Prisma)**: Stores metadata about entities and relationships for sync tracking
- **Dual Storage Pattern**: 
  - Neo4j = graph queries, traversal, pattern matching
  - PostgreSQL = entity metadata, sync status, audit trail

## Entity Types

### Core Entity Types (Requirement 17.1)

1. **Person**: People from HR systems, CRM contacts, email participants
2. **Product**: Products, SKUs, inventory items from ERP/inventory systems
3. **Location**: Branches, warehouses, offices, geographic locations
4. **Event**: Business events, meetings, transactions, approvals, alerts
5. **Document**: Invoices, reports, emails, contracts, files

## Relationship Types (Requirement 17.2)

Each relationship includes:
- **confidence**: Float (0.0-1.0) indicating confidence in the relationship
- **evidence**: Array of sources supporting the relationship
- **isInferred**: Boolean (true if inferred by AI, false if explicit)
- **properties**: Additional relationship-specific data

### Common Relationship Types

#### Person Relationships
- `WORKS_AT` → Location/Organization
- `MANAGES` → Person
- `REPORTS_TO` → Person
- `ATTENDED` → Event
- `CREATED` → Document
- `INTERACTED_WITH` → Person/Product

#### Product Relationships
- `PURCHASED_BY` → Person
- `MANUFACTURED_AT` → Location
- `BELONGS_TO_CATEGORY` → Product
- `RELATED_TO` → Product

#### Location Relationships
- `LOCATED_IN` → Location (hierarchical)
- `HOSTS` → Event
- `CONTAINS` → Product/Person

#### Event Relationships
- `OCCURRED_AT` → Location
- `INVOLVED` → Person/Product
- `TRIGGERED` → Event
- `DOCUMENTED_IN` → Document

#### Document Relationships
- `REFERENCES` → Person/Product/Location/Event
- `CREATED_BY` → Person
- `RELATES_TO` → Document

## Setup Instructions

### 1. Start Neo4j Container

```bash
# From project root
npm run docker:up

# Or directly:
docker compose -f infra/docker/docker-compose.yml up -d neo4j
```

### 2. Verify Neo4j is Running

```bash
# Check container status
docker ps | grep neo4j

# Check Neo4j logs
docker logs eip-neo4j

# Neo4j Browser: http://localhost:7474
# Username: neo4j
# Password: eip_neo4j_password
```

### 3. Initialize Schema

The schema initialization happens automatically on first connection through the Knowledge Graph service. Alternatively, run manually:

```bash
# Copy the init script to the Neo4j container
docker cp infra/neo4j/init-schema.cypher eip-neo4j:/tmp/init-schema.cypher

# Execute the script
docker exec eip-neo4j cypher-shell -u neo4j -p eip_neo4j_password -f /tmp/init-schema.cypher
```

### 4. Verify Schema

```cypher
// In Neo4j Browser (http://localhost:7474)

// Show all constraints
SHOW CONSTRAINTS;

// Show all indexes
SHOW INDEXES;

// Test a simple query
MATCH (n) RETURN count(n);
```

## Configuration

Environment variables (in `.env`):

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=eip_neo4j_password
NEO4J_DATABASE=neo4j
```

## Usage Examples

### Creating Entities

```cypher
// Create a Person entity
CREATE (p:Person {
  id: 'person_123',
  organizationId: 'org_456',
  sourceSystem: 'hrms',
  sourceEntityId: 'emp_789',
  name: 'John Doe',
  email: 'john.doe@example.com',
  title: 'Software Engineer',
  department: 'Engineering',
  confidence: 1.0,
  lastSyncedAt: datetime()
})
RETURN p;
```

### Creating Relationships

```cypher
// Create a WORKS_AT relationship
MATCH (p:Person {id: 'person_123'})
MATCH (l:Location {id: 'location_456'})
CREATE (p)-[r:WORKS_AT {
  since: date('2023-01-01'),
  position: 'Software Engineer',
  confidence: 0.95,
  evidence: ['hrms_employee_record'],
  isInferred: false,
  createdAt: datetime()
}]->(l)
RETURN p, r, l;
```

### Multi-Hop Reasoning (Requirement 2.2)

```cypher
// Find all products purchased by colleagues of a person
MATCH (p:Person {id: 'person_123'})-[:WORKS_AT]->(loc:Location)
      <-[:WORKS_AT]-(colleague:Person)-[:PURCHASED]->(product:Product)
WHERE colleague.id <> p.id
RETURN colleague.name, product.name, product.category
LIMIT 10;
```

### Pattern Detection

```cypher
// Find people who attended same events and worked on same products
MATCH (p1:Person)-[:ATTENDED]->(e:Event)<-[:ATTENDED]-(p2:Person),
      (p1)-[:INTERACTED_WITH]->(prod:Product)<-[:INTERACTED_WITH]-(p2)
WHERE p1.id < p2.id
RETURN p1.name, p2.name, count(DISTINCT e) as shared_events, 
       count(DISTINCT prod) as shared_products
ORDER BY shared_events DESC, shared_products DESC
LIMIT 20;
```

## Performance Considerations

### Indexes

All critical properties have indexes for fast lookups:
- Entity IDs (unique constraints)
- Names, emails, SKUs
- Organization IDs (for multi-tenant isolation)
- Timestamps (for temporal queries)
- Confidence scores (for filtering)

### Full-Text Search

Full-text indexes enable natural language search across:
- Person names, emails, titles
- Product names, descriptions, SKUs
- Location names, addresses
- Event titles, descriptions
- Document titles, content

Example:
```cypher
CALL db.index.fulltext.queryNodes('person_search', 'john engineer') 
YIELD node, score
RETURN node.name, node.title, score
ORDER BY score DESC
LIMIT 10;
```

### Query Optimization

1. **Always filter by organizationId** for multi-tenant isolation
2. **Use confidence thresholds** to filter low-quality relationships
3. **Limit traversal depth** to prevent expensive queries
4. **Use EXPLAIN** to analyze query plans

Example with optimizations:
```cypher
// Good: Filtered, limited depth, confidence threshold
MATCH path = (p:Person {organizationId: $orgId})-[r*1..3]-(related)
WHERE p.id = $personId 
  AND all(rel in relationships(path) WHERE rel.confidence > 0.7)
RETURN path
LIMIT 100;
```

## Maintenance

### Backup

```bash
# Backup Neo4j data
docker exec eip-neo4j neo4j-admin database dump neo4j --to-path=/tmp
docker cp eip-neo4j:/tmp/neo4j.dump ./backups/neo4j-$(date +%Y%m%d).dump
```

### Restore

```bash
# Stop Neo4j
docker compose -f infra/docker/docker-compose.yml stop neo4j

# Restore from dump
docker cp ./backups/neo4j-20240101.dump eip-neo4j:/tmp/neo4j.dump
docker exec eip-neo4j neo4j-admin database load neo4j --from-path=/tmp

# Restart Neo4j
docker compose -f infra/docker/docker-compose.yml start neo4j
```

### Monitoring

```cypher
// Check database stats
CALL dbms.listConfig() YIELD name, value
WHERE name STARTS WITH 'dbms.memory'
RETURN name, value;

// Monitor query performance
CALL dbms.listQueries() 
YIELD queryId, query, elapsedTimeMillis, status
RETURN queryId, query, elapsedTimeMillis, status
ORDER BY elapsedTimeMillis DESC;
```

## Troubleshooting

### Cannot Connect to Neo4j

1. Check container is running: `docker ps | grep neo4j`
2. Check logs: `docker logs eip-neo4j`
3. Verify port 7687 is not in use: `netstat -an | grep 7687`
4. Test connection: `docker exec eip-neo4j cypher-shell -u neo4j -p eip_neo4j_password "RETURN 1"`

### Slow Queries

1. Check indexes exist: `SHOW INDEXES;`
2. Use EXPLAIN to analyze: `EXPLAIN MATCH ... RETURN ...`
3. Check memory allocation in docker-compose.yml
4. Consider increasing heap size if needed

### Out of Memory

1. Check current memory: `CALL dbms.listConfig() YIELD name, value WHERE name = 'dbms.memory.heap.max_size' RETURN value;`
2. Increase in docker-compose.yml: `NEO4J_dbms_memory_heap_max__size: 4g`
3. Restart: `docker compose restart neo4j`

## Security Notes

- Default password is for **development only**
- In production:
  - Use strong passwords
  - Enable SSL/TLS for Bolt connections
  - Restrict network access to Neo4j ports
  - Use Neo4j RBAC for multi-tenant isolation
  - Rotate credentials regularly

## Resources

- [Neo4j Documentation](https://neo4j.com/docs/)
- [Cypher Query Language](https://neo4j.com/docs/cypher-manual/)
- [Neo4j APOC Procedures](https://neo4j.com/labs/apoc/)
- [Graph Data Science Library](https://neo4j.com/docs/graph-data-science/)
