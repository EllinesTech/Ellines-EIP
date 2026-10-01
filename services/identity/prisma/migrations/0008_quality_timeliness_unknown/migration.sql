-- Timeliness is only known when the source published a health metric.
--
-- `enterprise_snapshots.health_score` became nullable (0007) so a sync without a
-- published metric stores NULL instead of a fabricated 0. This service derived
-- its `timeliness` dimension straight from that value, which turned the column
-- into a NOT NULL Float and forced a 0 back in — the fabrication returned through
-- a different door.
--
-- NULL now means "timeliness was never measured", which is different from 0
-- ("the data is entirely stale"). computeScore() already skips dimensions that
-- are not numbers, so an unmeasured timeliness is excluded from the weighted
-- average rather than counted as the worst possible score.
--
-- Idempotent: dropping an absent NOT NULL is a no-op.
--
-- DO NOT apply by hand to production outside the normal migration/deploy runbook.

ALTER TABLE "data_quality_scores" ALTER COLUMN "timeliness_score" DROP NOT NULL;

ALTER TABLE "data_quality_history" ALTER COLUMN "timeliness_score" DROP NOT NULL;
