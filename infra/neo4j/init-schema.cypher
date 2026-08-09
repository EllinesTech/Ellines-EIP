// Ellines EIP 2.0 — Neo4j Knowledge Graph Schema Initialization
// This script defines constraints, indexes, and core entity types for the knowledge graph.

// ─── Entity Type Constraints ─────────────────────────────────────────────────

// Person entity
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT person_source_id IF NOT EXISTS FOR (p:Person) REQUIRE (p.sourceSystem, p.sourceEntityId) IS UNIQUE;

// Product entity
CREATE CONSTRAINT product_id IF NOT EXISTS FOR (p:Product) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT product_source_id IF NOT EXISTS FOR (p:Product) REQUIRE (p.sourceSystem, p.sourceEntityId) IS UNIQUE;

// Location entity
CREATE CONSTRAINT location_id IF NOT EXISTS FOR (l:Location) REQUIRE l.id IS UNIQUE;
CREATE CONSTRAINT location_source_id IF NOT EXISTS FOR (l:Location) REQUIRE (l.sourceSystem, l.sourceEntityId) IS UNIQUE;

// Event entity
CREATE CONSTRAINT event_id IF NOT EXISTS FOR (e:Event) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT event_source_id IF NOT EXISTS FOR (e:Event) REQUIRE (e.sourceSystem, e.sourceEntityId) IS UNIQUE;

// Document entity
CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE;
CREATE CONSTRAINT document_source_id IF NOT EXISTS FOR (d:Document) REQUIRE (d.sourceSystem, d.sourceEntityId) IS UNIQUE;

// ─── Performance Indexes ─────────────────────────────────────────────────────

// Person indexes
CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.name);
CREATE INDEX person_email IF NOT EXISTS FOR (p:Person) ON (p.email);
CREATE INDEX person_org IF NOT EXISTS FOR (p:Person) ON (p.organizationId);
CREATE INDEX person_confidence IF NOT EXISTS FOR (p:Person) ON (p.confidence);

// Product indexes
CREATE INDEX product_name IF NOT EXISTS FOR (p:Product) ON (p.name);
CREATE INDEX product_sku IF NOT EXISTS FOR (p:Product) ON (p.sku);
CREATE INDEX product_category IF NOT EXISTS FOR (p:Product) ON (p.category);
CREATE INDEX product_org IF NOT EXISTS FOR (p:Product) ON (p.organizationId);

// Location indexes
CREATE INDEX location_name IF NOT EXISTS FOR (l:Location) ON (l.name);
CREATE INDEX location_type IF NOT EXISTS FOR (l:Location) ON (l.locationType);
CREATE INDEX location_org IF NOT EXISTS FOR (l:Location) ON (l.organizationId);

// Event indexes
CREATE INDEX event_type IF NOT EXISTS FOR (e:Event) ON (e.eventType);
CREATE INDEX event_timestamp IF NOT EXISTS FOR (e:Event) ON (e.timestamp);
CREATE INDEX event_org IF NOT EXISTS FOR (e:Event) ON (e.organizationId);

// Document indexes
CREATE INDEX document_title IF NOT EXISTS FOR (d:Document) ON (d.title);
CREATE INDEX document_type IF NOT EXISTS FOR (d:Document) ON (d.documentType);
CREATE INDEX document_org IF NOT EXISTS FOR (d:Document) ON (d.organizationId);

// ─── Relationship Type Definitions ───────────────────────────────────────────
// Note: Neo4j doesn't enforce relationship types, but we document them here
// Actual relationships will be created with these types during entity extraction

// Person relationships:
// - WORKS_AT → Location/Organization
// - MANAGES → Person
// - REPORTS_TO → Person
// - ATTENDED → Event
// - CREATED → Document
// - INTERACTED_WITH → Person/Product

// Product relationships:
// - PURCHASED_BY → Person
// - MANUFACTURED_AT → Location
// - BELONGS_TO_CATEGORY → Product (category)
// - RELATED_TO → Product

// Location relationships:
// - LOCATED_IN → Location (hierarchical)
// - HOSTS → Event
// - CONTAINS → Product/Person

// Event relationships:
// - OCCURRED_AT → Location
// - INVOLVED → Person/Product
// - TRIGGERED → Event
// - DOCUMENTED_IN → Document

// Document relationships:
// - REFERENCES → Person/Product/Location/Event
// - CREATED_BY → Person
// - RELATES_TO → Document

// ─── Full-text Search Indexes ────────────────────────────────────────────────

// Person full-text search
CREATE FULLTEXT INDEX person_search IF NOT EXISTS FOR (p:Person) ON EACH [p.name, p.email, p.title, p.department];

// Product full-text search
CREATE FULLTEXT INDEX product_search IF NOT EXISTS FOR (p:Product) ON EACH [p.name, p.description, p.sku, p.category];

// Location full-text search
CREATE FULLTEXT INDEX location_search IF NOT EXISTS FOR (l:Location) ON EACH [l.name, l.address, l.city, l.country];

// Event full-text search
CREATE FULLTEXT INDEX event_search IF NOT EXISTS FOR (e:Event) ON EACH [e.title, e.description, e.eventType];

// Document full-text search
CREATE FULLTEXT INDEX document_search IF NOT EXISTS FOR (d:Document) ON EACH [d.title, d.content, d.summary, d.documentType];

// ─── Sample Entity Property Schema ───────────────────────────────────────────
// These are the expected properties for each entity type

/*
Person:
  - id: String (required, unique)
  - organizationId: String (required)
  - sourceSystem: String (required)
  - sourceEntityId: String (required)
  - name: String (required)
  - email: String (optional)
  - title: String (optional)
  - department: String (optional)
  - phone: String (optional)
  - avatarUrl: String (optional)
  - confidence: Float (0.0-1.0, default 1.0)
  - lastSyncedAt: DateTime (required)
  - metadata: Map (additional properties)

Product:
  - id: String (required, unique)
  - organizationId: String (required)
  - sourceSystem: String (required)
  - sourceEntityId: String (required)
  - name: String (required)
  - sku: String (optional)
  - description: String (optional)
  - category: String (optional)
  - price: Float (optional)
  - currency: String (optional)
  - imageUrl: String (optional)
  - confidence: Float (0.0-1.0, default 1.0)
  - lastSyncedAt: DateTime (required)
  - metadata: Map (additional properties)

Location:
  - id: String (required, unique)
  - organizationId: String (required)
  - sourceSystem: String (required)
  - sourceEntityId: String (required)
  - name: String (required)
  - locationType: String (branch, warehouse, office, region, country)
  - address: String (optional)
  - city: String (optional)
  - state: String (optional)
  - country: String (optional)
  - postalCode: String (optional)
  - latitude: Float (optional)
  - longitude: Float (optional)
  - confidence: Float (0.0-1.0, default 1.0)
  - lastSyncedAt: DateTime (required)
  - metadata: Map (additional properties)

Event:
  - id: String (required, unique)
  - organizationId: String (required)
  - sourceSystem: String (required)
  - sourceEntityId: String (required)
  - title: String (required)
  - eventType: String (meeting, transaction, approval, alert, etc.)
  - description: String (optional)
  - timestamp: DateTime (required)
  - duration: Integer (optional, in minutes)
  - status: String (optional)
  - confidence: Float (0.0-1.0, default 1.0)
  - lastSyncedAt: DateTime (required)
  - metadata: Map (additional properties)

Document:
  - id: String (required, unique)
  - organizationId: String (required)
  - sourceSystem: String (required)
  - sourceEntityId: String (required)
  - title: String (required)
  - documentType: String (invoice, report, email, contract, etc.)
  - content: String (optional, full text)
  - summary: String (optional)
  - author: String (optional)
  - createdDate: DateTime (optional)
  - fileUrl: String (optional)
  - mimeType: String (optional)
  - confidence: Float (0.0-1.0, default 1.0)
  - lastSyncedAt: DateTime (required)
  - metadata: Map (additional properties)
*/

// ─── Relationship Properties Schema ──────────────────────────────────────────
/*
All relationships should include:
  - confidence: Float (0.0-1.0, how confident we are in this relationship)
  - evidence: List<String> (sources that support this relationship)
  - isInferred: Boolean (true if inferred, false if explicit from source)
  - createdAt: DateTime
  - lastVerifiedAt: DateTime (optional)

Examples:
  WORKS_AT: { since: DateTime, position: String, department: String, confidence: 0.9 }
  PURCHASED_BY: { date: DateTime, quantity: Integer, amount: Float, confidence: 1.0 }
  ATTENDED: { role: String, duration: Integer, confidence: 0.85 }
*/
