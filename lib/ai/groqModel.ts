/**
 * Central Groq text model id, used by every server-side generation call
 * (carousel / reel / storytelling / transcript→template).
 *
 * The previous default `meta-llama/llama-4-scout-17b-16e-instruct` was
 * decommissioned by Groq (404 `model_not_found`), which broke ALL of the above
 * at once. Centralizing it here means a future deprecation is a one-line change,
 * and it can be overridden without a redeploy via the GROQ_MODEL env var.
 *
 * `llama-3.3-70b-versatile` is a current, stable Groq production model that
 * supports JSON-object responses (which every caller relies on).
 */
export const GROQ_TEXT_MODEL = process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
