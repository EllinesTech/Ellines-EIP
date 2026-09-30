-- Retrieval-truthfulness metadata on enterprise_snapshots.
--
-- EIP must never claim a connected business system was read completely when
-- only part of it was retrieved. These columns let the snapshot tell the truth:
--
--   retrieved_count     records EIP actually retrieved and retained
--   reported_count      total the source system reported (0 = not reported)
--   retrieval_complete  true only when pagination provably reached the end
--   resources_*         how many API resources succeeded vs failed
--   sync_status         synced | partial | error | idle
--   sync_error          why the sync was partial or failed
--
-- Defaults are deliberately conservative: an existing row reads as NOT
-- complete, so a pre-migration snapshot is never assumed to be a full read.
-- DO NOT apply by hand to production outside the normal migration/deploy runbook.

-- AlterTable
ALTER TABLE "enterprise_snapshots"
    ADD COLUMN IF NOT EXISTS "retrieved_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "reported_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "retrieval_complete" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "retrieval_stop_reason" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "resources_retrieved" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "resources_failed" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "sync_status" TEXT NOT NULL DEFAULT 'idle',
    ADD COLUMN IF NOT EXISTS "sync_error" TEXT;
