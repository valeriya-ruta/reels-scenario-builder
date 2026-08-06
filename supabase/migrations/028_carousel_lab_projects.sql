-- ─────────────────────────────────────────────────────────────────────────────
-- Carousel Lab v2 — ISOLATED parallel engine. ADDITIVE ONLY.
-- Creates a NEW table and a NEW storage bucket. Touches NO existing objects:
-- no ALTER / DROP / RENAME / policy change on carousel_projects, its storage, or
-- anything else. Fully namespaced under `carousel_lab_*` / bucket `carousel-lab`.
-- ─────────────────────────────────────────────────────────────────────────────

-- New per-user project table (slides stored as JSON, same idiom as carousel_projects).
CREATE TABLE IF NOT EXISTS carousel_lab_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Нова карусель',
  style_id TEXT NOT NULL DEFAULT 'modern-elegant',
  slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carousel_lab_projects_user_updated_idx
  ON carousel_lab_projects (user_id, updated_at DESC);

ALTER TABLE carousel_lab_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "carousel_lab_select_own" ON carousel_lab_projects;
CREATE POLICY "carousel_lab_select_own"
  ON carousel_lab_projects FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "carousel_lab_insert_own" ON carousel_lab_projects;
CREATE POLICY "carousel_lab_insert_own"
  ON carousel_lab_projects FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "carousel_lab_update_own" ON carousel_lab_projects;
CREATE POLICY "carousel_lab_update_own"
  ON carousel_lab_projects FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "carousel_lab_delete_own" ON carousel_lab_projects;
CREATE POLICY "carousel_lab_delete_own"
  ON carousel_lab_projects FOR DELETE USING (auth.uid() = user_id);

-- New storage bucket for lab images (public read; writes restricted to the
-- owner's `<uid>/…` folder). Path convention: `<uid>/<projectId>/<slideId>-<n>.jpg`.
INSERT INTO storage.buckets (id, name, public)
VALUES ('carousel-lab', 'carousel-lab', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "carousel_lab_obj_read" ON storage.objects;
CREATE POLICY "carousel_lab_obj_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'carousel-lab');

DROP POLICY IF EXISTS "carousel_lab_obj_insert_own" ON storage.objects;
CREATE POLICY "carousel_lab_obj_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'carousel-lab' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "carousel_lab_obj_update_own" ON storage.objects;
CREATE POLICY "carousel_lab_obj_update_own"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'carousel-lab' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "carousel_lab_obj_delete_own" ON storage.objects;
CREATE POLICY "carousel_lab_obj_delete_own"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'carousel-lab' AND (storage.foldername(name))[1] = auth.uid()::text);
