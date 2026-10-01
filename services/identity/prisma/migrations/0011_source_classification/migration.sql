-- Source classification: WEBSITE (HTML | API) vs BUSINESS_SYSTEM.
--
-- WHY AN EXPLICIT KIND
-- -------------------
-- "It is a REST API" is not a source category. A company's public catalogue API
-- and a company's ERP API are both REST endpoints; one belongs with the website
-- and one with the business systems, and only the organisation knows which.
-- So the category is persisted configuration (`source_type` + `source_kind`),
-- never inferred from a catalog id, a URL path, a response shape or a name.
--
-- The three kinds that are deliberately distinct:
--   WEBSITE + HTML           a site a human browses
--   WEBSITE + API            a site/brand's own API (catalogue, booking, ...)
--   BUSINESS_SYSTEM          an operational system (ERP, HIS, POS, CRM, ...)
--
-- WHY REGISTRIES GET A source_id
-- -----------------------------
-- Capability evidence used to hang off the connector alone, which made "which
-- SOURCE provides books?" unanswerable — so a website/API source could never
-- show the capabilities it genuinely provides. `source_id` attributes the SAME
-- evidence to the source that was actually read. The registry row is not copied:
-- one registry, referenced by both its source and the connector that read it, so
-- nothing is duplicated and nothing is lost.
--
-- DO NOT apply by hand to production outside the normal migration/deploy runbook.

-- ─── source_kind ────────────────────────────────────────────────────────────

ALTER TABLE "organization_sources" ADD COLUMN IF NOT EXISTS "source_kind" TEXT;

-- A kind exists only for a WEBSITE, and only these two values are meaningful.
-- BUSINESS_SYSTEM rows must carry NULL, so "which category is this?" has exactly
-- one answer per row.
ALTER TABLE "organization_sources" DROP CONSTRAINT IF EXISTS "organization_sources_source_kind_check";
ALTER TABLE "organization_sources" ADD CONSTRAINT "organization_sources_source_kind_check"
  CHECK (
    ("source_kind" IS NULL AND "source_type" = 'BUSINESS_SYSTEM')
    OR ("source_type" = 'WEBSITE' AND "source_kind" IN ('HTML', 'API'))
  );

-- ─── source-attributed capability evidence ──────────────────────────────────

ALTER TABLE "connector_capability_registries" ADD COLUMN IF NOT EXISTS "source_id" TEXT;

CREATE INDEX IF NOT EXISTS "connector_capability_registries_source_id_idx"
  ON "connector_capability_registries" ("source_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'connector_capability_registries_source_id_fkey'
  ) THEN
    ALTER TABLE "connector_capability_registries"
      ADD CONSTRAINT "connector_capability_registries_source_id_fkey"
      FOREIGN KEY ("source_id") REFERENCES "organization_sources"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: attribute each existing registry to the source it actually describes.
-- The link is the recorded provenance (`metadata.connectorId`), scoped to the same
-- organisation, so a source is never attributed across tenants. Rows with no
-- recorded provenance stay NULL and keep their existing connector-scoped reading.
UPDATE "connector_capability_registries" r
   SET "source_id" = s."id"
  FROM "organization_sources" s
 WHERE r."source_id" IS NULL
   AND s."organization_id" = r."organization_id"
   AND s."metadata" ->> 'connectorId' = r."installation_id";

-- ─── explicit, transactional classification ─────────────────────────────────

-- Classification is a decision an authorised operator makes about their own
-- organisation, so it is an audited, transactional operation rather than a silent
-- data patch: validate here, persist here, return the row that was actually
-- stored.
CREATE OR REPLACE FUNCTION eip_classify_source(
  p_source_id text,
  p_source_type text,
  p_source_kind text,
  p_website_url text,
  p_reason text,
  p_actor_email text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_source organization_sources%ROWTYPE;
  v_url text := nullif(btrim(coalesce(p_website_url, '')), '');
  v_out jsonb;
BEGIN
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'eip_reason_required' USING ERRCODE = '22023';
  END IF;

  IF p_source_type NOT IN ('WEBSITE', 'BUSINESS_SYSTEM') THEN
    RAISE EXCEPTION 'eip_invalid_source_type: %', p_source_type USING ERRCODE = '22023';
  END IF;

  -- A kind belongs to a website. A business system carries NULL, so the category
  -- of every row has exactly one meaning.
  IF p_source_type = 'BUSINESS_SYSTEM' AND nullif(btrim(coalesce(p_source_kind, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'eip_kind_requires_website' USING ERRCODE = '22023';
  END IF;
  IF p_source_type = 'WEBSITE' AND p_source_kind IS NOT NULL AND p_source_kind NOT IN ('HTML', 'API') THEN
    RAISE EXCEPTION 'eip_invalid_source_kind: %', p_source_kind USING ERRCODE = '22023';
  END IF;

  -- A website source must have something to measure. Without a URL there is no
  -- site to probe, and EIP never substitutes a different one.
  IF p_source_type = 'WEBSITE' AND v_url IS NULL THEN
    RAISE EXCEPTION 'eip_website_url_required' USING ERRCODE = '22023';
  END IF;

  -- Changing classification does not lose evidence: capability registries keep
  -- pointing at this row, and the connectors that read it are untouched.
  UPDATE "organization_sources"
     SET "source_type" = p_source_type,
         "source_kind" = CASE
           WHEN p_source_type = 'WEBSITE'
             THEN coalesce(nullif(btrim(p_source_kind), ''), 'HTML')
           ELSE NULL
         END,
         "website_url" = CASE WHEN p_source_type = 'WEBSITE' THEN v_url ELSE "website_url" END,
         "updated_at" = now()
   WHERE "id" = p_source_id
   RETURNING * INTO v_source;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'eip_source_not_found: %', p_source_id USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'id', v_source.id,
    'organizationId', v_source.organization_id,
    'sourceType', v_source.source_type,
    'sourceKind', v_source.source_kind,
    'name', v_source.name,
    'websiteUrl', v_source.website_url,
    'description', v_source.description,
    'updatedAt', v_source.updated_at
  ) INTO v_out;

  RETURN v_out;
END;
$$;

-- PostgREST caches the function catalogue; without a reload a newly deployed
-- function is invisible to the data plane even though it exists.
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN
  NULL;
END $$;


