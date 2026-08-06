# OpenRouter migration — equivalence proof

Acceptance for a plumbing swap is a side-by-side, not "the code path ran"
(task 86d3ymar8). The swap must send the **same model, same prompt, same
temperature, same max_tokens** — only the pipe changes. This folder proves that.

## The honest framing

Text generation runs at temperature **0.45–0.85**. Above temperature 0 the model
samples, so two calls with an identical prompt are *never* byte-identical — not
before the swap, not after, not even back-to-back on the same provider. "Identical
output" is not a physically meaningful bar for these calls. Equivalence rests on
the thing that *is* provable: the request the app builds is unchanged. So the proof
comes in two halves:

1. **Deterministic (committed, runs with no keys):** the request contract — model,
   prompt bytes, temperature, max_tokens, JSON mode — is identical before and after.
2. **Live (needs keys):** actual generated outputs from both pipes, side by side,
   to eyeball that the same model produces the same *kind* of result.

Whisper is the exception: it runs at temperature 0 on the same model and provider,
so its output *is* expected byte-identical.

## 1. Deterministic proof — `request-equivalence.md`

`request-equivalence.md` is generated from two captures of the **real generation
code**:

- `before-groq-gemini.json` — captured from checkout `e156f25` (pre-migration
  Groq/Gemini code).
- `after-openrouter.json` — captured from this branch (OpenRouter).

Both come from `scripts/proof/openrouter-capture.mjs`, which runs one fixed
braindump through each generator with `global.fetch` intercepted: it records the
exact outbound request and returns a canned response, so **no API key and no live
model call** are involved. The renderer deep-compares the two and asserts, per
generator, that the `messages` array (full system + user prompt), `temperature`,
`max_tokens`, and JSON-mode request are identical — then reports the transport
delta (provider, endpoint, auth, model slug).

Result: **PASS** for all five directly-capturable generators — reel scenario,
storytelling, scene splitting, idea angles, transcript→template. Same prompt hash,
same temperature, same max_tokens on both sides; only the endpoint, the bearer key,
and the model *slug* (which maps to the same underlying model) differ.

- **Carousel** builds its prompt inside an authenticated route, so it is not run
  through the capture harness. `carousel-route.diff` is the full git diff of that
  file for this change: `temperature: 0.7` and the entire system prompt are
  untouched; `max_tokens: 3000` is preserved; only the transport lines move.

Reproduce:

```bash
# AFTER (this branch)
node --import ./scripts/proof/_register.mjs ./scripts/proof/openrouter-capture.mjs \
  > docs/proof/openrouter-migration/after-openrouter.json

# BEFORE (in a worktree at the pre-migration commit, with the proof tooling copied in)
git worktree add --detach /tmp/before e156f25
# (symlink node_modules, copy scripts/proof/_register.mjs, _tsloader.mjs,
#  _stubs/, openrouter-capture.mjs into /tmp/before, then:)
cd /tmp/before && node --import ./scripts/proof/_register.mjs ./scripts/proof/openrouter-capture.mjs \
  > <repo>/docs/proof/openrouter-migration/before-groq-gemini.json

# Diff + render (exits non-zero on any prompt/param drift)
node ./scripts/proof/openrouter-equivalence.mjs
```

## 2. Live proof — `openrouter-live-braindump.mjs`

The actual "matching outputs" run. It needs real credentials, which the CI sandbox
does not have, so it is provided ready-to-run rather than pre-captured:

```bash
OPENROUTER_API_KEY=... GROQ_API_KEY=... \
  node --import ./scripts/proof/_register.mjs ./scripts/proof/openrouter-live-braindump.mjs
```

It runs one braindump through reel + storytelling on both pipes in a single process
— the current code builds each request once (identical prompt), and a `fetch` shim
sends it to OpenRouter (AFTER) or rewrites the same body to Groq with the
pre-migration slug (BEFORE). Output: `live-before-after.md`, the two results side by
side. Run it on this branch and eyeball that the same model yields the same kind of
scenario/story.

## Files

| File | What it is |
|---|---|
| `before-groq-gemini.json` | Request contracts captured from pre-migration code (`e156f25`) |
| `after-openrouter.json` | Request contracts captured from this branch |
| `request-equivalence.md` | Deterministic PASS/FAIL diff of the two (the proof) |
| `carousel-route.diff` | Full git diff of the carousel route — transport-only change |
| `live-before-after.md` | Written by the live harness when run with keys (not committed) |

See `/AI_AUDIT.md` at the repo root for the full model map and every verbatim
system prompt.
