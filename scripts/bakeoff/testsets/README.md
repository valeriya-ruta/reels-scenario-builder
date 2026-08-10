# Test sets

One JSON file per test set. The bake-off reads every `.json` in this directory
(files starting with `_` are ignored, so `_TEMPLATE.json` is skipped).

Task [`86d3ymaw7`](https://app.clickup.com/t/86d3ymaw7) asks for **3–5 test sets**, each one:

1. a **raw braindump** — exactly what you'd paste into the app, unedited,
2. your **ideal finished result** — what you'd have written by hand,
3. the **rules you applied** — what made your version good.

Item 3 is the one that's easy to skip and the most valuable. The rules are what
turn "this output feels worse" into a specific, fixable drift.

## Fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Filename-safe, used in output paths |
| `label` | no | Human name shown in the report |
| `braindump` | for carousel / reel / storytelling | The raw rant. Ukrainian or English — the prompts auto-detect. |
| `storytellingName` | no | The storytelling's emotional goal (мотивація, експертність, FOMO…). Empty = the model infers it from the braindump. |
| `ideasSignals` | for `ideas` | Array of signals. Omit entirely to test the cold-start path. |
| `ideasExclude` | no | Titles already seen, for testing the «ще раз» re-roll |
| `ideal` | strongly recommended | Object keyed by generation type. Value can be free text or JSON. |
| `rules` | strongly recommended | Array of strings — the rules you applied |

`ideasSignals` entries look like:

```json
{ "kind": "proven", "label": "Рілс про помилки колористів", "ageDays": 3, "type": "reels" }
```

`kind` is one of `proven`, `unused-dump`, `stale`, `cold-start`.

## A note on braindump length

The storytelling prompt states a 50-word minimum. Shorter braindumps test a path
the prompt does not expect, which is a legitimate thing to test — just do it
deliberately, in its own test set, rather than by accident in all of them.

## Coverage worth aiming for

The generation types stress different things, so vary the sets rather than
running five near-identical braindumps:

- one that should clearly be a **single** storytelling (one moment, one belief)
- one that should clearly be a **saga** (a launch, an offer, several beliefs)
- one **emotional / messy** braindump — voice preservation is the hardest thing to get right
- one in **English**, if the app needs to hold up in English
- one **short or awkward** one — where models fall apart is as informative as where they shine
