-- One-time JSONB migration for carousel slide structural types.
-- Run on dev/staging first.

UPDATE carousel_projects
SET slides = (
  SELECT jsonb_agg(
    (
      WITH src AS (
        SELECT elem AS e,
               COALESCE(elem->>'slideType', CASE
                 WHEN elem->>'slideKind' = 'cover' THEN 'cover'
                 WHEN elem->>'slideKind' = 'cta' THEN 'final'
                 ELSE 'slide'
               END) AS normalized_type,
               COALESCE(elem->>'layoutPreset', CASE
                 WHEN elem->>'slideKind' = 'statement' THEN 'quote'
                 WHEN elem->>'slideKind' = 'bullets' THEN 'list'
                 WHEN elem->>'slideKind' = 'cta' THEN 'goal'
                 ELSE 'text'
               END) AS normalized_preset
      )
      SELECT
        jsonb_strip_nulls(
          (e - 'slideKind' - 'label' - 'items')
          || jsonb_build_object(
            'slideType', normalized_type,
            'layoutPreset',
              CASE
                WHEN normalized_type = 'cover' THEN NULL
                WHEN normalized_type IN ('slide', 'final') THEN normalized_preset
                ELSE 'text'
              END,
            'optionalLabel', COALESCE(e->>'optionalLabel', e->>'label', ''),
            'listItems',
              CASE
                WHEN COALESCE(normalized_preset, '') = 'list' THEN COALESCE(e->'listItems', e->'items', '[]'::jsonb)
                ELSE COALESCE(e->'listItems', NULL)
              END,
            'bulletStyle', COALESCE(e->>'bulletStyle', CASE WHEN normalized_preset = 'list' THEN 'numbered-padded' ELSE NULL END),
            'ctaAction', COALESCE(e->>'ctaAction', CASE WHEN normalized_type = 'final' AND normalized_preset = 'goal' THEN 'follow' ELSE NULL END),
            'ctaKeyword', COALESCE(e->>'ctaKeyword', ''),
            'testimonialAuthor', COALESCE(e->'testimonialAuthor', NULL)
          )
        )
      FROM src
    )
  )
  FROM jsonb_array_elements(slides) AS elem
)
WHERE jsonb_typeof(slides) = 'array';
