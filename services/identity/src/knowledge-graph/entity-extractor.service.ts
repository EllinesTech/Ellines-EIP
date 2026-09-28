import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Neo4jService } from '../database/neo4j.service';
import { KnowledgeGraphEntity } from '@prisma/client';

// ─── Entity Types ────────────────────────────────────────────────────────────

export type EntityType = 'person' | 'product' | 'location' | 'event' | 'document';

export interface EntityCandidate {
  entityType: EntityType;
  sourceSystem: string;
  sourceEntityId: string;
  displayName: string;
  properties: Record<string, unknown>;
  confidence: number;
}

// ─── Field mapping heuristics ────────────────────────────────────────────────

/**
 * Ordered list of field mappings for each entity type.
 * A record is classified as that type when it has at least `minFieldsRequired`
 * of the listed keys present (case-insensitive key scan).
 */
const ENTITY_FIELD_MAPPINGS: {
  type: EntityType;
  identifierFields: string[];   // candidate fields for sourceEntityId
  nameFields: string[];         // candidate fields for displayName
  signatureFields: string[];    // fields that identify this entity type
  minSignatureFields: number;
}[] = [
  {
    type: 'person',
    identifierFields: ['employeeId', 'employee_id', 'userId', 'user_id', 'id', 'contactId'],
    nameFields: ['name', 'fullName', 'full_name', 'displayName', 'display_name', 'firstName', 'first_name'],
    signatureFields: ['firstName', 'first_name', 'lastName', 'last_name', 'email', 'employeeId', 'employee_id'],
    minSignatureFields: 2,
  },
  {
    type: 'product',
    identifierFields: ['productId', 'product_id', 'sku', 'id'],
    nameFields: ['productName', 'product_name', 'name', 'title', 'displayName'],
    signatureFields: ['productId', 'product_id', 'sku', 'productName', 'product_name', 'category'],
    minSignatureFields: 2,
  },
  {
    type: 'location',
    identifierFields: ['locationId', 'location_id', 'id', 'placeId'],
    nameFields: ['name', 'city', 'address', 'displayName'],
    signatureFields: ['address', 'city', 'country', 'coordinates', 'latitude', 'longitude', 'postalCode', 'postal_code'],
    minSignatureFields: 2,
  },
  {
    type: 'event',
    identifierFields: ['eventId', 'event_id', 'id', 'actionId'],
    nameFields: ['eventType', 'event_type', 'actionType', 'action_type', 'name'],
    signatureFields: ['eventType', 'event_type', 'actionType', 'action_type', 'timestamp', 'occurredAt', 'occurred_at'],
    minSignatureFields: 2,
  },
  {
    type: 'document',
    identifierFields: ['documentId', 'document_id', 'fileId', 'file_id', 'id'],
    nameFields: ['title', 'name', 'fileName', 'file_name', 'displayName'],
    signatureFields: ['documentId', 'document_id', 'title', 'fileType', 'file_type', 'path', 'mimeType'],
    minSignatureFields: 2,
  },
];

// ─── NLP keyword signals per entity type ─────────────────────────────────────

const NLP_KEYWORDS: Record<EntityType, string[]> = {
  person: ['employee', 'user', 'contact', 'staff', 'manager', 'admin', 'member', 'person', 'individual'],
  product: ['product', 'item', 'sku', 'catalogue', 'catalog', 'inventory', 'good', 'service'],
  location: ['location', 'address', 'city', 'country', 'region', 'site', 'branch', 'office', 'warehouse'],
  event: ['event', 'action', 'activity', 'log', 'audit', 'transaction', 'change', 'trigger', 'occurrence'],
  document: ['document', 'file', 'report', 'invoice', 'contract', 'attachment', 'record', 'form'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseKeys(record: Record<string, unknown>): Record<string, unknown> {
  // Return a version with all keys lowercased for case-insensitive matching
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function pickField(
  record: Record<string, unknown>,
  candidates: string[],
): string | undefined {
  const lowered = normaliseKeys(record);
  for (const field of candidates) {
    const val = lowered[field.toLowerCase()];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val);
    }
  }
  return undefined;
}

function countSignatureFields(
  record: Record<string, unknown>,
  signatureFields: string[],
): number {
  const lowered = normaliseKeys(record);
  return signatureFields.filter(
    (f) => lowered[f.toLowerCase()] !== undefined && lowered[f.toLowerCase()] !== null,
  ).length;
}

/**
 * NLP boost: scan string values of a record for keywords associated with
 * each entity type.  Returns the entity type with the highest keyword hit
 * count, or null if no significant signal is found.
 */
function nlpEntityTypeHint(record: Record<string, unknown>): EntityType | null {
  const text = Object.values(record)
    .map((v) => (typeof v === 'string' ? v.toLowerCase() : ''))
    .join(' ');

  let bestType: EntityType | null = null;
  let bestScore = 0;

  for (const [type, keywords] of Object.entries(NLP_KEYWORDS) as [EntityType, string[]][]) {
    const score = keywords.filter((kw) => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  return bestScore > 0 ? bestType : null;
}

/**
 * Derive a confidence score based on how many signature fields matched and
 * whether an NLP hint corroborates the classification.
 */
function deriveConfidence(
  matchedFields: number,
  totalSignatureFields: number,
  nlpCorroborates: boolean,
): number {
  const fieldRatio = Math.min(matchedFields / Math.max(totalSignatureFields, 1), 1);
  const base = 0.5 + fieldRatio * 0.4; // 0.5 → 0.9 range from field matching
  return Math.min(base + (nlpCorroborates ? 0.1 : 0), 1.0);
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * EntityExtractorService
 *
 * Extracts entities (Person | Product | Location | Event | Document) from
 * connector installation data payloads and persists them to both Neo4j and the
 * `KnowledgeGraphEntity` PostgreSQL metadata table.
 *
 * Neo4j graceful-fallback behaviour
 * ──────────────────────────────────
 * If Neo4j is unavailable (connection error), the service logs a warning and
 * continues with PostgreSQL-only persistence.  It never throws on Neo4j
 * connection failure.
 */
@Injectable()
export class EntityExtractorService {
  private readonly logger = new Logger(EntityExtractorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly neo4j: Neo4jService,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Main entry point.  Loads all active connector installations for the org,
   * extracts entities from each `lastPayload`, and persists to Neo4j + Postgres.
   *
   * @param orgId      The organization to process.
   * @param snapshotId An `EnterpriseSnapshot.id` used for audit / tracing (informational only).
   * @returns          The upserted `KnowledgeGraphEntity` records.
   */
  async extractEntities(
    orgId: string,
    snapshotId: string,
  ): Promise<KnowledgeGraphEntity[]> {
    this.logger.log(`Extracting entities for org=${orgId} snapshot=${snapshotId}`);

    // Load all active connector installations for this org
    const connectors = await this.prisma.connectorInstallation.findMany({
      where: {
        organizationId: orgId,
        status: { not: 'deleted' },
      },
      select: {
        id: true,
        displayName: true,
        lastPayload: true,
        catalogId: true,
      },
    });

    this.logger.log(`Found ${connectors.length} connector(s) for org=${orgId}`);

    const allCandidates: EntityCandidate[] = [];

    for (const connector of connectors) {
      const sourceSystem = connector.displayName ?? connector.catalogId ?? connector.id;
      const payload = connector.lastPayload;

      if (!payload) {
        this.logger.debug(`Connector ${connector.id} has no lastPayload — skipping`);
        continue;
      }

      const records = this.extractRecordsFromPayload(payload as Record<string, unknown>);

      for (const record of records) {
        const candidates = this.extractFromRecord(record, sourceSystem, orgId);
        allCandidates.push(...candidates);
      }
    }

    this.logger.log(`Extracted ${allCandidates.length} entity candidate(s) from org=${orgId}`);

    if (allCandidates.length === 0) {
      return [];
    }

    await this.upsertToGraph(allCandidates, orgId);

    // Return the freshly upserted records from Postgres
    return this.prisma.knowledgeGraphEntity.findMany({
      where: {
        organizationId: orgId,
        syncStatus: 'active',
      },
    });
  }

  /**
   * Classify and extract entity candidates from a single source record.
   *
   * Uses structured field mapping first; falls back to NLP keyword detection
   * when no structural match is found.
   *
   * @param record        A flat or shallow-nested data record from a connector.
   * @param sourceSystem  The connector display name / catalog ID.
   * @param orgId         The owning organization (used only if caller needs it;
   *                      not stored in the returned candidate — `orgId` is added
   *                      during persistence).
   */
  extractFromRecord(
    record: Record<string, unknown>,
    sourceSystem: string,
    orgId: string,
  ): EntityCandidate[] {
    // Suppress unused orgId lint warning — callers may use this parameter
    void orgId;

    const candidates: EntityCandidate[] = [];

    for (const mapping of ENTITY_FIELD_MAPPINGS) {
      const matchedFields = countSignatureFields(record, mapping.signatureFields);
      if (matchedFields < mapping.minSignatureFields) {
        continue;
      }

      // Derive a stable sourceEntityId
      const sourceEntityId =
        pickField(record, mapping.identifierFields) ??
        pickField(record, ['id', '_id', 'uuid']) ??
        `${sourceSystem}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Derive display name
      const displayName =
        pickField(record, mapping.nameFields) ??
        pickField(record, ['name', 'title', 'label', 'description']) ??
        `${mapping.type}:${sourceEntityId}`;

      const nlpHint = nlpEntityTypeHint(record);
      const nlpCorroborates = nlpHint === mapping.type;
      const confidence = deriveConfidence(
        matchedFields,
        mapping.signatureFields.length,
        nlpCorroborates,
      );

      candidates.push({
        entityType: mapping.type,
        sourceSystem,
        sourceEntityId,
        displayName,
        confidence,
        properties: { ...record },
      });

      // Only classify a record as one entity type (first structural match wins)
      break;
    }

    // NLP fallback: if no structural match was found, try NLP-only
    if (candidates.length === 0) {
      const nlpType = nlpEntityTypeHint(record);
      if (nlpType) {
        const mapping = ENTITY_FIELD_MAPPINGS.find((m) => m.type === nlpType)!;
        const sourceEntityId =
          pickField(record, mapping.identifierFields) ??
          pickField(record, ['id', '_id', 'uuid']) ??
          `${sourceSystem}-nlp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const displayName =
          pickField(record, mapping.nameFields) ??
          pickField(record, ['name', 'title', 'label']) ??
          `${nlpType}:${sourceEntityId}`;

        candidates.push({
          entityType: nlpType,
          sourceSystem,
          sourceEntityId,
          displayName,
          confidence: 0.5, // Lower confidence for NLP-only classification
          properties: { ...record },
        });
      }
    }

    return candidates;
  }

  /**
   * Persist entity candidates to Neo4j (with graceful fallback) and upsert
   * metadata into the `KnowledgeGraphEntity` Postgres table.
   *
   * Every Neo4j node receives an `organization_id` property for tenant isolation.
   *
   * @param entities  Extracted entity candidates.
   * @param orgId     The owning organization.
   */
  async upsertToGraph(entities: EntityCandidate[], orgId: string): Promise<void> {
    // ── Step 1: Attempt Neo4j writes ──────────────────────────────────────────
    const neo4jNodeMap = await this.upsertToNeo4j(entities, orgId);

    // ── Step 2: Upsert metadata into Postgres ─────────────────────────────────
    const now = new Date();

    for (const entity of entities) {
      const neo4jNodeId = neo4jNodeMap.get(entityKey(entity)) ?? `pending-${Date.now()}`;

      try {
        await this.prisma.knowledgeGraphEntity.upsert({
          where: {
            organizationId_sourceSystem_sourceEntityId: {
              organizationId: orgId,
              sourceSystem: entity.sourceSystem,
              sourceEntityId: entity.sourceEntityId,
            },
          },
          create: {
            organizationId: orgId,
            entityType: entity.entityType,
            neo4jNodeId,
            sourceSystem: entity.sourceSystem,
            sourceEntityId: entity.sourceEntityId,
            displayName: entity.displayName,
            confidence: entity.confidence,
            lastSyncedAt: now,
            syncStatus: 'active',
          },
          update: {
            entityType: entity.entityType,
            neo4jNodeId,
            displayName: entity.displayName,
            confidence: entity.confidence,
            lastSyncedAt: now,
            syncStatus: 'active',
          },
        });
      } catch (err) {
        this.logger.error(
          `Failed to upsert entity ${entity.sourceEntityId} (${entity.entityType}) into Postgres: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`Upserted ${entities.length} entity/entities to Postgres for org=${orgId}`);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Write entity nodes to Neo4j using MERGE so re-runs are idempotent.
   *
   * Returns a map of `${entityType}:${sourceSystem}:${sourceEntityId}` → Neo4j node ID string.
   * On Neo4j connection failure, logs a warning and returns an empty map so
   * callers fall back to Postgres-only mode.
   */
  private async upsertToNeo4j(
    entities: EntityCandidate[],
    orgId: string,
  ): Promise<Map<string, string>> {
    const nodeIdMap = new Map<string, string>();

    try {
      for (const entity of entities) {
        const cypher = `
          MERGE (n:${capitalise(entity.entityType)} {
            source_system:    $sourceSystem,
            source_entity_id: $sourceEntityId,
            organization_id:  $orgId
          })
          ON CREATE SET
            n.display_name  = $displayName,
            n.confidence    = $confidence,
            n.created_at    = datetime(),
            n.updated_at    = datetime()
          ON MATCH SET
            n.display_name  = $displayName,
            n.confidence    = $confidence,
            n.updated_at    = datetime()
          RETURN elementId(n) AS nodeId
        `;

        const params = {
          sourceSystem:    entity.sourceSystem,
          sourceEntityId:  entity.sourceEntityId,
          orgId,
          displayName:     entity.displayName,
          confidence:      entity.confidence,
        };

        const results = await this.neo4j.runQuery<{ nodeId: string }>(cypher, params);

        if (results.length > 0) {
          nodeIdMap.set(entityKey(entity), results[0].nodeId);
        }
      }

      this.logger.log(`Neo4j: upserted ${nodeIdMap.size} node(s) for org=${orgId}`);
    } catch (err) {
      // Graceful fallback — Neo4j may not be running locally
      this.logger.warn(
        `Neo4j unavailable — falling back to Postgres-only mode. Reason: ${(err as Error).message}`,
      );
    }

    return nodeIdMap;
  }

  /**
   * Pull individual data records out of a connector payload.
   *
   * Connectors return heterogeneous JSON payloads.  We normalise them by:
   * 1. If the payload is an array → treat each element as a record.
   * 2. If the payload has a `records`, `data`, `items`, or `results` array key → use that.
   * 3. Otherwise wrap the top-level object as a single record.
   */
  private extractRecordsFromPayload(
    payload: Record<string, unknown>,
  ): Array<Record<string, unknown>> {
    if (Array.isArray(payload)) {
      return (payload as unknown[]).filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      );
    }

    for (const key of ['records', 'data', 'items', 'results', 'entities', 'rows']) {
      const arr = payload[key];
      if (Array.isArray(arr)) {
        return arr.filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null && !Array.isArray(item),
        );
      }
    }

    // Single top-level object
    return [payload];
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function entityKey(e: EntityCandidate): string {
  return `${e.entityType}:${e.sourceSystem}:${e.sourceEntityId}`;
}
