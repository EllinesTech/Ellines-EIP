-- Source-of-truth model: Organisation → Source → Connector → Resource.
--
-- A CONNECTOR is how EIP reaches a source. A SOURCE is what that actually is:
-- the customer's website, or their business system. Collapsing the two is what
-- made the dashboards describe an organisation as "Connectors: 1", which says
-- nothing about whether their business is connected.
--
-- Two source kinds, and they stay separate because they answer different
-- questions:
--
--   WEBSITE          Technical reachability of the org's own site: HTTP status,
--                    latency, TLS. Says nothing about business data.
--   BUSINESS_SYSTEM  A real business system (catalogue, ERP, POS…) reached
--                    through one or more connectors, exposing many resources.
--
-- `website_url` is NULL when the org has not configured a website. That is an
-- explicit "not connected" state, never a placeholder URL.
--
-- Business capabilities are NOT stored here. They live in
-- connector_capability_registries and are derived from real retrievals, so this
-- table stays a pure identity record and cannot drift into claiming a
-- capability the source never provided.
--
-- DO NOT apply by hand to production outside the normal migration/deploy runbook.

-- CreateTable
CREATE TABLE IF NOT EXISTS "organization_sources" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website_url" TEXT,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_sources_pkey" PRIMARY KEY ("id"),

    -- The source kind is a closed vocabulary. Anything else is a data error and
    -- must be rejected rather than stored as an unknown shape.
    CONSTRAINT "organization_sources_source_type_check"
        CHECK ("source_type" IN ('WEBSITE', 'BUSINESS_SYSTEM'))
);

-- One website per organisation; business systems may be many.
CREATE UNIQUE INDEX IF NOT EXISTS "organization_sources_org_website_key"
    ON "organization_sources" ("organization_id")
    WHERE "source_type" = 'WEBSITE';

CREATE INDEX IF NOT EXISTS "organization_sources_organization_id_idx"
    ON "organization_sources" ("organization_id");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_sources_organization_id_fkey') THEN
        ALTER TABLE "organization_sources"
            ADD CONSTRAINT "organization_sources_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;


-- Real website measurements. One row per actual check, newest first, so an
-- operator can see that a site was online five minutes ago and is offline now.
--
-- Every measurement field is nullable on purpose:
--   http_status      NULL when no response was received (DNS/TLS/timeout)
--   response_time_ms NULL when no request completed
--   tls_*            NULL when TLS was not measurable (plain HTTP, probe failure)
-- A NULL is an honest "not measured". A 0 would be a fabricated measurement.
CREATE TABLE IF NOT EXISTS "source_website_measurements" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT NOT NULL,
    "http_status" INTEGER,
    "response_time_ms" INTEGER,
    "redirected" BOOLEAN,
    "final_url" TEXT,
    "tls_valid" BOOLEAN,
    "tls_issuer" TEXT,
    "tls_subject" TEXT,
    "tls_valid_to" TIMESTAMP(3),
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_website_measurements_pkey" PRIMARY KEY ("id"),

    -- Outcomes are the real probe results, never a synthesised "ONLINE".
    CONSTRAINT "source_website_measurements_outcome_check"
        CHECK ("outcome" IN (
            'ONLINE', 'OFFLINE', 'DNS_FAILURE', 'TLS_FAILURE', 'TIMEOUT', 'NOT_CHECKED'
        ))
);

CREATE INDEX IF NOT EXISTS "source_website_measurements_source_checked_idx"
    ON "source_website_measurements" ("source_id", "checked_at" DESC);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_website_measurements_source_id_fkey') THEN
        ALTER TABLE "source_website_measurements"
            ADD CONSTRAINT "source_website_measurements_source_id_fkey"
            FOREIGN KEY ("source_id") REFERENCES "organization_sources"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_website_measurements_organization_id_fkey') THEN
        ALTER TABLE "source_website_measurements"
            ADD CONSTRAINT "source_website_measurements_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;


-- Backfill: one BUSINESS_SYSTEM source per EXISTING connector installation.
--
-- This derives from rows that already exist and invents nothing: the name is the
-- connector's own display name, the description records the catalog type it was
-- installed from, and the metadata carries the connector id so the dashboard can
-- still join source → connector. Organisations with no connector get no system
-- row, so "no business system connected" remains a truthful state rather than
-- being papered over with a placeholder.
--
-- `id` is derived from the connector id, so re-running this migration is a
-- no-op rather than a source of duplicate systems.
INSERT INTO "organization_sources" (
    id, organization_id, source_type, name, website_url, description, metadata, created_at, updated_at
)
SELECT
    'src_' || md5(i.id),
    i.organization_id,
    'BUSINESS_SYSTEM',
    COALESCE(NULLIF(i.display_name, ''), i.catalog_id),
    NULL,
    'Derived from connector installation ' || i.id || ' (' || i.catalog_id || ')',
    jsonb_build_object('origin', 'connector-backfill', 'connectorId', i.id, 'catalogId', i.catalog_id),
    i.created_at,
    i.updated_at
FROM connector_installations i
WHERE i.status IS DISTINCT FROM 'deleted'
ON CONFLICT DO NOTHING;
