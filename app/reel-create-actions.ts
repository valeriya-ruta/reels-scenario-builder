'use server';

/**
 * The three doors into a new reel.
 *
 * Creating is ONE gesture and asks nothing: no name, no status, no date, no
 * structure picker. A reel gets those once it exists, on the screen where she
 * can see them every time she opens it.
 *
 * All three write `reel_blocks` directly rather than going through `scenes` and
 * letting migration 036's trigger mirror them across. The mirror is one-way and
 * exists for the paths that predate blocks; a new path that used it would be
 * writing the reel twice, in two shapes, with only one of them authoritative.
 */

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NEW_LABELS } from '@/lib/content/displayTitle';
import { aiLimit, transcribeLimit } from '@/lib/ratelimit';
import { transformRantToScript } from '@/lib/ai/rantToScript';
import { resolveReferenceMediaUrl } from '@/lib/ai/referenceMedia';
import { transcribeMediaFromUrl } from '@/lib/ai/sttProvider';
import { splitTranscriptIntoScenes } from '@/lib/ai/sceneSegmentation';
import { sanitizePipelineErrorForUser } from '@/lib/sanitizePipelineError';

export type CreateResult = { ok: true; projectId: string } | { ok: false; error: string };

const NO_AUTH = 'Необхідно увійти в акаунт.';

/** The reel row itself. Nothing is asked for here — see the note above. */
async function createReel(
  userId: string,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name,
      crew_mode: 'solo',
      user_id: userId,
      project_type: 'reels',
      ...extra,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Error creating reel:', error);
    return null;
  }
  return data as { id: string };
}

/** One block per paragraph — a paragraph IS a block on the text screen. */
async function insertBlocks(projectId: string, paragraphs: string[]): Promise<boolean> {
  const rows = paragraphs
    .map((text) => text.trim())
    .filter(Boolean)
    .map((spoken, i) => ({
      project_id: projectId,
      order_index: i,
      kind: 'talk',
      spoken,
    }));

  if (rows.length === 0) return true;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('reel_blocks').insert(rows);
  if (error) {
    console.error('Error inserting reel blocks:', error);
    return false;
  }
  return true;
}

/** ⌨️ Написати — a blank sheet, and the caret already in it. */
export async function createBlankReel(): Promise<CreateResult> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: NO_AUTH };

  const reel = await createReel(user.id, NEW_LABELS.reel);
  if (!reel) return { ok: false, error: 'Не вдалося створити рілс.' };
  return { ok: true, projectId: reel.id };
}

/**
 * 🎤 Наговорити — the 90% case.
 *
 * She holds the button and rambles; this shortens it and turns the opening into
 * a hook. The raw speech is never what gets stored, because the point of
 * talking rather than typing is that you do not have to be tidy.
 */
export async function createReelFromSpeech(spoken: string): Promise<CreateResult> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: NO_AUTH };

  const text = spoken.trim();
  if (!text) return { ok: false, error: 'Спочатку скажи або напиши щось.' };

  const { success } = await aiLimit.limit(user.id);
  if (!success) return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };

  try {
    const { title, scenes } = await transformRantToScript(text);
    const reel = await createReel(user.id, title || NEW_LABELS.reel);
    if (!reel) return { ok: false, error: 'Не вдалося створити рілс.' };

    const ok = await insertBlocks(
      reel.id,
      scenes.map((s) => s.text),
    );
    // The reel exists either way: losing the text is bad, losing the reel AND
    // the text is worse, and she can still see what was captured.
    if (!ok) return { ok: false, error: 'Рілс створено, але текст не зберігся. Відкрий і встав ще раз.' };
    return { ok: true, projectId: reel.id };
  } catch (error) {
    const raw = error instanceof Error ? error.message : '';
    return { ok: false, error: sanitizePipelineErrorForUser(raw || 'Не вдалося обробити текст.') };
  }
}

/**
 * 🔗 З референсу — paste a Reels link and get its words.
 *
 * The link is kept on the reel, so «на що це схоже» stays answerable after the
 * transcript has been rewritten beyond recognition.
 */
export async function createReelFromReference(url: string): Promise<CreateResult> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: NO_AUTH };

  const link = url.trim();
  if (!link) return { ok: false, error: 'Встав посилання на Reels.' };

  const tr = await transcribeLimit.limit(user.id);
  if (!tr.success) return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };

  try {
    const { mediaUrl } = await resolveReferenceMediaUrl(link);
    const transcript = await transcribeMediaFromUrl(mediaUrl);

    const ai = await aiLimit.limit(user.id);
    if (!ai.success) return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };

    const drafts = await splitTranscriptIntoScenes(transcript.transcript, transcript.segments);

    const reel = await createReel(user.id, NEW_LABELS.reel, { reference_url: link });
    if (!reel) return { ok: false, error: 'Не вдалося створити рілс.' };

    const paragraphs = drafts.length > 0 ? drafts.map((d) => d.text) : [transcript.transcript];
    const ok = await insertBlocks(reel.id, paragraphs);
    if (!ok) return { ok: false, error: 'Рілс створено, але текст не зберігся.' };
    return { ok: true, projectId: reel.id };
  } catch (error) {
    const raw = error instanceof Error ? error.message : '';
    return {
      ok: false,
      error: sanitizePipelineErrorForUser(
        raw || 'Не вдалося обробити посилання. Перевір, що Reel публічний.',
      ),
    };
  }
}
