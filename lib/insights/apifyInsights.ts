import 'server-only';

import { requireServerEnv, optionalServerEnv } from '@/lib/env';
import { normalizeApifyPost } from '@/lib/insights/apifyNormalize';
import type { InsightsPayload } from '@/lib/insights/postedLink';

/**
 * Pull a posted piece's Instagram metrics via Apify (Prompt 4).
 *
 * ACTOR: `apify/instagram-scraper` (shu8hvrXbJbY3Eb9W). Chosen over the
 * alternatives after checking the Store:
 *  - it takes `directUrls`, so ONE actor covers both `/p/` (carousels, photo
 *    posts) and `/reel/` — the other candidates key off a username and return a
 *    profile feed, which is the wrong shape for "this exact post";
 *  - it is official Apify (347k users, 99.5% success), same vendor family the
 *    app already uses for competitor scans, so no new trust surface;
 *  - flat per-result pricing.
 *
 * ⚠️ WHAT SCRAPING CANNOT GIVE US — read before promising numbers in the UI.
 * The actor's output schema carries `likesCount`, `commentsCount`,
 * `videoViewCount` and `videoPlayCount`. It does NOT carry **reach** or
 * **saves**, and no scraper can: those are Instagram *Insights* metrics that
 * Instagram exposes only to the account owner through the Graph API. Any actor
 * advertising "saves" for an arbitrary public post is claiming something the
 * platform does not publish.
 *
 * That is exactly why `insights_source` reserves `'graph'`. Reach and saves
 * arrive with that upgrade, not with this one — so the UI must show what we
 * actually have rather than an empty "Збереження: —" row implying a failure.
 *
 * Shares: obtainable for REELS only, via `apify/instagram-reel-scraper`'s paid
 * `includeSharesCount` add-on. Not wired here — it is a second run per reel at
 * extra cost, and worth a deliberate decision rather than a silent default.
 */

const APIFY = 'https://api.apify.com/v2';
const DEFAULT_POST_INSIGHTS_ACTOR = 'apify~instagram-scraper';

export { normalizeApifyPost } from '@/lib/insights/apifyNormalize';

export type PullResult =
  | { ok: true; insights: InsightsPayload }
  | { ok: false; error: string };

/**
 * Fetch metrics for a single posted URL. `run-sync-get-dataset-items` keeps this
 * a single request; the caller decides how often to re-pull.
 */
export async function pullPostInsights(postedUrl: string): Promise<PullResult> {
  const token = requireServerEnv('APIFY_TOKEN');
  const actorId =
    optionalServerEnv('APIFY_POST_INSIGHTS_ACTOR_ID') || DEFAULT_POST_INSIGHTS_ACTOR;

  const endpoint = `${APIFY}/acts/${encodeURIComponent(
    actorId,
  )}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        directUrls: [postedUrl],
        resultsType: 'posts',
        // One URL in, one post out. Anything higher bills for a feed we discard.
        resultsLimit: 1,
        addParentData: false,
      }),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }

  if (!res.ok) {
    const body = await res.text();
    console.error('[insights] Apify HTTP error:', res.status, body.slice(0, 300));
    return { ok: false, error: `Apify ${res.status}` };
  }

  const items = (await res.json()) as unknown[];
  const insights = normalizeApifyPost(Array.isArray(items) ? items[0] : null);
  if (!insights) {
    // A private, deleted or region-blocked post lands here. Not an app error —
    // the caller should leave insights_fetched_at unset and try again later.
    return { ok: false, error: 'Не вдалося зчитати статистику цього поста.' };
  }
  return { ok: true, insights };
}
