-- Reel Planner Database Migration
-- Run this SQL in your Supabase dashboard: https://app.supabase.com/project/_/sql/new

-- Create enum types
CREATE TYPE crew_mode_enum AS ENUM ('solo', 'with_crew');
CREATE TYPE framing_enum AS ENUM ('extreme_close_up', 'close_up', 'above_waist', 'full_body', 'overhead', 'low_angle');
CREATE TYPE pose_enum AS ENUM ('standing', 'sitting', 'crouching', 'leaning');
CREATE TYPE arm_state_enum AS ENUM ('arms_at_sides', 'one_arm_raised', 'holding_object', 'pointing');
CREATE TYPE facing_enum AS ENUM ('toward_camera', 'away', 'profile', 'three_quarter');
CREATE TYPE camera_motion_enum AS ENUM ('static', 'push_in', 'pull_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'handheld');
CREATE TYPE shot_size_enum AS ENUM ('wide', 'medium', 'close_up', 'extreme_close_up');
CREATE TYPE transition_type_enum AS ENUM ('hard_cut', 'matchcut', 'jump_cut', 'whip_pan', 'sound_bridge', 'dissolve');

-- Create projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  crew_mode crew_mode_enum NOT NULL DEFAULT 'solo',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Create scenes table
CREATE TABLE scenes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  order_index INTEGER NOT NULL,
  lines TEXT,
  framing framing_enum NOT NULL,
  pose pose_enum NOT NULL,
  arm_state arm_state_enum NOT NULL,
  facing facing_enum NOT NULL,
  camera_motion camera_motion_enum,
  shot_size shot_size_enum,
  actor_note TEXT,
  editor_note TEXT,
  is_checked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create transitions table
CREATE TABLE transitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  scene_before_id UUID REFERENCES scenes(id) ON DELETE CASCADE NOT NULL,
  scene_after_id UUID REFERENCES scenes(id) ON DELETE CASCADE NOT NULL,
  type transition_type_enum NOT NULL DEFAULT 'hard_cut',
  editor_context TEXT
);

-- Create snapshots table
CREATE TABLE snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  snapshot_data JSONB NOT NULL,
  actor_token TEXT UNIQUE NOT NULL,
  editor_token TEXT UNIQUE NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_scenes_project_id ON scenes(project_id);
CREATE INDEX idx_scenes_order_index ON scenes(project_id, order_index);
CREATE INDEX idx_transitions_project_id ON transitions(project_id);
CREATE INDEX idx_transitions_scene_before ON transitions(scene_before_id);
CREATE INDEX idx_transitions_scene_after ON transitions(scene_after_id);
CREATE INDEX idx_snapshots_actor_token ON snapshots(actor_token);
CREATE INDEX idx_snapshots_editor_token ON snapshots(editor_token);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
CREATE POLICY "Users can view their own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for scenes
CREATE POLICY "Users can view scenes in their projects"
  ON scenes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = scenes.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create scenes in their projects"
  ON scenes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = scenes.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update scenes in their projects"
  ON scenes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = scenes.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete scenes in their projects"
  ON scenes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = scenes.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- RLS Policies for transitions
CREATE POLICY "Users can view transitions in their projects"
  ON transitions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = transitions.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create transitions in their projects"
  ON transitions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = transitions.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update transitions in their projects"
  ON transitions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = transitions.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete transitions in their projects"
  ON transitions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = transitions.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- RLS Policies for snapshots (public read by token, insert only by project owner)
CREATE POLICY "Anyone can read snapshots by token"
  ON snapshots FOR SELECT
  USING (true);

CREATE POLICY "Users can create snapshots for their projects"
  ON snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = snapshots.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for projects updated_at
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
