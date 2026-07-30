# Autobuild — 2026-07-30

Branch: `autobuild/2026-07-30`
Source of truth: ClickUp list **Tasks for Claude** (`901615191603`), then **RUTA App tasks** (`901612814533`) cleanup.
Review status used: **"to review"**.

Scope agreed with Ruta (pre-flight):
1. Build the 3 `ready to go` (fully specced).
2. Finish the 1 `in progress`.
3. Resolve the 2 `needs input` autonomously where possible.
4. Verify the 3 `to review`; mark complete where no physical check by Ruta is needed.
5. Scan/clean the **RUTA App tasks** list — do relevant tasks or delete junk/mistaken ones.
6. If nothing left: research UX best practices and refine the app design.

Per-feature loop: build → Playwright test → run green → commit → move ClickUp task to "to review".

---

## Queue status

| # | Task | Status | Result |
|---|------|--------|--------|
| 1 | 86d3gp8tb — Storytelling engine master prompt (single + saga) | ready to go | ✅ done → to review |
| 2 | 86d3fcnny — Perceived-lag fix (optimistic UI) | ready to go | ✅ done → to review |
| 3 | 86d3e1egm — Domain split + access-code gated signup | ready to go | pending |
| 4 | 86d3c7u88 — Auto-save 5/8 follow-ups | in progress | pending |
| 5 | 86d3dcwyy — Braindump 50-word gate + live counter | needs input | pending |
| 6 | 86d3czf1e — Idea→content link persist | needs input | pending |
| 7 | 86d3dezu4 — Braindump overlay scrollable | to review | verify |
| 8 | 86d3dcn4d — idea→reel double hooks/CTAs | to review | verify |
| 9 | 86d3d23qu — Hide global navbar on editors | to review | verify |
| — | RUTA App tasks list cleanup | — | pending |

---

## Feature 1 — 86d3gp8tb — Storytelling engine master prompt (single + saga)

**Spec:** master system prompt for the storytelling generator. Takes a braindump (50+ words) + a
storytelling **name** (emotional goal), decides single vs saga, writes in Ruta's voice with honest
`*placeholder*` director's notes, and (saga) closes the 4 прогрів barriers day by day.

**Shipped:** rewrote `lib/ai/rantToStories.ts` to use Ruta's master prompt (single-vs-saga
detection, кейси A/B variant, 4-barrier spine, voice rules, honest placeholders). Extracted the
pure transform into `lib/ai/storiesNormalize.ts`. Wired `createStorytellingProjectFromRant` to
persist **one column per day** (saga → N columns). API route + engine now accept an optional `name`.

**Test:** `e2e/storytelling-engine.logic.spec.ts` (new `logic` Playwright project) — single→1 day,
saga→N days, CTA only on the final slide, placeholder preservation, malformed-payload fallback.
3/3 green. The test caught a real double-CTA bug (earlier saga days kept a stray `Заклик в директ`),
now fixed in `storiesNormalize`.

**Judgment calls (for QA):**
1. **Free-text prompt → JSON contract.** The spec's prompt is written to output free text
   (`Сторіс N` / `Візуал:` / `Інтерактив:`). The app pipeline needs structured data, so I kept
   every content rule verbatim but swapped the output section to a JSON schema (`days[].slides[]`).
   Visual/Interactive tags → slide fields; `*placeholders*` stay inline in `screen_text`; the Step-1
   reason line → `reason`. Zero content rules dropped.
2. **`{{NAME}}` is optional.** There is no "name" field in the braindump entry UI (the only entry
   point). Made `name` optional end-to-end; when empty the engine infers the emotional goal from the
   braindump. If you want an explicit name field, that's a small follow-up UI task.
3. **Saga rendering reuses existing columns.** The spec parks the saga UI/data-model as a separate
   task. Rather than build new UI, each saga *day* becomes a `storytelling_columns` column — the
   board already renders N columns — so saga works end-to-end with no new UI. The info-banner /
   single-vs-saga override the spec mentions is still the parked task.
4. **Model unchanged** (`llama-4-scout-17b`). This prompt is demanding on voice/nuance; a stronger
   model would likely produce more on-brand output. Left as-is to avoid a cost/behavior change —
   flagging for you to eval and decide.
5. **New `logic` Playwright project** (`*.logic.spec.ts`) added to `playwright.config.ts`: no
   browser, no auth-setup, `webServer` skipped via `PW_SKIP_WEBSERVER=1`. Lets deterministic core
   logic be tested in CI without a booted app. Existing browser projects untouched.

---

## Feature 2 — 86d3fcnny — Perceived-lag fix (optimistic UI)

**Shipped:** `StorytellingBuilder.handleAddColumn` / `handleAddStory` no longer `await` the insert
before rendering — they append to local state instantly, then persist in the background. New pure
module `lib/storytelling/optimistic.ts` (genClientId / nextOrderIndex / builders). Server actions
`createStorytellingColumn` / `createStorytellingStory` accept optional client-provided ids.

**Test:** `e2e/storytelling-optimistic.logic.spec.ts` (4 tests, green) pins the ordering + builder
contract; `e2e/storytelling-optimistic.spec.ts` is the guarded browser harness for the full
instant-render + reload-persists flow (self-skips without `E2E_ACTIVE_*`).

**Judgment calls (for QA):**
1. **Client-generated stable UUIDs, not temp-id -> reconcile.** The spec suggests a temp id swapped
   for the real id after insert. But `StoryCard` autosaves by `story.id` on every keystroke — during
   a reconcile window, edits to a just-created card would target a non-existent row and be lost.
   Instead I generate the id on the client (`crypto.randomUUID`, with a v4 fallback for non-secure
   contexts) and pass it into the insert, so the id is real from the first render. No reconcile, no
   race, no lost edits. Payload otherwise unchanged (RLS-safe).
2. **`order_index` = max+1, not array length.** Spec explicitly asked for max(order_index)+1; the old
   code used array length, which collides after deletes/reorders. Fixed.
3. **Minimal toast for rollback.** No toast system existed, so I added a small self-dismissing banner
   (`data-testid="storytelling-toast"`) shown only when a background insert fails.
4. Browser e2e can't run in this environment (no seeded auth / no server), so it's a guarded harness
   matching the repo's existing convention; the logic spec is the executed green coverage.
