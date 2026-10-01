-- Phase 4 slice B — transactional platform staff mutations.
--
-- WHY FUNCTIONS INSTEAD OF SEVERAL PostgREST CALLS
-- ------------------------------------------------
-- The Pages Functions data plane talks to Postgres through PostgREST, which can
-- only make ONE table atomic per request. Inviting an operator writes a staff row
-- AND its grants; bootstrapping writes many rows. Doing that as a sequence of
-- requests can leave a staff member with no grants (or half a bootstrap) if the
-- process dies between calls — a partially-applied authorization change is worse
-- than a failed one, because it looks intentional.
--
-- These functions run inside a single transaction, validate the capability
-- allow-list on the database side (so a bug in a caller cannot invent a
-- capability), and return the PERSISTED state rather than what the caller hoped
-- to write. Callers must not treat a non-null error as success.
--
-- Safety properties deliberately preserved from slice A:
--   - bootstrap never resurrects a suspended/revoked operator (skipped_inactive)
--   - revoked is terminal: a revoked operator is not silently reactivated
--   - an unknown capability raises rather than being stored
--   - expiry is stored as given (UTC); an unreadable value is rejected
--
-- DO NOT apply by hand to production outside the normal migration/deploy runbook.

-- ─── shared helpers ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION eip_platform_staff_normalize_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(coalesce(p_email, '')))
$$;

CREATE OR REPLACE FUNCTION eip_platform_staff_capability_allowed(p_capability text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  -- Mirrors PLATFORM_STAFF_CAPABILITIES in packages/shared/src/platform-staff.ts.
  -- Kept as an explicit list (not derived from the registry) so a typo cannot
  -- create a capability simply by being written into the table.
  SELECT p_capability IN (
    'platform.tenants.read',
    'platform.tenants.manage',
    'platform.connectors.manage',
    'platform.staff.manage',
    'platform.security.manage',
    'platform.settings.manage',
    'platform.system.read',
    'platform.audit.read'
  )
$$;

-- ─── invite: create the operator and their grants atomically ───────────────

CREATE OR REPLACE FUNCTION eip_platform_staff_invite(
  p_email text,
  p_full_name text,
  p_title text,
  p_expires_at text,
  p_reason text,
  p_actor_email text,
  p_grants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_email text := eip_platform_staff_normalize_email(p_email);
  v_member_id text;
  v_grant jsonb;
  v_capability text;
  v_scope text;
  v_out jsonb;
BEGIN
  IF v_email = '' THEN
    RAISE EXCEPTION 'eip_invalid_email' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM platform_staff_members WHERE email = v_email) THEN
    RAISE EXCEPTION 'eip_staff_exists: %', v_email USING ERRCODE = '23505';
  END IF;

  INSERT INTO platform_staff_members (
    id, email, full_name, title, status, expires_at, invited_by_email, notes, created_at, updated_at
  ) VALUES (
    gen_random_uuid()::text,
    v_email,
    nullif(btrim(p_full_name), ''),
    nullif(btrim(p_title), ''),
    'active',
    eip_platform_staff_parse_ts(p_expires_at),
    eip_platform_staff_normalize_email(p_actor_email),
    nullif(btrim(p_reason), ''),
    now(),
    now()
  )
  RETURNING id INTO v_member_id;

  FOR v_grant IN SELECT * FROM jsonb_array_elements(coalesce(p_grants, '[]'::jsonb))
  LOOP
    v_capability := v_grant ->> 'capability';
    v_scope := coalesce(v_grant ->> 'scopeOrgId', v_grant ->> 'scope_org_id', '');

    IF NOT eip_platform_staff_capability_allowed(v_capability) THEN
      RAISE EXCEPTION 'eip_invalid_capability: %', v_capability USING ERRCODE = '22023';
    END IF;

    INSERT INTO platform_staff_grants (
      id, staff_id, capability, scope_org_id, expires_at, granted_by_email, reason, created_at, updated_at
    ) VALUES (
      gen_random_uuid()::text,
      v_member_id,
      v_capability,
      v_scope,
      eip_platform_staff_parse_ts(v_grant ->> 'expiresAt'),
      eip_platform_staff_normalize_email(p_actor_email),
      nullif(btrim(p_reason), ''),
      now(),
      now()
    );
  END LOOP;

  SELECT jsonb_build_object(
    'id', m.id,
    'email', m.email,
    'fullName', m.full_name,
    'title', m.title,
    'status', m.status,
    'expiresAt', m.expires_at,
    'invitedByEmail', m.invited_by_email,
    'bootstrapped', m.bootstrapped,
    'createdAt', m.created_at,
    'grants', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id,
        'capability', g.capability,
        'scopeOrgId', g.scope_org_id,
        'expiresAt', g.expires_at,
        'revokedAt', g.revoked_at,
        'reason', g.reason,
        'grantedByEmail', g.granted_by_email
      ) ORDER BY g.capability)
      FROM platform_staff_grants g WHERE g.staff_id = m.id
    ), '[]'::jsonb)
  ) INTO v_out
  FROM platform_staff_members m WHERE m.id = v_member_id;

  RETURN v_out;
END;
$$;

-- ─── grant / revoke a single capability ────────────────────────────────────

CREATE OR REPLACE FUNCTION eip_platform_staff_set_grant(
  p_staff_id text,
  p_capability text,
  p_scope_org_id text,
  p_expires_at text,
  p_reason text,
  p_actor_email text,
  p_granted boolean
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_scope text := coalesce(p_scope_org_id, '');
  v_out jsonb;
BEGIN
  IF NOT eip_platform_staff_capability_allowed(p_capability) THEN
    RAISE EXCEPTION 'eip_invalid_capability: %', p_capability USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM platform_staff_members WHERE id = p_staff_id) THEN
    RAISE EXCEPTION 'eip_staff_not_found: %', p_staff_id USING ERRCODE = 'P0002';
  END IF;

  IF p_granted THEN
    -- Re-granting an existing (possibly revoked) row must CLEAR revoked_at and
    -- the expiry, otherwise the upsert would silently leave the grant revoked or
    -- expired and the caller would believe access was restored.
    INSERT INTO platform_staff_grants (
      id, staff_id, capability, scope_org_id, expires_at, revoked_at,
      granted_by_email, reason, created_at, updated_at
    ) VALUES (
      gen_random_uuid()::text, p_staff_id, p_capability, v_scope,
      eip_platform_staff_parse_ts(p_expires_at), NULL,
      eip_platform_staff_normalize_email(p_actor_email), nullif(btrim(p_reason), ''), now(), now()
    )
    ON CONFLICT (staff_id, capability, scope_org_id) DO UPDATE
      SET expires_at = EXCLUDED.expires_at,
          revoked_at = NULL,
          granted_by_email = EXCLUDED.granted_by_email,
          reason = EXCLUDED.reason,
          updated_at = now();
  ELSE
    UPDATE platform_staff_grants
       SET revoked_at = now(),
           reason = nullif(btrim(p_reason), ''),
           updated_at = now()
     WHERE staff_id = p_staff_id
       AND capability = p_capability
       AND scope_org_id = v_scope
       AND revoked_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'eip_grant_not_found: %', p_capability USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Return the PERSISTED row, so the caller reports what the database actually
  -- holds rather than what it asked for.
  SELECT jsonb_build_object(
    'id', g.id,
    'staffId', g.staff_id,
    'capability', g.capability,
    'scopeOrgId', g.scope_org_id,
    'expiresAt', g.expires_at,
    'revokedAt', g.revoked_at,
    'reason', g.reason,
    'grantedByEmail', g.granted_by_email
  ) INTO v_out
  FROM platform_staff_grants g
  WHERE g.staff_id = p_staff_id AND g.capability = p_capability AND g.scope_org_id = v_scope;

  RETURN v_out;
END;
$$;

-- ─── status: suspend / activate / revoke an operator ────────────────────────

CREATE OR REPLACE FUNCTION eip_platform_staff_set_status(
  p_staff_id text,
  p_status text,
  p_reason text,
  p_actor_email text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_current "PlatformStaffStatus";
  v_out jsonb;
BEGIN
  IF p_status NOT IN ('active', 'suspended', 'revoked') THEN
    RAISE EXCEPTION 'eip_invalid_status: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_current FROM platform_staff_members WHERE id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'eip_staff_not_found: %', p_staff_id USING ERRCODE = 'P0002';
  END IF;

  -- Revocation is terminal on purpose. Reinstating someone who was revoked must be
  -- a deliberate re-invite (a new audited row), never a side effect of a status
  -- flip that a well-meaning operator could send by accident.
  IF v_current = 'revoked' AND p_status <> 'revoked' THEN
    RAISE EXCEPTION 'eip_revoked_is_terminal: %', p_staff_id USING ERRCODE = '22023';
  END IF;

  UPDATE platform_staff_members
     SET status = p_status::"PlatformStaffStatus",
         revoked_at = CASE WHEN p_status = 'revoked' THEN now() ELSE revoked_at END,
         revoked_reason = CASE WHEN p_status = 'revoked' THEN nullif(btrim(p_reason), '') ELSE revoked_reason END,
         updated_at = now()
   WHERE id = p_staff_id;

  SELECT jsonb_build_object(
    'id', m.id,
    'email', m.email,
    'fullName', m.full_name,
    'title', m.title,
    'status', m.status,
    'expiresAt', m.expires_at,
    'revokedAt', m.revoked_at,
    'revokedReason', m.revoked_reason,
    'updatedAt', m.updated_at
  ) INTO v_out
  FROM platform_staff_members m WHERE m.id = p_staff_id;

  RETURN v_out;
END;
$$;

-- ─── bootstrap: materialise the allowlist into real staff rows ──────────────

CREATE OR REPLACE FUNCTION eip_platform_staff_bootstrap(
  p_allowlist text[],
  p_reason text,
  p_actor_email text,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_email text;
  v_member_id text;
  v_existing "PlatformStaffStatus";
  v_capability text;
  v_created text[] := ARRAY[]::text[];
  v_planned text[] := ARRAY[]::text[];
  v_skipped_existing text[] := ARRAY[]::text[];
  v_skipped_inactive text[] := ARRAY[]::text[];
BEGIN
  IF coalesce(p_dry_run, false) THEN
    -- Read-only plan: no rows are written, so a dry run can never be mistaken for
    -- a completed bootstrap.
    FOREACH v_email IN ARRAY coalesce(p_allowlist, ARRAY[]::text[])
    LOOP
      v_email := eip_platform_staff_normalize_email(v_email);
      CONTINUE WHEN v_email = '';
      IF NOT EXISTS (SELECT 1 FROM platform_staff_members WHERE email = v_email) THEN
        v_planned := array_append(v_planned, v_email);
      END IF;
    END LOOP;

    RETURN jsonb_build_object(
      'dryRun', true,
      'wouldCreate', to_jsonb(v_planned),
      'created', '[]'::jsonb,
      'skippedExisting', '[]'::jsonb,
      'skippedInactive', '[]'::jsonb,
      'capabilities', to_jsonb(ARRAY[
        'platform.tenants.read',
        'platform.tenants.manage',
        'platform.connectors.manage',
        'platform.staff.manage',
        'platform.security.manage',
        'platform.settings.manage',
        'platform.system.read',
        'platform.audit.read'
      ])
    );
  END IF;

  FOREACH v_email IN ARRAY coalesce(p_allowlist, ARRAY[]::text[])
  LOOP
    v_email := eip_platform_staff_normalize_email(v_email);
    CONTINUE WHEN v_email = '';

    SELECT status INTO v_existing FROM platform_staff_members WHERE email = v_email FOR UPDATE;

    IF FOUND THEN
      -- Idempotency: a second run must not create duplicates.
      IF v_existing = 'active' THEN
        v_skipped_existing := array_append(v_skipped_existing, v_email);
      ELSE
        -- A suspended/revoked operator is NEVER revived by bootstrapping. This is
        -- the property slice A established: revocation must actually revoke.
        v_skipped_inactive := array_append(v_skipped_inactive, v_email);
      END IF;
      CONTINUE;
    END IF;

    INSERT INTO platform_staff_members (
      id, email, status, invited_by_email, notes, bootstrapped, created_at, updated_at
    ) VALUES (
      gen_random_uuid()::text, v_email, 'active',
      eip_platform_staff_normalize_email(p_actor_email),
      nullif(btrim(p_reason), ''), true, now(), now()
    )
    RETURNING id INTO v_member_id;

    -- Exactly the capability set the allowlist implied before this registry
    -- existed. Bootstrap must not hand out MORE than the previous contract.
    FOREACH v_capability IN ARRAY ARRAY[
      'platform.tenants.read', 'platform.tenants.manage', 'platform.connectors.manage',
      'platform.staff.manage', 'platform.security.manage', 'platform.settings.manage',
      'platform.system.read', 'platform.audit.read'
    ]
    LOOP
      INSERT INTO platform_staff_grants (
        id, staff_id, capability, scope_org_id, granted_by_email, reason, created_at, updated_at
      ) VALUES (
        gen_random_uuid()::text, v_member_id, v_capability, '',
        eip_platform_staff_normalize_email(p_actor_email), nullif(btrim(p_reason), ''), now(), now()
      );
    END LOOP;

    v_created := array_append(v_created, v_email);
  END LOOP;

  RETURN jsonb_build_object(
    'dryRun', false,
    'created', to_jsonb(v_created),
    'wouldCreate', '[]'::jsonb,
    'skippedExisting', to_jsonb(v_skipped_existing),
    'skippedInactive', to_jsonb(v_skipped_inactive)
  );
END;
$$;

-- PostgREST caches the function catalogue; without this reload a newly deployed
-- function is invisible to the Functions data plane (PGRST202) even though it
-- exists. Mirrors step 4 of scripts/apply-pending-migrations.mjs.
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN
  -- A non-PostgREST database (local Postgres) has no listener; that is fine.
  NULL;
END;
$$;


