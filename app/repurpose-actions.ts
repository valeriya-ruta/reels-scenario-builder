'use server';

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { resolveReferenceMediaUrl } from '@/lib/ai/referenceMedia';
import {
  InstagramReferenceInputError,
  InstagramReferenceNoVideoError,
  InstagramReferenceSystemError,
} from '@/lib/ai/instagramMedia';
import {
  fetchThreadsPost,
  ThreadsPostEmptyError,
  ThreadsPostNotFoundError,
  ThreadsPostSystemError,
} from '@/lib/ai/threadsPost';
import { transcribeMediaFromUrl } from '@/lib/ai/sttProvider';
import { generateThreadFromBrief } from '@/lib/ai/repurposeToThread';
import { threadToPlainText } from '@/lib/ai/threadNormalize';
import { aiLimit, transcribeLimit } from '@/lib/ratelimit';
import { sanitizePipelineErrorForUser } from '@/lib/sanitizePipelineError';
import { detectRepurposeSource, UNSUPPORTED_SOURCE_MESSAGE } from '@/lib/repurpose/sourceUrl';
import { repurposeSourceTitle } from '@/lib/repurpose/compose';
import type { RepurposeSourceKind } from '@/lib/repurpose/types';
import type { ContentType } from '@/lib/contentTypes';
import { linkIdeaToMany } from '@/app/ideas-actions';

/**
 * Repurposing — server side.
 *
 * Two calls, and deliberately no more:
 *   1. `extractRepurposeSource` — a link in, the post's words out. Everything
 *      platform-specific ends here; from this point a repurpose is just text.
 *   2. `generateThreadPost` — the one output format the app had no generator
 *      for. Carousel / reel / storytelling reuse their EXISTING generators (the
 *      overlay feeds them the composed brief), so there is exactly one code path
 *      per format in the codebase, not two.
 *
 * `recordRepurposeOutputs` is bookkeeping: it saves the extracted source as an
 * idea the first time something is actually made from it, and links what was
 * made to it — so a repurposed post gets the same fan-out ("Звідси: 1 карусель ·
 * 3 сторіс") that a braindump gets, through the same tables.
 */

const RATE_LIMIT_MESSAGE = 'Ліміт запитів вичерпано. Спробуй пізніше.';
const AUTH_MESSAGE = 'Необхідно увійти в акаунт.';
const SYSTEM_MESSAGE =
  'Йой, щось пішло не так! Рута вже знає про це і біжить виправляти. Спробуй ще раз через хвилинку.';
const NO_SPEECH_MESSAGE =
  'У цьому відео не вдалося розпізнати мову. Спробуй інший пост або встав текст вручну.';

export type RepurposeErrorKind = 'input' | 'content_unavailable' | 'system';

/** The extracted post, in the shape the overlay works with from here on. */
export interface RepurposeSourcePayload {
  kind: RepurposeSourceKind;
  /** Canonical link to the original — shown, and stored with what it produces. */
  sourceUrl: string;
  author: string | null;
  /** Transcript (video) or post text (Threads). User-editable before generating. */
  text: string;
  /** Caption that came with a video post, when there was one. */
  caption: string | null;
  language: string | null;
}

export type ExtractRepurposeSourceResult =
  | { ok: true; data: RepurposeSourcePayload }
  | { ok: false; error: string; errorKind: RepurposeErrorKind };

/**
 * Link → words.
 *
 * Video sources (Instagram Reel, TikTok) run the app's EXISTING reference
 * pipeline: Apify resolves a direct media URL, Groq Whisper transcribes it.
 * Threads runs the new post scraper — and, when a Threads post is a video with
 * no caption, falls through to that same transcription path rather than telling
 * the user their post is empty.
 */
export async function extractRepurposeSource(
  rawUrl: string,
): Promise<ExtractRepurposeSourceResult> {
  try {
    const user = await requireAuth();
    if (!user) return { ok: false, error: AUTH_MESSAGE, errorKind: 'system' };

    const detected = detectRepurposeSource(rawUrl);
    if (!detected.ok) {
      return { ok: false, error: UNSUPPORTED_SOURCE_MESSAGE, errorKind: 'input' };
    }

    // Scraping + Whisper are the expensive half, so they sit behind the same
    // limiter the reel-reference flow uses.
    const limit = await transcribeLimit.limit(user.id);
    if (!limit.success) return { ok: false, error: RATE_LIMIT_MESSAGE, errorKind: 'system' };

    if (detected.kind === 'threads') {
      const post = await fetchThreadsPost(detected.canonicalUrl);
      if (post.text.trim()) {
        return {
          ok: true,
          data: {
            kind: 'threads',
            sourceUrl: post.normalizedUrl || detected.canonicalUrl,
            author: post.authorHandle,
            text: post.text.trim(),
            caption: null,
            language: null,
          },
        };
      }

      // Text-free video post: transcribe it instead of refusing. (fetchThreadsPost
      // throws when there is neither text nor video, so this is the video case.)
      if (!post.videoUrl) {
        return { ok: false, error: NO_SPEECH_MESSAGE, errorKind: 'content_unavailable' };
      }
      const transcript = await transcribeMediaFromUrl(post.videoUrl);
      if (!transcript.transcript.trim()) {
        return { ok: false, error: NO_SPEECH_MESSAGE, errorKind: 'content_unavailable' };
      }
      return {
        ok: true,
        data: {
          kind: 'threads',
          sourceUrl: post.normalizedUrl || detected.canonicalUrl,
          author: post.authorHandle,
          text: transcript.transcript.trim(),
          caption: null,
          language: transcript.language,
        },
      };
    }

    const media = await resolveReferenceMediaUrl(detected.canonicalUrl);
    const transcript = await transcribeMediaFromUrl(media.mediaUrl);
    const text = transcript.transcript.trim();
    const caption = media.caption?.trim() ?? '';

    // A music-only or meme reel transcribes to nothing. Its caption is still
    // real material, so fall back to it before giving up.
    if (!text && !caption) {
      return { ok: false, error: NO_SPEECH_MESSAGE, errorKind: 'content_unavailable' };
    }

    return {
      ok: true,
      data: {
        kind: detected.kind,
        sourceUrl: media.normalizedUrl || detected.canonicalUrl,
        author: media.authorHandle ?? null,
        text: text || caption,
        caption: text && caption ? caption : null,
        language: transcript.language,
      },
    };
  } catch (error) {
    return { ok: false, ...mapExtractError(error) };
  }
}

function mapExtractError(error: unknown): { error: string; errorKind: RepurposeErrorKind } {
  if (error instanceof InstagramReferenceInputError) {
    return { error: UNSUPPORTED_SOURCE_MESSAGE, errorKind: 'input' };
  }
  if (error instanceof InstagramReferenceNoVideoError || error instanceof ThreadsPostNotFoundError) {
    return { error: error.message, errorKind: 'content_unavailable' };
  }
  if (error instanceof ThreadsPostEmptyError) {
    return { error: error.message, errorKind: 'content_unavailable' };
  }
  if (error instanceof InstagramReferenceSystemError || error instanceof ThreadsPostSystemError) {
    console.error('[repurpose] extract system error', error.message);
    return { error: SYSTEM_MESSAGE, errorKind: 'system' };
  }
  if (error instanceof Error) {
    const lowered = error.message.toLowerCase();
    if (lowered.includes('некоректне посилання') || lowered.includes('підтримуються лише посилання')) {
      return { error: UNSUPPORTED_SOURCE_MESSAGE, errorKind: 'input' };
    }
    if (lowered.includes('transcript is empty')) {
      return { error: NO_SPEECH_MESSAGE, errorKind: 'content_unavailable' };
    }
    console.error('[repurpose] extract failed', error.message);
    return { error: sanitizePipelineErrorForUser(error.message), errorKind: 'system' };
  }
  console.error('[repurpose] extract failed', error);
  return { error: SYSTEM_MESSAGE, errorKind: 'system' };
}

export type GenerateThreadResult =
  | { ok: true; ideaId: string; title: string; posts: string[] }
  | { ok: false; error: string };

/**
 * Brief → Threads post, saved as an idea.
 *
 * Threads is not (yet) one of the app's content types, so rather than inventing
 * a table and a status track for it, the generated thread is stored in `ideas` —
 * the table that already exists for "text the user owns". It shows up in Весь
 * контент, it can be reopened, and it keeps its source link in the body. When
 * Threads earns a real content type, this is the only write that has to move.
 */
export async function generateThreadPost(
  brief: string,
  source: { kind: RepurposeSourceKind; sourceUrl: string; author: string | null },
): Promise<GenerateThreadResult> {
  try {
    const user = await requireAuth();
    if (!user) return { ok: false, error: AUTH_MESSAGE };

    const trimmed = brief.trim();
    if (!trimmed) return { ok: false, error: 'Немає тексту для переробки.' };

    const { success } = await aiLimit.limit(user.id);
    if (!success) return { ok: false, error: RATE_LIMIT_MESSAGE };

    const thread = await generateThreadFromBrief(trimmed);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('ideas')
      .insert({
        user_id: user.id,
        title: thread.title.slice(0, 120),
        content: `${threadToPlainText(thread.posts)}\n\n—\nПереробка з: ${source.sourceUrl}`,
        source: 'repurpose_thread',
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[repurpose] thread save failed', error?.message);
      return { ok: false, error: 'Тред згенеровано, але не вдалося зберегти. Спробуй ще раз.' };
    }

    return { ok: true, ideaId: data.id as string, title: thread.title, posts: thread.posts };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : 'Не вдалося зробити тред. Спробуй ще раз.';
    return { ok: false, error: message };
  }
}

export type RecordRepurposeResult = { ok: true; ideaId: string } | { ok: false };

/**
 * Save the source once, then link what it produced to it.
 *
 * Called only AFTER a generation succeeds, so pasting a link and walking away
 * never leaves a stray row behind. Pass back the returned `ideaId` on the next
 * target and the same source row is reused — one source, many children, which is
 * exactly the fan-out shape the braindump already renders.
 */
export async function recordRepurposeOutputs(input: {
  ideaId: string | null;
  kind: RepurposeSourceKind;
  sourceUrl: string;
  author: string | null;
  text: string;
  /** Omitted for a Threads output, which is not (yet) a linkable content type. */
  contentType?: ContentType;
  contentIds?: string[];
}): Promise<RecordRepurposeResult> {
  const user = await requireAuth();
  if (!user) return { ok: false };

  const supabase = await createServerSupabaseClient();
  const body = `Оригінал: ${input.sourceUrl}\n\n${input.text.trim()}`;
  let ideaId = input.ideaId;

  try {
    if (ideaId) {
      await supabase
        .from('ideas')
        .update({ content: body, updated_at: new Date().toISOString() })
        .eq('id', ideaId)
        .eq('user_id', user.id);
    } else {
      const { data, error } = await supabase
        .from('ideas')
        .insert({
          user_id: user.id,
          title: repurposeSourceTitle(input.kind, input.author),
          content: body,
          source: 'repurpose',
        })
        .select('id')
        .single();
      if (error || !data) {
        console.error('[repurpose] source save failed', error?.message);
        return { ok: false };
      }
      ideaId = data.id as string;
    }

    if (input.contentType && input.contentIds && input.contentIds.length > 0) {
      await linkIdeaToMany(ideaId, input.contentType, input.contentIds);
    }
    return { ok: true, ideaId };
  } catch (error) {
    // Bookkeeping must never take down a generation that already succeeded.
    console.error('[repurpose] record outputs failed', error);
    return { ok: false };
  }
}
