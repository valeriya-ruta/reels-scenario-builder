-- Run in Supabase SQL editor: marks reel projects imported from competitor analysis until opened.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS scenario_unseen BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'reels';

COMMENT ON COLUMN projects.scenario_unseen IS 'True until the user opens the project from the list (Нове badge).';
COMMENT ON COLUMN projects.project_type IS 'reels | storytelling — filters «Мої проєкти».';
