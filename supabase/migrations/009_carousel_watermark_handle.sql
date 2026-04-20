-- Optional per-project watermark override (Instagram handle shown on exports).
ALTER TABLE carousel_projects
  ADD COLUMN IF NOT EXISTS watermark_handle TEXT;
