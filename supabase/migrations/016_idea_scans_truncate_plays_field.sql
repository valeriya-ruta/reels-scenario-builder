-- Clear competitor scan cache after `plays` JSON field rename (was videoPlayCount on stored top_reels.items).
-- Ensures no stale rows skip Apify; same as 015 but safe to run again on already-empty tables.

TRUNCATE TABLE idea_scans;
