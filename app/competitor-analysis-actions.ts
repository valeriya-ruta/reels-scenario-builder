'use server';

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type FluentFfmpeg from 'fluent-ffmpeg';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { requireAuth } from '@/lib/auth';
import { optionalServerEnv, requireServerEnv } from '@/lib/env';
import { computeTopReelsPayload } from '@/lib/competitorScoring';
import {
  apifyItemsToRawReels,
  buildCompetitorActorInput,
  fetchDatasetItems,
  fetchInstagramProfileSync,
  followerCountFromFirstItem,
  getActorRun,
  startCompetitorActorRun,
} from '@/lib/ai/competitorReelsApify';
import {
  parseIdeaScanReelStringMap,
  type IdeaScanRow,
  type IdeaScanSummary,
  type IdeaTopReelsPayload,
} from '@/lib/ideaScanTypes';
import { scanLimitFree, scanLimitPaid, transcribeLimit } from '@/lib/ratelimit';
import { userHasPaidScanAccess } from '@/lib/userScanTier';

const APIFY_BASE = 'https://api.apify.com/v2';
const FALLBACK_REEL_ACTOR_ID = 'xMc5Ga1oCONPmWJIa';
const TRANSCRIBE_MAX_DURATION_SEC = 300;
const FFMPEG_TIMEOUT_MS = 60_000;
const MAX_AUDIO_BUFFER_BYTES = 25 * 1024 * 1024;
const EXTRACT_AUDIO_ERROR = 'Не вдалося витягнути аудіо. Спробуй інший рілс.';
const REEL_TOO_LONG_ERROR =
  'Це відео задовге для транскрипції (ймовірно, запис трансляції). Спробуй інший рілс.';
const REEL_NO_AUDIO_ERROR = 'Цей рілс без звуку — нічого транскрибувати.';

/**
 * Fully lazy ffmpeg loader. Both `fluent-ffmpeg` and `@ffmpeg-installer/ffmpeg`
 * are imported dynamically — previously the top-level `import` of
 * `@ffmpeg-installer/ffmpeg` evaluated that package's body, which synchronously
 * `require()`s a platform-specific subpackage (e.g. `@ffmpeg-installer/linux-x64`).
 * When the subpackage couldn't be resolved on serverless hosts, the import
 * threw, which took down the *entire* server-actions module — breaking
 * unrelated flows like `listIdeaScansForUser`, `startCompetitorScan`, and
 * `pollCompetitorScan` that never touch ffmpeg. Now failures are contained
 * to the transcription call itself.
 */
let ffmpegPromise: Promise<typeof FluentFfmpeg> | null = null;
async function loadFfmpeg(): Promise<typeof FluentFfmpeg> {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    const ffmpegModule = (await import('fluent-ffmpeg')) as
      | { default: typeof FluentFfmpeg }
      | typeof FluentFfmpeg;
    const ffmpeg = (
      'default' in ffmpegModule ? ffmpegModule.default : ffmpegModule
    ) as typeof FluentFfmpeg;
    try {
      const installerModule = (await import('@ffmpeg-installer/ffmpeg')) as
        | { default?: { path?: string }; path?: string }
        | { path?: string };
      const installer =
        'default' in installerModule && installerModule.default
          ? installerModule.default
          : (installerModule as { path?: string });
      const installerPath = installer?.path;
      if (typeof installerPath === 'string' && installerPath.length > 0) {
        ffmpeg.setFfmpegPath(installerPath);
        const ffprobePath = join(
          dirname(installerPath),
          process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
        );
        if (existsSync(ffprobePath)) {
          ffmpeg.setFfprobePath(ffprobePath);
        }
      }
    } catch (err) {
      console.error('ffmpeg installer unavailable', err);
    }
    return ffmpeg;
  })().catch((err) => {
    ffmpegPromise = null;
    throw err;
  });
  return ffmpegPromise;
}

interface GroqTranscriptionResponse {
  text?: string;
}

async function probeReelMedia(url: string): Promise<{ durationSec: number; hasAudio: boolean }> {
  const ffmpeg = await loadFfmpeg();
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(url, (error, metadata) => {
      if (error) {
        reject(new Error(EXTRACT_AUDIO_ERROR));
        return;
      }

      const hasAudio = (metadata.streams ?? []).some((stream) => stream.codec_type === 'audio');
      const durationRaw = metadata.format?.duration;
      const durationSec =
        typeof durationRaw === 'number'
          ? durationRaw
          : typeof durationRaw === 'string'
            ? Number(durationRaw)
            : 0;
      resolve({
        durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0,
        hasAudio,
      });
    });
  });
}

async function extractAudioMp3ToBuffer(url: string): Promise<Buffer> {
  const ffmpeg = await loadFfmpeg();
  return new Promise((resolve, reject) => {
    let settled = false;
    let totalBytes = 0;
    const chunks: Buffer[] = [];

    const command = ffmpeg(url)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioFrequency(16000)
      .audioChannels(1)
      .audioBitrate('64k')
      .format('mp3')
      .duration(TRANSCRIBE_MAX_DURATION_SEC);

    const fail = () => {
      if (settled) return;
      settled = true;
      reject(new Error(EXTRACT_AUDIO_ERROR));
    };

    const timeout = setTimeout(() => {
      command.kill('SIGKILL');
      fail();
    }, FFMPEG_TIMEOUT_MS);

    command.on('error', () => {
      clearTimeout(timeout);
      fail();
    });

    const stream = command.pipe();
    stream.on('data', (chunk: Buffer) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_AUDIO_BUFFER_BYTES) {
        command.kill('SIGKILL');
        clearTimeout(timeout);
        fail();
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', () => {
      clearTimeout(timeout);
      fail();
    });
    stream.on('end', () => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      const result = Buffer.concat(chunks);
      if (result.length === 0) {
        reject(new Error(EXTRACT_AUDIO_ERROR));
        return;
      }
      resolve(result);
    });
  });
}

async function transcribeCompetitorMediaFromUrl(url: string): Promise<string> {
  const { durationSec, hasAudio } = await probeReelMedia(url);
  if (!hasAudio) {
    throw new Error(REEL_NO_AUDIO_ERROR);
  }
  if (durationSec > TRANSCRIBE_MAX_DURATION_SEC) {
    throw new Error(REEL_TOO_LONG_ERROR);
  }

  const audioBuffer = await extractAudioMp3ToBuffer(url);
  const apiKey = requireServerEnv('GROQ_API_KEY');
  const formData = new FormData();
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0');
  formData.append(
    'file',
    new File([new Uint8Array(audioBuffer)], 'reel-audio.mp3', { type: 'audio/mpeg' })
  );

  const sttRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });
  if (!sttRes.ok) {
    const body = await sttRes.text();
    throw new Error(`Помилка транскрипції (${sttRes.status}): ${body.slice(0, 500)}`);
  }

  const parsed = (await sttRes.json()) as GroqTranscriptionResponse;
  const transcript = (parsed.text ?? '').trim();
  if (!transcript) {
    throw new Error('Transcript is empty. Try another reel URL.');
  }
  return transcript;
}

function hasPlaysFieldInTopReels(row: IdeaScanRow | null | undefined): boolean {
  const items = row?.top_reels?.items;
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.some((item) => {
    if (!item || typeof item !== 'object') return false;
    return typeof (item as { plays?: unknown }).plays === 'number';
  });
}

function normalizeHandle(raw: string): string {
  let v = raw.trim();
  v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
  const segment = v.split(/[/?#]/)[0] ?? '';
  const username = segment.replace(/^@+/, '').replace(/\/+$/, '');
  if (!username) {
    throw new Error('Вкажіть username або посилання на профіль.');
  }
  return `@${username.toLowerCase()}`;
}

/** Current UTC calendar day [start, end) — used only to dedupe Apify runs (not to delete history). */
function utcDayBounds(): { start: string; end: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function listIdeaScansForUser(): Promise<IdeaScanSummary[]> {
  const user = await requireAuth();
  if (!user) return [];
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('idea_scans')
    .select('id, handle, followers_count, scanned_at, saved_reel_ids, top_reels')
    .eq('user_id', user.id)
    .order('scanned_at', { ascending: false });

  if (error) {
    console.error('listIdeaScansForUser', error);
    return [];
  }
  return (data ?? []).map((row) => {
    const top = row.top_reels as IdeaTopReelsPayload | null | undefined;
    return {
      id: row.id,
      handle: row.handle,
      followers_count: row.followers_count,
      scanned_at: row.scanned_at,
      saved_reel_ids: row.saved_reel_ids ?? [],
      avgPlaysDisplay: top?.summary?.avgPlaysDisplay ?? '—',
    };
  }) as IdeaScanSummary[];
}

export async function getIdeaScanById(id: string): Promise<IdeaScanRow | null> {
  const user = await requireAuth();
  if (!user) return null;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('idea_scans')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as IdeaScanRow;
}

export type StartScanResult =
  | { ok: true; kind: 'cached'; scan: IdeaScanRow }
  | { ok: true; kind: 'run'; runId: string; handle: string }
  | { ok: false; error: string };

export async function startCompetitorScan(inputHandle: string): Promise<StartScanResult> {
  try {
    const user = await requireAuth();
    if (!user) return { ok: false, error: 'Потрібен вхід.' };

    const handle = normalizeHandle(inputHandle);
    const { start, end } = utcDayBounds();
    const supabase = await createServerSupabaseClient();

    // Same handle on a different UTC day → no row here: new Apify run + new history row (old scans stay).
    const { data: cached } = await supabase
      .from('idea_scans')
      .select('*')
      .eq('user_id', user.id)
      .eq('handle', handle)
      .gte('scanned_at', start)
      .lt('scanned_at', end)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached && hasPlaysFieldInTopReels(cached as IdeaScanRow)) {
      return { ok: true, kind: 'cached', scan: cached as IdeaScanRow };
    }

    const paid = await userHasPaidScanAccess(supabase, user.id);
    const scanLimiter = paid ? scanLimitPaid : scanLimitFree;
    const { success: scanOk } = await scanLimiter.limit(user.id);
    if (!scanOk) {
      return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };
    }

    const actorInput = buildCompetitorActorInput(handle);
    const runId = await startCompetitorActorRun(actorInput);
    return { ok: true, kind: 'run', runId, handle };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export type PollScanResult =
  | { ok: true; kind: 'running' }
  | { ok: true; kind: 'ready'; scan: IdeaScanRow }
  | { ok: false; error: string };

export async function pollCompetitorScan(
  runId: string,
  handleInput: string
): Promise<PollScanResult> {
  try {
    const user = await requireAuth();
    if (!user) return { ok: false, error: 'Потрібен вхід.' };

    const handle = normalizeHandle(handleInput);
    const { start, end } = utcDayBounds();
    const supabase = await createServerSupabaseClient();

    const { data: raced } = await supabase
      .from('idea_scans')
      .select('*')
      .eq('user_id', user.id)
      .eq('handle', handle)
      .gte('scanned_at', start)
      .lt('scanned_at', end)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (raced && hasPlaysFieldInTopReels(raced as IdeaScanRow)) {
      return { ok: true, kind: 'ready', scan: raced as IdeaScanRow };
    }

    const run = await getActorRun(runId);
    const st = run.status.trim().toUpperCase();

    // Some Apify actors may expose READY while dataset is already available.
    const canReadDatasetNow =
      (st === 'SUCCEEDED' || st === 'READY') && !!run.defaultDatasetId;

    if (!canReadDatasetNow && (st === 'RUNNING' || st === 'READY')) {
      return { ok: true, kind: 'running' };
    }

    if (st === 'FAILED' || st === 'ABORTED' || st === 'TIMED-OUT') {
      return {
        ok: false,
        error: `Сканування не вдалось (${st}). Спробуй ще раз.`,
      };
    }

    if (!canReadDatasetNow && st !== 'SUCCEEDED') {
      return { ok: false, error: `Невідомий стан Apify: ${st}` };
    }

    if (!run.defaultDatasetId) {
      return { ok: false, error: 'Немає даних від Apify (dataset).' };
    }

    const items = await fetchDatasetItems(run.defaultDatasetId);
    const profile = await fetchInstagramProfileSync(handle);
    const canonicalHandle = profile
      ? normalizeHandle(`@${profile.username}`)
      : handle;
    const followerCount =
      profile?.followersCount ?? followerCountFromFirstItem(items);
    const rawReels = apifyItemsToRawReels(items);
    const topPayload = computeTopReelsPayload(rawReels, followerCount);

    const { data: racedBeforeInsert } = await supabase
      .from('idea_scans')
      .select('*')
      .eq('user_id', user.id)
      .eq('handle', canonicalHandle)
      .gte('scanned_at', start)
      .lt('scanned_at', end)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (racedBeforeInsert && hasPlaysFieldInTopReels(racedBeforeInsert as IdeaScanRow)) {
      return { ok: true, kind: 'ready', scan: racedBeforeInsert as IdeaScanRow };
    }

    const { data: inserted, error } = await supabase
      .from('idea_scans')
      .insert({
        user_id: user.id,
        handle: canonicalHandle,
        followers_count: followerCount,
        raw_reels: items,
        top_reels: topPayload,
        saved_reel_ids: [],
      })
      .select('*')
      .single();

    if (error) {
      console.error('idea_scans insert', error);
      return { ok: false, error: 'Не вдалось зберегти результат у базі.' };
    }

    return { ok: true, kind: 'ready', scan: inserted as IdeaScanRow };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function updateIdeaScanSavedReels(
  scanId: string,
  shortCodes: string[]
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'Потрібен вхід.' };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('idea_scans')
    .update({ saved_reel_ids: shortCodes })
    .eq('id', scanId)
    .eq('user_id', user.id);

  if (error) {
    console.error('update saved reels', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function refetchReelVideoUrl(
  shortCode: string
): Promise<{ ok: true; videoUrl: string } | { ok: false; error: string }> {
  try {
    const user = await requireAuth();
    if (!user) return { ok: false, error: 'Потрібен вхід.' };
    const code = shortCode.trim();
    if (!code) return { ok: false, error: 'Невірний shortCode.' };

    const supabase = await createServerSupabaseClient();
    const paid = await userHasPaidScanAccess(supabase, user.id);
    const scanLimiter = paid ? scanLimitPaid : scanLimitFree;
    const { success: scanOk } = await scanLimiter.limit(user.id);
    if (!scanOk) {
      return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };
    }

    const token = requireServerEnv('APIFY_TOKEN');
    const actorId =
      optionalServerEnv('APIFY_INSTAGRAM_REEL_ACTOR_ID') ?? FALLBACK_REEL_ACTOR_ID;
    const endpoint = `${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
    const reelUrl = `https://www.instagram.com/reel/${encodeURIComponent(code)}/`;
    const input = { directUrls: [reelUrl], resultsLimit: 1 };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Apify (${res.status}): ${body.slice(0, 240)}` };
    }

    const rows = (await res.json()) as unknown;
    const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!first || typeof first !== 'object') {
      return { ok: false, error: 'Apify не повернув рілс.' };
    }

    const item = first as Record<string, unknown>;
    const freshVideoUrl =
      typeof item.videoUrl === 'string'
        ? item.videoUrl
        : typeof item.video_url === 'string'
          ? item.video_url
          : '';
    if (!freshVideoUrl) {
      return { ok: false, error: 'У відповіді немає videoUrl.' };
    }
    return { ok: true, videoUrl: freshVideoUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type TranscribeReelVideoResult =
  | { ok: true; transcript: string }
  | { ok: false; error: string };

async function mergeIdeaScanReelTranscript(
  scanId: string,
  shortCode: string,
  transcript: string
): Promise<void> {
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  const { data: row, error: fetchErr } = await supabase
    .from('idea_scans')
    .select('reel_transcripts')
    .eq('id', scanId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchErr) {
    console.error('mergeIdeaScanReelTranscript fetch', fetchErr);
    return;
  }

  const merged = {
    ...parseIdeaScanReelStringMap(row?.reel_transcripts),
    [shortCode]: transcript,
  };

  const { error: updateErr } = await supabase
    .from('idea_scans')
    .update({ reel_transcripts: merged })
    .eq('id', scanId)
    .eq('user_id', user.id);

  if (updateErr) {
    console.error('mergeIdeaScanReelTranscript update', updateErr);
  }
}

export type TranscribeCompetitorContext = { scanId: string; shortCode: string };

/** Full spoken transcript from the reel’s video file (not scene-split). Persists when `ctx` is set. */
export async function transcribeCompetitorReelVideo(
  videoUrl: string,
  ctx?: TranscribeCompetitorContext
): Promise<TranscribeReelVideoResult> {
  try {
    const user = await requireAuth();
    if (!user) return { ok: false, error: 'Потрібен вхід.' };
    const url = videoUrl.trim();
    if (!url) return { ok: false, error: 'Немає посилання на відео.' };

    const { success: trOk } = await transcribeLimit.limit(user.id);
    if (!trOk) {
      return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };
    }

    const transcript = await transcribeCompetitorMediaFromUrl(url);
    if (ctx) {
      await mergeIdeaScanReelTranscript(ctx.scanId, ctx.shortCode, transcript);
    }
    return { ok: true, transcript };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
