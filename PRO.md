# Ruta Pro (operator edition)

Private operator edition of Ruta. Same app + engine, with a top-level
blogger/project selector. Ships from the `pro` branch to its own Vercel
project; the customer app ships from `main` and is untouched.

- Gate: `profiles.role = 'operator'`.
- Isolation: additive schema only; every content row carries a nullable
  `project_id` (customer rows stay NULL).
- Public build env lives in `.env.production` (non-secret). Add secret keys
  in the Vercel project for the AI features:
  - **`OPENROUTER_API_KEY`** (or `GROQ_API_KEY`) — text generation AND Whisper
    transcription both go wherever this points. Without one, transcripts fail
    with «Транскрипт потребує уваги» and every other AI feature fails quietly.
    OpenRouter wins if both are set; `AI_PROVIDER=groq|openrouter` pins it.
    Model overrides: `OPENROUTER_MODEL`, `OPENROUTER_STT_MODEL`, `GROQ_MODEL`.
  - `APIFY_*` — competitor scans.

See `supabase/migrations/pro_v1_init.sql` for the schema.
