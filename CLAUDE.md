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
