# September UX pass — the new surfaces, rendered

A refinement pass is a visual claim, so "it compiles" is not acceptance.
`ux-september.jpg` renders the new surfaces with the REAL components, the real
design tokens from `app/globals.css` and real compiled Tailwind — no mockups.

Reproduce:

```bash
PROOF_DIR=_proofout_ux node scripts/proof/tw-refined.mjs
node --import ./scripts/proof/_register.mjs ./scripts/proof/ux-september.tsx
```

What it shows, top to bottom:

1. **Proposals** — three angles, each with its one-line rationale. This is the
   front door of every creation entry point; the free-text box is demoted below.
2. **Keep / Regenerate / Tweak** — the three verbs every AI result is acted on
   with, over the engine's own first-person reasoning line.
3. **Content cards** — the content is the headline and the name drops to an
   eyebrow. The carousel renders its actual cover in its actual palette; the
   reel shows its hook; the story its opening line. The last card is the
   degraded case: a piece with no body yet still reads as itself.
4. **Розбір** — the staging count as pressure, escalated (amber) because two
   items are past the nudge threshold.
5. **Two reel modes** — stated at the top of the editor, not buried in it.
6. **Суфлер** — the dark reading surface, with ХУК/CTA as margin labels that are
   never mixed into what gets spoken.

Known harness artifact: the content-type glyphs render as their ligature names
("vie", "mo") because this offline Chrome cannot fetch the Material Symbols
subset. The app loads it in `app/layout.tsx` and renders the glyphs correctly.
