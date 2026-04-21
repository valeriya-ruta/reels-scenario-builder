-- Ensure all carousel slide JSON entries have size tokens.
UPDATE carousel_projects
SET slides = (
  SELECT jsonb_agg(
    jsonb_strip_nulls(
      elem
      || jsonb_build_object(
        'titleSize', COALESCE(elem->>'titleSize', 'L'),
        'bodySize', COALESCE(elem->>'bodySize', 'M')
      )
    )
  )
  FROM jsonb_array_elements(slides) elem
)
WHERE jsonb_typeof(slides) = 'array';
