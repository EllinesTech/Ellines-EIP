-- Phase 4 — internal Ellines operations: platform staff & scoped grants.
--
-- Platform Super Admin access was previously decided entirely by the
-- PLATFORM_ADMIN_EMAILS environment variable. Every listed email implicitly held
-- every platform capability; there was no record of who granted access, no scope,
-- no expiry, and no way to revoke one operator short of editing a secret and
-- redeploying Pages. These two tables turn access into rows that can be scoped,
-- expired and revoked, while the allowlist remains the bootstrap source.
--
-- `scope_org_id` is NOT NULL DEFAULT '' (never NULL) on purpose: a NULL would
-- make every duplicate platform-wide grant distinct in Postgres and the composite
-- unique index below would not prevent them.
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) so re-running it
-- against an environment that already has the tables is a no-op. Still: DO NOT
-- apply by hand to production outside the normal migration/deploy runbook.

DO $$ BEGIN
  CREATE TYPE "PlatformStaffStatus" AS ENUM ('active', 'suspended', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "platform_staff_members" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "full_name" TEXT,
  "title" TEXT,
  "status" "PlatformStaffStatus" NOT NULL DEFAULT 'active',
  "user_id" TEXT,
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "revoked_reason" TEXT,
  "invited_by_email" TEXT,
  "bootstrapped" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_staff_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_staff_members_email_key"
  ON "platform_staff_members"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "platform_staff_members_user_id_key"
  ON "platform_staff_members"("user_id");
CREATE INDEX IF NOT EXISTS "platform_staff_members_status_idx"
  ON "platform_staff_members"("status");

CREATE TABLE IF NOT EXISTS "platform_staff_grants" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "capability" TEXT NOT NULL,
  "scope_org_id" TEXT NOT NULL DEFAULT '',
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "granted_by_email" TEXT,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_staff_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_staff_grants_staff_id_capability_scope_org_id_key"
  ON "platform_staff_grants"("staff_id", "capability", "scope_org_id");
CREATE INDEX IF NOT EXISTS "platform_staff_grants_staff_id_idx"
  ON "platform_staff_grants"("staff_id");

DO $$ BEGIN
  ALTER TABLE "platform_staff_grants" ADD CONSTRAINT "platform_staff_grants_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "platform_staff_members"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "platform_staff_members" ADD CONSTRAINT "platform_staff_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
