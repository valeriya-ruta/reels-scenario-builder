# Ruta Pro (operator edition)

Private operator edition of Ruta. Same app + engine, with a top-level
blogger/project selector. Ships from the `pro` branch to its own Vercel
project; the customer app ships from `main` and is untouched.

- Gate: `profiles.role = 'operator'`.
- Isolation: additive schema only; every content row carries a nullable
  `project_id` (customer rows stay NULL).
- Public build env lives in `.env.production` (non-secret). Add secret keys
  (OPENROUTER_API_KEY, APIFY_*, …) in the Vercel project for the AI features.

See `supabase/migrations/pro_v1_init.sql` for the schema.
