-- Run in Supabase SQL editor.
-- idea_scans: per-reel notes and Instagram URLs (keyed by shortCode, same keys as saved_reel_ids).
-- projects: reference from competitor flow for Scenario Builder.

ALTER TABLE idea_scans
  ADD COLUMN IF NOT EXISTS user_note JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE idea_scans
  ADD COLUMN IF NOT EXISTS reference_url JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN idea_scans.user_note IS 'Map shortCode -> author note when saving reel to scenario.';
COMMENT ON COLUMN idea_scans.reference_url IS 'Map shortCode -> Instagram reel URL when saving.';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS reference_url TEXT;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS reference_note TEXT;

COMMENT ON COLUMN projects.reference_url IS 'Instagram reel URL from competitor save (optional).';
COMMENT ON COLUMN projects.reference_note IS 'Author note / creative brief from competitor save (optional).';
