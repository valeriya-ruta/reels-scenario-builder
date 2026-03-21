-- Locations per user + optional scene assignment
-- Run in Supabase SQL editor after the base migration.

CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_locations_user_name_lower ON locations (user_id, lower(trim(name)));

ALTER TABLE scenes
  ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX idx_scenes_location_id ON scenes(location_id);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own locations"
  ON locations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own locations"
  ON locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own locations"
  ON locations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own locations"
  ON locations FOR DELETE
  USING (auth.uid() = user_id);
