-- Per-user carousel studio projects (slides stored as JSON).

CREATE TABLE IF NOT EXISTS carousel_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Без назви',
  slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carousel_projects_user_updated_idx
  ON carousel_projects (user_id, updated_at DESC);

ALTER TABLE carousel_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own carousel projects"
  ON carousel_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own carousel projects"
  ON carousel_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own carousel projects"
  ON carousel_projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own carousel projects"
  ON carousel_projects FOR DELETE
  USING (auth.uid() = user_id);
