-- Idea scans (конкуренти): run in Supabase SQL editor after confirming extensions exist.
-- Caches one row per scan; same handle + same UTC calendar day = reuse row, no new Apify run.

CREATE TABLE IF NOT EXISTS idea_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  handle TEXT NOT NULL,
  followers_count INTEGER NOT NULL DEFAULT 0,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_reels JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_reels JSONB NOT NULL DEFAULT '{}'::jsonb,
  saved_reel_ids TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_idea_scans_user_scanned_at
  ON idea_scans (user_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_idea_scans_user_handle
  ON idea_scans (user_id, handle);

ALTER TABLE idea_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own idea_scans"
  ON idea_scans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own idea_scans"
  ON idea_scans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own idea_scans"
  ON idea_scans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own idea_scans"
  ON idea_scans FOR DELETE
  USING (auth.uid() = user_id);
