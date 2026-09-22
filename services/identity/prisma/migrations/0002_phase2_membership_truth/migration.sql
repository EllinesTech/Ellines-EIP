-- Phase 2 membership truth backfill.
INSERT INTO organization_memberships (id, user_id, organization_id, role, is_active, created_at, updated_at)
SELECT md5(u.id || ':' || u.organization_id), u.id, u.organization_id, u.role, u.is_active, u.created_at, u.updated_at
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM organization_memberships m WHERE m.user_id = u.id AND m.organization_id = u.organization_id);

CREATE OR REPLACE FUNCTION eip_sync_primary_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO organization_memberships (id, user_id, organization_id, role, is_active, created_at, updated_at)
  VALUES (md5(NEW.id || ':' || NEW.organization_id), NEW.id, NEW.organization_id, NEW.role, NEW.is_active, COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now()))
  ON CONFLICT (user_id, organization_id)
  DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active, updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS eip_users_primary_membership ON users;
CREATE TRIGGER eip_users_primary_membership
AFTER INSERT OR UPDATE OF organization_id, role, is_active ON users
FOR EACH ROW EXECUTE FUNCTION eip_sync_primary_membership();