// ─────────────────────────────────────────────────────────────────────────────
// Modern Elegant — design tokens.
// Values parsed from the Figma SVG exports (carousel designs/modern elegant/*.svg):
//   • canvas 1080×1350, solid background #BCC7AB
//   • all text OUTLINED to paths → colors/positions/slot geometry are pixel-truth,
//     font identity comes from the typography RULES (Google Sans, ALL CAPS).
//   • image placeholders are #D9D9D9 rects (exact x/y/w/h captured below).
//   • highlight motif = white chip with knockout background-colored text.
// Where the design drifted (varying margins 68–100px, one CTA body left-aligned
// instead of justified) we standardize to the rule and record it in the report.
// ─────────────────────────────────────────────────────────────────────────────

export const COLORS = {
  background: '#BCC7AB',
  title: '#FFFFFF',
  body: '#FFFFFF',
  icon: '#FFFFFF',
  chipFill: '#FFFFFF',
  /** Knockout text sitting on a white chip == the background color. */
  chipText: '#BCC7AB',
  /** Empty image slot: solid white (per feedback — never the old #D9D9D9 gray). */
  imagePlaceholder: '#FFFFFF',
} as const;

export const FONT_FAMILY = 'GoogleSansElegant';

/** Font weights (Google Sans faces we ship). */
export const WEIGHT = {
  body: 500,
  title: 700,
  chip: 600,
  label: 700,
} as const;

/** Line-height multipliers (× font size). Calibrated against the reference rasters. */
export const LINE_HEIGHT = {
  title: 1.14,
  body: 1.42,
  bullet: 1.9, // bullets get airy spacing (chip has vertical padding)
  stat: 1.0,
} as const;

/**
 * Type sizes in design px (canvas = 1080×1350). HARD RULES:
 *   Title: 100 on Cover, 70 on all other slides.
 *   Body : 50 on Cover, 35 on all other slides.
 */
export const SIZE = {
  coverTitle: 100,
  coverBody: 50,
  slideTitle: 70,
  slideBody: 35,
  bullet: 40,
  statLarge: 210,
  statSmall: 140,
  ctaKeyword: 70,
} as const;

/** Paragraph gap (blank line) as a fraction of body line-height. */
export const PARAGRAPH_GAP = 0.55;

/** Gaps between stacked blocks (design px). */
export const GAP = {
  coverTitleToBody: 22,
  slideTitleToBody: 30,
  titleToBullets: 40,
  bulletsToBody: 40,
  titleToImage: 36,
  imageToBody: 40,
  statToLabel: 24,
  ctaLineGap: 18,
  iconsToBody: 40,
} as const;

/** Highlight chip padding (design px) around knockout text. */
export const CHIP = {
  padX: 24,
  padY: 12,
  radius: 6,
  /** Gap between one bullet chip line and the next. */
  gap: 14,
} as const;

/**
 * Per-slide-type content geometry. `marginX` is the left text margin; `maxTextW`
 * the wrap width. Vertical strategy: 'center' centers the composed block,
 * 'top' anchors near the top (content-heavy), 'half' centers within the free
 * half left by a full-bleed image.
 */
export type VStrategy = 'center' | 'top' | 'half';

export const LAYOUT = {
  cover: { marginX: 96, maxTextW: 888, vstrategy: 'center' as VStrategy, topAnchor: 0 },
  // dense text slides sit a touch off the left edge and flow from the top
  text: { marginX: 76, maxTextW: 928, vstrategy: 'center' as VStrategy, topAnchor: 96 },
  bullets: { marginX: 76, maxTextW: 928, vstrategy: 'top' as VStrategy, topAnchor: 150 },
  numbers: { marginX: 96, maxTextW: 888, vstrategy: 'center' as VStrategy, topAnchor: 0 },
  cta: { marginX: 76, maxTextW: 928, vstrategy: 'center' as VStrategy, topAnchor: 0 },
  testimonial: { marginX: 96, maxTextW: 888, vstrategy: 'center' as VStrategy, topAnchor: 0 },
} as const;

/** Safe padding inside a half-canvas region left by a full-bleed image. */
export const IMAGE_HALF_PAD = 44;

// ── Image slots (EXACT rects from the SVGs) ─────────────────────────────────
export type Slot = { x: number; y: number; w: number; h: number };

export const SLOTS = {
  /** Text slide, picture up: full-bleed top half. */
  textImageUp: { x: 0, y: 0, w: 1080, h: 675 } as Slot,
  /** Text slide, picture down: full-bleed bottom half. */
  textImageDown: { x: 0, y: 675, w: 1080, h: 675 } as Slot,
  /** Before/after: two flush portrait frames, cover-fit, identical crop. */
  beforeAfter: [
    { x: 78, y: 250, w: 444, h: 850 },
    { x: 558, y: 250, w: 444, h: 850 },
  ] as Slot[],
  /** Text testimonial screenshot: contain-fit frame, never cropped. */
  screenshot: { x: 96, y: 390, w: 888, h: 570 } as Slot,
  /** Point A→Б diagonal squares (A top-left, Б bottom-right). */
  pointAbDiagonal: [
    { x: 75, y: 239, w: 410, h: 441 },
    { x: 595, y: 794, w: 410, h: 441 },
  ] as Slot[],
  /** Point A→Б stacked wide bands (variant). */
  pointAbStacked: [
    { x: 75, y: 187, w: 896, h: 274 },
    { x: 75, y: 868, w: 896, h: 274 },
  ] as Slot[],
} as const;

/** CTA "action-with-icons" — 4 PARKED placeholder circles (icons intentionally
 *  not sourced). Centers/size approximate the SVG's 4 Instagram glyph slots. */
export const CTA_ICONS = {
  y: 717,
  radius: 46,
  strokeW: 7,
  centersX: [122, 232, 342, 452],
} as const;

/** point A→Б diagonal: which column the text sits in, per side. */
export const POINT_AB_TEXT = {
  // side A: image left, text right column
  aTextX: 545,
  aTextW: 460,
  aLabelX: 76,
  aTopY: 130,
  // side B: text left column, image right
  bTextX: 76,
  bTextW: 460,
  bLabelX: 76,
  bTopY: 940,
} as const;

/** Soft text limits (documented). Overflow is wrapped/clipped, never breaks layout. */
export const LIMITS = {
  coverTitle: 46,
  coverSubtext: 140,
  slideTitle: 70,
  body: 400,
  bulletItem: 44,
  bulletsMax: 7,
  statValue: 12,
  statLabel: 160,
  ctaKeyword: 22,
  pointText: 180,
} as const;
