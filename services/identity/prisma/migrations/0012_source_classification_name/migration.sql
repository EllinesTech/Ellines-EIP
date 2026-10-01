-- Classification may also set the source's own display name.
--
-- The source row was originally backfilled from a connector, so it inherited that
-- connector's name. When a source is classified explicitly it should carry the name
-- the organisation gives it, while the connector keeps its own technical name. This
-- renames the SAME row — it is not a second source, and no capability, measurement
-- or connector link moves.
--
-- The parameter list changes, and CREATE OR REPLACE cannot alter a function's input
-- parameters, so the previous signature is dropped explicitly.

DROP FUNCTION IF EXISTS eip_classify_source(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION eip_classify_source(
  p_source_id text,
  p_source_type text,
  p_source_kind text,
  p_website_url text,
  p_name text,
  p_reason text,
  p_actor_email text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_source organization_sources%ROWTYPE;
  v_url text := nullif(btrim(coalesce(p_website_url, '')), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_out jsonb;
BEGIN
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'eip_reason_required' USING ERRCODE = '22023';
  END IF;

  IF p_source_type NOT IN ('WEBSITE', 'BUSINESS_SYSTEM') THEN
    RAISE EXCEPTION 'eip_invalid_source_type: %', p_source_type USING ERRCODE = '22023';
  END IF;

  IF p_source_type = 'BUSINESS_SYSTEM' AND nullif(btrim(coalesce(p_source_kind, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'eip_kind_requires_website' USING ERRCODE = '22023';
  END IF;
  IF p_source_type = 'WEBSITE' AND p_source_kind IS NOT NULL AND p_source_kind NOT IN ('HTML', 'API') THEN
    RAISE EXCEPTION 'eip_invalid_source_kind: %', p_source_kind USING ERRCODE = '22023';
  END IF;

  IF p_source_type = 'WEBSITE' AND v_url IS NULL THEN
    RAISE EXCEPTION 'eip_website_url_required' USING ERRCODE = '22023';
  END IF;

  IF v_name IS NOT NULL AND char_length(v_name) > 160 THEN
    RAISE EXCEPTION 'eip_name_too_long' USING ERRCODE = '22023';
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
         "name" = coalesce(v_name, "name"),
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

DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN
  NULL;
END $$;
