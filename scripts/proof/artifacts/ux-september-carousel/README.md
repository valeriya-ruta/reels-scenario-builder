# Carousel export ↔ editor parity — September UX pass

Acceptance for a render change is a side-by-side, not "the code path ran".

`compare-*.jpg` — EDITOR | EXPORT, both rendered at 1080×1350 from the same slide
data (vibe `refined`, font `inter`, bg `#232C3F`, text `#F0EEE9`).
`diff-*.jpg` — every pixel differing by more than 24/765; red is the drift, the
dim underlay is the editor for context.

Reproduce:

```bash
node scripts/proof/tw-refined.mjs
node --import ./scripts/proof/_register.mjs ./scripts/proof/render-refined.mjs
node scripts/proof/shoot-refined.mjs
node scripts/proof/diff.mjs
```

## What the proof caught

Differing-pixel share, before → after (lower is better; the floor is glyph
rasterisation, which can never be zero because Chrome and Skia hint differently):

| slide     | before | after |
|-----------|--------|-------|
| 1-cover   | 4.220% | 0.745% |
| 2-content | 2.810% | 1.412% |
| 3-bullets | 4.324% | 2.088% |
| 4-quote   | 3.037% | 1.024% |
| 5-cta     | 3.984% | 0.587% |

Four real defects, each visible as SOLID red in the before-diffs (a genuine
offset paints the whole glyph; antialiasing only paints its edges):

1. **`firstBaseline` used the ink ascent, not the font ascent.** CSS puts the
   baseline at `halfLeading + fontBoundingBoxAscent`; the code used
   `actualBoundingBoxAscent` of `"Mg"` (~0.69em vs ~0.92em), lifting every text
   block by ~0.23em — 22px on a 96px title.
2. **Half-leading was measured against `fontSize` and clamped at zero.** CSS
   measures it against the font's content height (ascent+descent) and lets it go
   negative, which is exactly what a tight `leading-[1.0]` does. The clamp pushed
   blocks back down and partially masked (1).
3. **The CTA accent box assumed `line-height: 1.2`.** The editor's `<p>` carries
   no leading class, so it inherits Tailwind's 1.5 — the exported box came out
   96px tall against the editor's 108.
4. **Centred wrapped lines included the whitespace they broke on.** CSS drops it;
   `segmentsToWords` glues trailing whitespace onto the preceding token, so every
   centred wrapped line sat half a space too far left (~14px on the cover title).
   The last line matched exactly, which is what pointed at the cause.

Plus one editor-side inconsistency the proof surfaced: the cover subline had no
alignment class, so it inherited `left` under a force-centred title — the editor
disagreed with itself. It now follows the title.
