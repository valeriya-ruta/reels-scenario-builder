-- Run in Supabase SQL editor.
-- Persists full reel transcripts per shortCode so they stay available after CDN URLs expire.

ALTER TABLE idea_scans
  ADD COLUMN IF NOT EXISTS reel_transcripts JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN idea_scans.reel_transcripts IS 'Map shortCode -> spoken transcript text (cached after successful STT).';
