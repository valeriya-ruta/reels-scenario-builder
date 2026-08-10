# Model bake-off harness

Runs the app's **production** generation prompts through candidate OpenRouter
models and scores the results, so the default model per generation type is a
decision backed by evidence rather than a guess.

ClickUp: [`86d3ymaw7`](https://app.clickup.com/t/86d3ymaw7). Prompt inventory: [`AI_AUDIT.md`](../../AI_AUDIT.md).

## The API key

The bake-off runs **on your machine**, not on Vercel. It needs the key in your shell:

```bash
export OPENROUTER_API_KEY=sk-or-v1-...       # from https://openrouter.ai/keys
```

Vercel is a separate, later step: the app itself does not talk to OpenRouter yet
(that's task [`86d3ymar8`](https://app.clickup.com/t/86d3ymar8)). Adding the key to
Vercel now would do nothing. Never commit the key.

## Run it

```bash
# everything, all four types, all candidates
node --import ./scripts/proof/_register.mjs scripts/bakeoff/run.mjs

# one type while iterating
node --import ./scripts/proof/_register.mjs scripts/bakeoff/run.mjs --types storytelling

# three samples per cell — production runs at temperature 0.7–0.85, so one
# sample tells you about one roll of the dice, not about the model
node --import ./scripts/proof/_register.mjs scripts/bakeoff/run.mjs --runs 3

# build every prompt and write it out without spending anything
node --import ./scripts/proof/_register.mjs scripts/bakeoff/run.mjs --dry-run
```

The `--import ./scripts/proof/_register.mjs` prefix is what lets a plain `.mjs`
script import the app's TypeScript and `@/` aliases. It's the same loader the
existing proof harness uses.

### Flags

| Flag | Default | |
|---|---|---|
| `--types` | all four | `carousel,reel,storytelling,ideas` |
| `--models` | see `registry.mjs` | comma-separated OpenRouter slugs |
| `--sets` | `scripts/bakeoff/testsets` | a directory or a single `.json` |
| `--runs` | `1` | samples per cell |
| `--out` | `scripts/bakeoff/out` | output root (gitignored) |
| `--dry-run` | off | build prompts, call nothing |

## Verify the scorer without an API key

```bash
node --import ./scripts/proof/_register.mjs scripts/bakeoff/verify.mjs
```

Feeds known-good and known-bad fixtures through every rule check and asserts each
rule fires exactly when it should. Run this after editing `rules.mjs`.

## What comes out

```
scripts/bakeoff/out/run-<timestamp>/
  report.md      ← the scoring sheet
  summary.json   ← every record, machine-readable
  raw/           ← one file per generation: messages, raw text, parsed, normalized
```

## How it decides

Two passes, deliberately separate.

**Mechanical (automatic).** Every objectively-checkable instruction in the
production prompts is a rule in `rules.mjs`: reel scenes must be 6–11 words, a
carousel must open on `cover` and close on `cta` with no two adjacent
`statement`s, a saga's `Заклик в директ` may appear only on the final slide of
the final day, ideas must be three distinct non-question titles under 60 chars,
and so on. This pass answers *did the model follow the prompt* — and it runs on
**raw** output, before the app's normalizers, because
`carouselRantPostProcess` / `storiesNormalize` repair most violations silently.
Score the normalized output and you are scoring the normalizer.

**Editorial (you, or Claude reading the report).** Voice, hook quality, whether
the turn lands, whether it sounds like Ruta. Section 6 of the report is a blank
table per generation type; the ideal results and the rules from each test set are
inlined in section 7 so scoring needs one file open, not five.

A rule that *every* model breaks is a prompt bug, not a model verdict — fix the
prompt and re-run before picking a winner.

## Adding a generation type

`registry.mjs` holds one entry per type: a `buildMessages(set)` that imports the
real prompt builder, the sampling params, a `check`, and an optional `normalize`.
Types 5 and 6 in `AI_AUDIT.md` (transcript→template, scene splitting) are not in
the bake-off because the task scopes it to the four content generators; both drop
in the same way if that changes.

## Once a winner is picked

`lib/ai/groqModel.ts` currently exports a single `GROQ_TEXT_MODEL` shared by five
call sites, so there is no way to give carousel and storytelling different
defaults. If the bake-off picks different winners per type — likely — that module
has to become a per-purpose map first. Noted at the bottom of `AI_AUDIT.md`.
