// ─────────────────────────────────────────────────────────────────────────────
// Carousel Lab v2 — data model (ISOLATED parallel engine).
// Nothing here imports from or mutates the existing carousel system.
// One style is implemented now (Modern Elegant); the model is style-agnostic so
// future styles slot in via `styleId`.
// ─────────────────────────────────────────────────────────────────────────────

export const LAB_CANVAS_W = 1080;
export const LAB_CANVAS_H = 1350;

/** Registered carousel styles. Chosen once per project (global to the carousel). */
export type LabStyleId = 'modern-elegant';

/** Slide families (the locked taxonomy). */
export type LabSlideType = 'cover' | 'text' | 'numbers' | 'cta' | 'testimonial';

/** Per-type subtypes. */
export type LabCoverSubtype = 'title' | 'title_subtext';
export type LabTextSubtype = 'paragraph' | 'bullets' | 'numbered';
export type LabNumbersSubtype = 'stat';
export type LabCtaSubtype = 'keyword' | 'icons';
export type LabTestimonialSubtype = 'screenshot' | 'before_after' | 'point_ab';
export type LabSubtype =
  | LabCoverSubtype
  | LabTextSubtype
  | LabNumbersSubtype
  | LabCtaSubtype
  | LabTestimonialSubtype;

/** Picture position for Text slides. `middle` has no source SVG (see report) — engine
 *  accepts it but only up/down/none are fidelity-verified. */
export type LabPicturePosition = 'none' | 'up' | 'down' | 'middle';

/** Layout variants (extra dimension for a few subtypes). */
export type LabVariant =
  | 'default'
  | 'stat_large'
  | 'stat_small' // numbers: big vs smaller number (matches "stat+label v2")
  | 'diagonal'
  | 'stacked'; // point A/Б: diagonal (v2) vs stacked bands (v1)

/**
 * An image slot's persisted value. We support BOTH a Supabase Storage object
 * (the NEW `carousel-lab` bucket/path) AND an inline base64 fallback, so the
 * editor works offline/pre-upload and the export always has pixels.
 */
export type LabImage = {
  /** Storage object path within the `carousel-lab` bucket, e.g. `<uid>/<project>/<slide>-0.jpg`. */
  storagePath?: string | null;
  /** Public/signed URL for display (derived from storagePath, or an external URL). */
  url?: string | null;
  /** Raw base64 (no data-URL prefix) — inline fallback used before/without upload. */
  base64?: string | null;
  /** Natural aspect ratio hint (w/h) for contain-fit layout math when known. */
  aspect?: number | null;
};

/** One side of a point A→Б slide. */
export type LabPointSide = {
  label: string; // "ТОЧКА А:" / "ТОЧКА Б:"
  text: string; // justified body for that side
};

export type LabSlide = {
  id: string;
  type: LabSlideType;
  subtype: LabSubtype;
  picturePosition: LabPicturePosition; // meaningful for `text`
  variant: LabVariant;

  /** Primary heading / section label / CTA line 1. */
  title: string;
  /** Justified paragraph body (paragraphs separated by a blank line). For cover
   *  = subtext; for numbers = stat label; for testimonial = caption. */
  body: string;
  /** Optional trailing justified paragraph rendered BELOW a bullet list. */
  bodyAfter: string;

  /** Bullet / numbered list items (text `bullets`/`numbered`). */
  bullets: string[];

  /** Numbers slide. */
  statValue: string;
  // (statLabel uses `body`.)

  /** CTA keyword (rendered as a white knockout chip). */
  ctaKeyword: string;

  /** point A→Б sides (index 0 = A, 1 = Б). */
  points: LabPointSide[];

  /** Image slots. Count depends on subtype: text/testimonial-screenshot = 1;
   *  before_after / point_ab = 2; others = 0. */
  images: LabImage[];
};

export type LabProject = {
  id: string;
  name: string;
  styleId: LabStyleId;
  slides: LabSlide[];
  createdAt?: string;
  updatedAt?: string;
};

/** DB row shape for `carousel_lab_projects`. */
export type LabProjectRow = {
  id: string;
  user_id: string;
  name: string | null;
  style_id: string | null;
  slides: unknown;
  created_at: string;
  updated_at: string;
};
