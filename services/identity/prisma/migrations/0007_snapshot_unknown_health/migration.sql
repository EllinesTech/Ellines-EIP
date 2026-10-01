-- An unmeasured health score has to be STORABLE as unknown.
--
-- `enterprise_snapshots.health_score` was NOT NULL with no default. A sync that
-- had no real health metric therefore had two options: write a fabricated 0, or
-- fail the write outright. The 0 was the worse of the two — it stored "the
-- source reported a health score of zero", which is a measurement that never
-- happened, and every reader that treats a non-null score as measured would
-- report it as fact. The sync path now stores the source's own metric or NULL,
-- so the column must accept NULL.
--
-- This is a real defect found against the real database: the Haven sync failed
-- with `null value in column "health_score" ... violates not-null constraint`
-- the moment the fabrication was removed. The constraint, not the data, was
-- wrong.
--
-- Idempotent: dropping a missing default or an absent NOT NULL is a no-op.
--
-- DO NOT apply by hand to production outside the normal migration/deploy runbook.

ALTER TABLE "enterprise_snapshots" ALTER COLUMN "health_score" DROP DEFAULT;

ALTER TABLE "enterprise_snapshots" ALTER COLUMN "health_score" DROP NOT NULL;
