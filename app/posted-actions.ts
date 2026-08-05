'use server';

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getProScope, insertProjectId } from '@/lib/pro/scope';
import { parseInstagramPostUrl } from '@/lib/insights/postedLink';
import { pullPostInsights } from '@/lib/insights/apifyInsights';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Posted links: capture, count, and pull (Prompts 2 & 4).
 *
 * The submission counter is DERIVED — `count(posted_url is not null)` across the
 * three content tables — never a stored tally. A stored counter is a number that
 * can disagree with reality the moment a piece is deleted or a link is cleared,
 * and a gamification number that drifts is worse than no number.
 */

const ALLOWED_TABLES: ContentPiece['refTable'][] = [
  'carousel_projects',
  'projects',
  'storytelling_projects',
];

export type SavePostedResult =
  | { ok: true; url: string; count: number }
  | { ok: false; error: string };

/**
 * Store the link the user pasted when a piece went live.
 *
 * `posted_at` is stamped here rather than derived from the status flip: the user
 * may add the link days after posting, and the moment they told US is not the
 * moment it went out. The scraper returns the real publish timestamp, which
 * overwrites this on the first pull.
 */
export async function savePostedLink(
  refTable: ContentPiece['refTable'],
  id: string,
  rawUrl: string,
): Promise<SavePostedResult> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'Потрібен вхід.' };
  if (!ALLOWED_TABLES.includes(refTable)) return { ok: false, error: 'BAD_TABLE' };

  const parsed = parseInstagramPostUrl(rawUrl);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from(refTable)
    .update({ posted_url: parsed.url, posted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[posted] savePostedLink failed', { refTable, id, message: error.message });
    return { ok: false, error: 'Не вдалося зберегти посилання.' };
  }

  return { ok: true, url: parsed.url, count: await countPostedLinks() };
}

/**
 * How many posted links the user has logged, across BOTH paths — pieces made in
 * Ruta and standalone links for things posted elsewhere (Prompt 4).
 */
export async function countPostedLinks(): Promise<number> {
  const user = await requireAuth();
  if (!user) return 0;
  const supabase = await createServerSupabaseClient();

  const { count, error } = await supabase
    .from('content_pieces')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .not('posted_url', 'is', null);

  if (error) {
    console.error('[posted] countPostedLinks failed', error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Log a link for something posted OUTSIDE Ruta (Prompt 4).
 *
 * Creates a minimal reel row purely to hang the link on. It is deliberately
 * status `published` and carries no scenes: it is a record of a post, not a
 * draft, and it must never show up in Розбір asking to be finished.
 */
export async function addStandalonePostedLink(
  rawUrl: string,
  title?: string,
): Promise<SavePostedResult> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'Потрібен вхід.' };

  const parsed = parseInstagramPostUrl(rawUrl);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createServerSupabaseClient();

  // Same link twice is the same post — the coin must not double-count it.
  const { data: existing } = await supabase
    .from('content_pieces')
    .select('id')
    .eq('user_id', user.id)
    .eq('posted_url', parsed.url)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existing) {
    return { ok: false, error: 'Це посилання вже додано.' };
  }

  const { error } = await supabase.from('projects').insert({
    user_id: user.id,
    name: title?.trim().slice(0, 120) || `Опубліковано ${parsed.shortcode}`,
    crew_mode: 'with_crew',
    project_type: 'reels',
    status: 'published',
    posted_url: parsed.url,
    posted_at: new Date().toISOString(),
    project_id: insertProjectId(await getProScope()),
  });

  if (error) {
    console.error('[posted] addStandalonePostedLink failed', error.message);
    return { ok: false, error: 'Не вдалося додати посилання.' };
  }

  return { ok: true, url: parsed.url, count: await countPostedLinks() };
}

export type PullResultSummary =
  | { ok: true; views: number | null }
  | { ok: false; error: string };

/**
 * Pull a posted piece's metrics and store them (Prompt 4).
 *
 * On failure `insights_fetched_at` is deliberately left UNSET so a later sweep
 * retries — a private or freshly-posted URL often succeeds on the second try,
 * and stamping the attempt would make the failure permanent.
 */
export async function refreshInsights(
  refTable: ContentPiece['refTable'],
  id: string,
): Promise<PullResultSummary> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'Потрібен вхід.' };
  if (!ALLOWED_TABLES.includes(refTable)) return { ok: false, error: 'BAD_TABLE' };

  const supabase = await createServerSupabaseClient();
  const { data: row } = await supabase
    .from(refTable)
    .select('posted_url')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle<{ posted_url: string | null }>();

  if (!row?.posted_url) return { ok: false, error: 'Спочатку додай посилання на пост.' };

  const pulled = await pullPostInsights(row.posted_url);
  if (!pulled.ok) return { ok: false, error: pulled.error };

  const { error } = await supabase
    .from(refTable)
    .update({
      insights_json: pulled.insights,
      insights_fetched_at: new Date().toISOString(),
      insights_source: 'apify',
      // The scraper knows when it actually went live; our stamp was only ever a
      // stand-in for "when the user told us".
      ...(typeof pulled.insights.postedAt === 'string'
        ? { posted_at: pulled.insights.postedAt }
        : {}),
    })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[posted] refreshInsights store failed', error.message);
    return { ok: false, error: 'Не вдалося зберегти статистику.' };
  }

  const views = typeof pulled.insights.views === 'number' ? pulled.insights.views : null;
  return { ok: true, views };
}
