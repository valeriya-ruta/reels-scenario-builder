-- Backfill idea_scans.top_reels: isViral = (videoViewCount >= 2 * followers_count)
-- and summary.qualifiedCount = count of such items in top 10.
-- Run once in Supabase SQL (or via migration). Matches lib/competitorScoring.ts isReelViralByFollowerThreshold.

UPDATE idea_scans AS s
SET top_reels = jsonb_set(
  jsonb_set(
    s.top_reels,
    '{items}',
    COALESCE(
      (
        SELECT jsonb_agg(
          (x.value || jsonb_build_object(
            'isViral',
            (
              s.followers_count > 0
              AND COALESCE((x.value ->> 'videoViewCount')::numeric, 0)
                >= (2::numeric * s.followers_count::numeric)
            )
          ))
          ORDER BY x.ord
        )
        FROM jsonb_array_elements(s.top_reels -> 'items') WITH ORDINALITY AS x (value, ord)
      ),
      '[]'::jsonb
    ),
    true
  ),
  '{summary,qualifiedCount}',
  to_jsonb(
    COALESCE(
      (
        SELECT COUNT(*)::int
        FROM jsonb_array_elements(s.top_reels -> 'items') AS e (value)
        WHERE s.followers_count > 0
          AND COALESCE((e.value ->> 'videoViewCount')::numeric, 0)
            >= (2::numeric * s.followers_count::numeric)
      ),
      0
    )
  ),
  true
)
WHERE jsonb_typeof(s.top_reels -> 'items') = 'array'
  AND jsonb_array_length(s.top_reels -> 'items') > 0;
