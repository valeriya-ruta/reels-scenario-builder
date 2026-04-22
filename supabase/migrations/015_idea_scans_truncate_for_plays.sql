-- Wipe cached competitor scans so clients re-fetch from Apify with play counts (JSON `plays` on items).
-- (Replaces stale videoViewCount / legacy JSON in top_reels / raw_reels.)
-- Metrics live in JSONB; there are no separate view/play columns on idea_scans.

TRUNCATE TABLE idea_scans;
