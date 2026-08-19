# Working with Ruta

## How to report

Short. She reads the last thing in the message and nothing else, so put it there
and keep it to a few lines.

**Only ask strategic questions** — product, UX, what the app should do. Never ask
about migrations, schema, RLS, table names, libraries, or any other engineering
decision. She has said, in these words, that she gives zero flying fucks about
those. Decide them yourself and move on; mention them only if she asks.

She judges the work by clicking the actual app, not by reading a summary. So the
report is short and the deploy is the deliverable.

End every report with **what to open and what to look for**. She needs to know
what to test; she should not have to work it out from a diff.

## Ship fast (until she says otherwise)

Until 2026-09-10 she is the only person using the app. So: push to production,
ship whole features rather than thin slices, and let her find the rough edges by
using it. It does not have to be right the first time. She will say when there
are real users, and then it goes back to previews and caution.

**Merge to `main` yourself — never ask.** She tests in the real app, not on a
preview URL, so work that stops on a branch is work she cannot see. Finish the
feature, merge it to `main`, push, and tell her what to look for once it is
live. She has said this explicitly; asking again is the thing to avoid.

Still non-negotiable regardless: never destroy her existing work, and never
break `pro`.

## Editions

- `main` — the customer app. A creator with a phone, filming herself.
- `pro` — the operator app, deployed separately. See PRO.md on that branch.
- One shared Postgres. **Schema changes are additive only. Nothing on main may
  break pro.**

## What «Зробити рілс» must do to a spoken dump

These are hers, said while testing, and they are the difference between a
usable script and a wall of text. They live in `lib/ai/reelText.ts`.

- **60–90 seconds.** ~150–230 words. Two minutes is rare and deliberate; three
  is a failure. Instagram allowing three does not make three good.
- **Cut the long explanations.** She explains how things work at length when
  talking. One sentence each in the script; three examples become the best one.
- **She interrupts herself, and the rewrite must RESTRUCTURE, not just trim.**
  She starts a thought, jumps to an example, comes back. The example belongs
  where it fits and the interrupted thought gets said once, to the end. A
  script that still shows her losing the thread has not been rewritten.
- **Recording order is not script order.** She covers a topic, moves to another,
  and comes back to the first at the end. That tail belongs merged into the
  first part — not left where she happened to say it. «Everything I say doesn't
  mean that it should stay there.» A script you can read the recording order off
  has been tidied, not rewritten.
- **Never invent.** No fact, example, number, place or opinion she did not say.
- **Her words over better words.** The carousel prompt (`lib/ai/carouselPrompt.ts`)
  is the reference for tone — written in Ukrainian, voice-first, specific.
  English bullet-point prompts produce polite Ukrainian filler.
- **Коротше rewrites, it does not truncate.** Cutting the second half is not
  «shorter», it is unfinished.

## Transcription

**Accuracy first, speed second.** Her words, said the way she actually says them
— hesitating, correcting herself, half in borrowed words («рілс», «сторіз»,
«хук»). A transcript that reads fluently but changed a word is worse than one
with «ееее» in it, because the rewrite then argues from something she never
said and she reads it aloud on camera.

So a take is transcribed TWICE: in short segments while she talks, so words
appear, and then whole — with all its own context — as the version that gets
kept. The segments are a preview and are allowed to be wrong; nothing waits on
the accurate pass, it swaps itself in. Never make the preview the answer,
however tempting the latency is: short slices with no context is exactly what
was getting her wrong.

## Rules that came from real breakage

- One source of truth per concept. A hand-copied list of reel columns drifted in
  three readers in a day and silently emptied a reel on screen. Typing a field
  list a second time means exporting a constant instead.
- Pure logic in `lib/`, tested as `*.logic.spec.ts`
  (`PW_SKIP_WEBSERVER=1 npx playwright test --project=logic`). Thin UI.
- Verify database work by impersonating the role (`set local role authenticated`
  with JWT claims), never the service role — it bypasses RLS and will report a
  broken policy as working.
- Save state visible, leaving guarded. Work was lost to a 600ms debounce plus a
  reload.

## Mobile rules — requirements, not preferences

- Design for the keyboard OPEN. That is the main screen's primary state.
- One column always. No side margins, no two-pane, no horizontal scroll.
- Everything frequent in the bottom third; a thumb can't reach the top of a 6".
- Paste is the import. A file picker is three extra screens.
- Drag is never the only way to reorder — always offer up/down too.
- 44pt targets, script text 17px+.
- Test at 390×844 with the keyboard up (~390×390 of usable height).

## Language

Ukrainian in the UI. English in code, comments and commit messages. Reply to her
in English.
