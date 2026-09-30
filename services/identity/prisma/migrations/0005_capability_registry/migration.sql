-- Capability inventory per connected system (EIP capability-driven model).
--
-- One row per connector installation. The `registry` JSON holds the
-- CapabilityRegistry produced by buildRegistryFromOpenApi, so the honest
-- availability states (AVAILABLE / NOT_AUTHORIZED / PARTIAL / ...) survive
-- across syncs and can be rendered honestly in the client.
--
-- available_count is the number of resources whose retrieval genuinely
-- COMPLETED. It is never derived from a remote `count` field alone.
-- DO NOT apply by hand to production outside the normal migration/deploy runbook.

-- CreateTable
CREATE TABLE IF NOT EXISTS "connector_capability_registries" (
    "id" TEXT NOT NULL,
    "installation_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "available_count" INTEGER NOT NULL DEFAULT 0,
    "unavailable_count" INTEGER NOT NULL DEFAULT 0,
    "registry" JSONB NOT NULL,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connector_capability_registries_pkey" PRIMARY KEY ("id")
);

-- One registry per installation: a connection has a single capability inventory.
CREATE UNIQUE INDEX IF NOT EXISTS "connector_capability_registries_installation_id_key"
    ON "connector_capability_registries" ("installation_id");

CREATE INDEX IF NOT EXISTS "connector_capability_registries_organization_id_is_current_idx"
    ON "connector_capability_registries" ("organization_id", "is_current");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'connector_capability_registries_installation_id_fkey') THEN
        ALTER TABLE "connector_capability_registries"
            ADD CONSTRAINT "connector_capability_registries_installation_id_fkey"
            FOREIGN KEY ("installation_id") REFERENCES "connector_installations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'connector_capability_registries_organization_id_fkey') THEN
        ALTER TABLE "connector_capability_registries"
            ADD CONSTRAINT "connector_capability_registries_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
