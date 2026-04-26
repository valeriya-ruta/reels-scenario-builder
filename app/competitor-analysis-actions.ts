'use server';

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
import { splitTranscriptIntoScenes } from '@/lib/ai/sceneSegmentation';
import { templatizeTranscriptToScenes } from '@/lib/ai/transcriptToTemplate';
import {
  defaultTranscriptEntry,
  parseIdeaScanTranscriptMap,
  type IdeaScanRow,
  type IdeaScanSummary,
  type IdeaScanTranscriptEntry,
  type IdeaTopReelsPayload,
} from '@/lib/ideaScanTypes';
import { scanLimitFree, scanLimitPaid, transcribeLimit } from '@/lib/ratelimit';
import { userHasPaidScanAccess } from '@/lib/userScanTier';

const APIFY_BASE = 'https://api.apify.com/v2';
const FALLBACK_REEL_ACTOR_ID = 'xMc5Ga1oCONPmWJIa';
const MAX_VIDEO_BUFFER_BYTES = 25 * 1024 * 1024;
const TRANSCRIPTION_USER_ERROR =
  'Не вдалося розпізнати мову з відео. Спробуй ще раз або інший рілс.';
const TRANSCRIPTION_MAX_ATTEMPTS = 3;
const TRANSCRIPTION_TIMEOUT_MS = 60_000;
const TRANSCRIPTION_BACKOFF_MS = [1_000, 3_000, 7_000] as const;
const TRANSCRIPTION_CONCURRENCY = 3;
const IDEAS_TRANSCRIPTION_PROVIDER = 'groq:whisper-large-v3-turbo';
const FALLBACK_TRANSCRIPT_MESSAGE =
  'Йой, щось пішло не так! Рута вже знає про це і біжить виправляти. А поки ти чекаєш — ось текст під відео:';

interface GroqTranscriptionResponse {
  text?: string;
}

async function transcribeCompetitorMediaFromUrl(url: string): Promise<string> {
  const mediaRes = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
  });
  if (!mediaRes.ok) {
    throw new Error(`Не вдалося завантажити відео (HTTP ${mediaRes.status}).`);
  }

  const contentType = mediaRes.headers.get('content-type') || 'video/mp4';
  const videoArrayBuffer = await mediaRes.arrayBuffer();
  if (videoArrayBuffer.byteLength > MAX_VIDEO_BUFFER_BYTES) {
    throw new Error(
      'Відео завелике для розпізнавання (понад 25MB). Спробуй коротший рілс або інший ролик.'
    );
  }

  const videoBuffer = Buffer.from(videoArrayBuffer);
  const apiKey = requireServerEnv('GROQ_API_KEY');
  const formData = new FormData();
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0');
  formData.append(
    'file',
    new File([new Uint8Array(videoBuffer)], 'reel.mp4', { type: contentType })
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('TRANSCRIPTION_TIMEOUT')), timeoutMs);
    promise
      .then((result) => {
        clearTimeout(id);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(id);
        reject(error);
      });
  });
}

let activeTranscriptions = 0;
const transcriptionWaitQueue: Array<() => void> = [];

async function runWithTranscriptionSlot<T>(job: () => Promise<T>): Promise<T> {
  if (activeTranscriptions >= TRANSCRIPTION_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      transcriptionWaitQueue.push(resolve);
    });
  }
  activeTranscriptions += 1;
  try {
    return await job();
  } finally {
    activeTranscriptions = Math.max(0, activeTranscriptions - 1);
    const next = transcriptionWaitQueue.shift();
    if (next) next();
  }
}

function parseHttpStatusFromErrorMessage(message: string): number | null {
  const m = message.match(/\((\d{3})\)/);
  if (!m) return null;
  const status = Number(m[1]);
  return Number.isFinite(status) ? status : null;
}

function isRetryableTranscriptionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('TRANSCRIPTION_TIMEOUT')) return true;

  const status = parseHttpStatusFromErrorMessage(message);
  if (status !== null) {
    if (status === 429) return true;
    if (status >= 500) return true;
    if (status === 400 || status === 401 || status === 403 || status === 404) return false;
  }

  const lowered = message.toLowerCase();
  if (
    lowered.includes('network') ||
    lowered.includes('fetch failed') ||
    lowered.includes('econnreset') ||
    lowered.includes('etimedout') ||
    lowered.includes('timeout') ||
    lowered.includes('temporar') ||
    lowered.includes('rate limit')
  ) {
    return true;
  }

  return status === null;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return String(error);
}

function toJitter(baseMs: number): number {
  const jitter = Math.floor(Math.random() * 250);
  return baseMs + jitter;
}

async function transcribeWithRetry(
  videoUrl: string
): Promise<
  | {
      ok: true;
      transcript: string;
      attempts: number;
      firstAttemptAt: string;
      lastAttemptAt: string;
    }
  | {
      ok: false;
      attempts: number;
      firstAttemptAt: string;
      lastAttemptAt: string;
      error: string;
    }
> {
  const firstAttemptAt = new Date().toISOString();
  let attempts = 0;
  let lastError = 'Transcription failed';

  for (let i = 0; i < TRANSCRIPTION_MAX_ATTEMPTS; i += 1) {
    attempts += 1;
    try {
      const transcript = await runWithTranscriptionSlot(() =>
        withTimeout(transcribeCompetitorMediaFromUrl(videoUrl), TRANSCRIPTION_TIMEOUT_MS)
      );
      return {
        ok: true,
        transcript,
        attempts,
        firstAttemptAt,
        lastAttemptAt: new Date().toISOString(),
      };
    } catch (error) {
      lastError = safeErrorMessage(error);
      const retryable = isRetryableTranscriptionError(error);
      if (!retryable || i === TRANSCRIPTION_MAX_ATTEMPTS - 1) {
        return {
          ok: false,
          attempts,
          firstAttemptAt,
          lastAttemptAt: new Date().toISOString(),
          error: lastError,
        };
      }
      await sleep(toJitter(TRANSCRIPTION_BACKOFF_MS[i] ?? 1_000));
    }
  }

  return {
    ok: false,
    attempts,
    firstAttemptAt,
    lastAttemptAt: new Date().toISOString(),
    error: lastError,
  };
}

function reelCaptionFromRaw(rawReels: unknown, shortCode: string): string | null {
  if (!Array.isArray(rawReels)) return null;
  for (const item of rawReels) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const code =
      typeof row.shortCode === 'string'
        ? row.shortCode
        : typeof row.shortcode === 'string'
          ? row.shortcode
          : typeof row.id === 'string'
            ? row.id
            : '';
    if (code !== shortCode) continue;
    const caption = row.caption;
    if (typeof caption === 'string' && caption.trim()) return caption.trim();
    if (caption && typeof caption === 'object' && 'text' in caption) {
      const text = (caption as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim()) return text.trim();
    }
    if (typeof row.title === 'string' && row.title.trim()) return row.title.trim();
    if (typeof row.text === 'string' && row.text.trim()) return row.text.trim();
  }
  return null;
}

function findReelUrl(row: IdeaScanRow, shortCode: string): string | null {
  const item = row.top_reels?.items?.find((r) => r.shortCode === shortCode);
  return item?.url?.trim() || null;
}

function reportTranscriptionFailureWebhook(payload: {
  scanId: string;
  userId: string;
  accountHandle: string;
  reelUrl: string | null;
  reelId: string;
  errorMessage: string;
  attemptCount: number;
  trigger: 'auto' | 'manual_retry';
  firstAttemptAt: string;
  lastAttemptAt: string;
}): void {
  const webhookUrl = optionalServerEnv('RUTA_ERROR_WEBHOOK_URL');
  const secret = optionalServerEnv('RUTA_ERROR_SECRET');
  if (!webhookUrl || !secret) return;

  void fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ruta-error-secret': secret,
    },
    body: JSON.stringify({
      source: 'ideas_transcription',
      scan_id: payload.scanId,
      user_id: payload.userId,
      account_handle: payload.accountHandle,
      reel_url: payload.reelUrl ?? '',
      reel_id: payload.reelId,
      error_message: payload.errorMessage,
      attempt_count: payload.attemptCount,
      trigger: payload.trigger,
      timestamps: {
        first_attempt_at: payload.firstAttemptAt,
        last_attempt_at: payload.lastAttemptAt,
      },
      transcription_provider: IDEAS_TRANSCRIPTION_PROVIDER,
    }),
    signal: AbortSignal.timeout(5_000),
  }).catch((error) => {
    console.error('ideas transcription webhook failed', error);
  });
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
  | {
      ok: true;
      transcript: string;
      transcript_source: 'transcribed';
      transcript_status: 'success';
      transcript_attempts: number;
      last_transcript_error: null;
    }
  | {
      ok: false;
      error: string;
      transcript_status?: 'failed';
      transcript_attempts?: number;
      last_transcript_error?: string;
    };

async function updateIdeaScanTranscriptEntry(
  scanId: string,
  userId: string,
  shortCode: string,
  entry: IdeaScanTranscriptEntry
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: row, error: fetchErr } = await supabase
    .from('idea_scans')
    .select('reel_transcripts')
    .eq('id', scanId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr) {
    console.error('updateIdeaScanTranscriptEntry fetch', fetchErr);
    return;
  }

  const merged = {
    ...parseIdeaScanTranscriptMap(row?.reel_transcripts),
    [shortCode]: entry,
  };

  const { error: updateErr } = await supabase
    .from('idea_scans')
    .update({ reel_transcripts: merged })
    .eq('id', scanId)
    .eq('user_id', userId);

  if (updateErr) {
    console.error('updateIdeaScanTranscriptEntry update', updateErr);
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

    const transcriptResult = await transcribeWithRetry(url);
    if (!transcriptResult.ok) {
      if (ctx) {
        await updateIdeaScanTranscriptEntry(ctx.scanId, user.id, ctx.shortCode, {
          ...defaultTranscriptEntry(),
          transcript_status: 'failed',
          transcript_attempts: transcriptResult.attempts,
          last_transcript_error: transcriptResult.error,
        });
        const supabase = await createServerSupabaseClient();
        const { data: scanRow } = await supabase
          .from('idea_scans')
          .select('id, user_id, handle, raw_reels, top_reels')
          .eq('id', ctx.scanId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (scanRow) {
          reportTranscriptionFailureWebhook({
            scanId: ctx.scanId,
            userId: user.id,
            accountHandle: (scanRow as IdeaScanRow).handle,
            reelUrl: findReelUrl(scanRow as IdeaScanRow, ctx.shortCode),
            reelId: ctx.shortCode,
            errorMessage: transcriptResult.error,
            attemptCount: transcriptResult.attempts,
            trigger: 'auto',
            firstAttemptAt: transcriptResult.firstAttemptAt,
            lastAttemptAt: transcriptResult.lastAttemptAt,
          });
        }
      }
      return {
        ok: false,
        error: TRANSCRIPTION_USER_ERROR,
        transcript_status: 'failed',
        transcript_attempts: transcriptResult.attempts,
        last_transcript_error: transcriptResult.error,
      };
    }
    const transcript = transcriptResult.transcript;
    if (ctx) {
      await updateIdeaScanTranscriptEntry(ctx.scanId, user.id, ctx.shortCode, {
        transcript,
        transcript_source: 'transcribed',
        transcript_status: 'success',
        transcript_attempts: transcriptResult.attempts,
        last_transcript_error: null,
      });
    }
    return {
      ok: true,
      transcript,
      transcript_source: 'transcribed',
      transcript_status: 'success',
      transcript_attempts: transcriptResult.attempts,
      last_transcript_error: null,
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error('transcribeCompetitorReelVideo failed', raw);
    return {
      ok: false,
      error: TRANSCRIPTION_USER_ERROR,
      transcript_status: 'failed',
      transcript_attempts: 0,
      last_transcript_error: raw,
    };
  }
}

export async function getIdeaScanTranscriptEntry(
  scanId: string,
  shortCode: string
): Promise<IdeaScanTranscriptEntry | null> {
  const user = await requireAuth();
  if (!user) return null;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('idea_scans')
    .select('reel_transcripts')
    .eq('id', scanId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) return null;
  const map = parseIdeaScanTranscriptMap(data.reel_transcripts);
  return map[shortCode] ?? null;
}

export type RetryIdeaReelTranscriptionResult =
  | {
      ok: true;
      mode: 'transcribed' | 'caption_fallback';
      transcript: string;
      template_pattern: string;
      template_lines: string[];
      transcript_source: 'transcribed' | 'caption_fallback';
      transcript_status: 'success';
      transcript_attempts: number;
    }
  | { ok: false; error: string };

async function buildTemplatePayloadFromTranscript(transcript: string): Promise<{
  templatePattern: string;
  templateLines: string[];
}> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return {
      templatePattern: '',
      templateLines: [],
    };
  }

  try {
    const templated = await templatizeTranscriptToScenes(trimmed);
    const templateLines = templated.scenes
      .map((scene) => scene.text.trim())
      .filter(Boolean);
    return {
      templatePattern: templateLines[0] ?? trimmed.slice(0, 120),
      templateLines,
    };
  } catch (templateError) {
    console.warn('Manual retry template generation failed, using deterministic scene split.', templateError);
    const fallbackDrafts = await splitTranscriptIntoScenes(trimmed, []);
    const templateLines = fallbackDrafts
      .map((draft) => draft.text.trim())
      .filter(Boolean);
    return {
      templatePattern: templateLines[0] ?? trimmed.slice(0, 120),
      templateLines: templateLines.length > 0 ? templateLines : [trimmed],
    };
  }
}

export async function retryIdeaReelTranscription(
  scanId: string,
  shortCode: string
): Promise<RetryIdeaReelTranscriptionResult> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'Потрібен вхід.' };
  const supabase = await createServerSupabaseClient();
  const { data: scanRow, error } = await supabase
    .from('idea_scans')
    .select('id, user_id, handle, raw_reels, top_reels, reel_transcripts')
    .eq('id', scanId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !scanRow) {
    return { ok: false, error: 'Скан не знайдено.' };
  }

  const reel = (scanRow as IdeaScanRow).top_reels?.items?.find((item) => item.shortCode === shortCode);
  if (!reel?.videoUrl) {
    return { ok: false, error: 'Немає відео для повторної транскрипції.' };
  }

  const retryResult = await transcribeWithRetry(reel.videoUrl);
  if (retryResult.ok) {
    const templatePayload = await buildTemplatePayloadFromTranscript(retryResult.transcript);
    await updateIdeaScanTranscriptEntry(scanId, user.id, shortCode, {
      transcript: retryResult.transcript,
      transcript_source: 'transcribed',
      transcript_status: 'success',
      transcript_attempts: retryResult.attempts,
      last_transcript_error: null,
    });
    return {
      ok: true,
      mode: 'transcribed',
      transcript: retryResult.transcript,
      template_pattern: templatePayload.templatePattern,
      template_lines: templatePayload.templateLines,
      transcript_source: 'transcribed',
      transcript_status: 'success',
      transcript_attempts: retryResult.attempts,
    };
  }

  reportTranscriptionFailureWebhook({
    scanId,
    userId: user.id,
    accountHandle: (scanRow as IdeaScanRow).handle,
    reelUrl: findReelUrl(scanRow as IdeaScanRow, shortCode),
    reelId: shortCode,
    errorMessage: retryResult.error,
    attemptCount: retryResult.attempts,
    trigger: 'manual_retry',
    firstAttemptAt: retryResult.firstAttemptAt,
    lastAttemptAt: retryResult.lastAttemptAt,
  });

  const caption = reelCaptionFromRaw((scanRow as IdeaScanRow).raw_reels, shortCode) || reel.hook || '';
  const fallbackTranscript = `${FALLBACK_TRANSCRIPT_MESSAGE}\n\n${caption}`.trim();
  const templatePayload = await buildTemplatePayloadFromTranscript(caption);
  await updateIdeaScanTranscriptEntry(scanId, user.id, shortCode, {
    transcript: fallbackTranscript,
    transcript_source: 'caption_fallback',
    transcript_status: 'success',
    transcript_attempts: retryResult.attempts,
    last_transcript_error: retryResult.error,
  });
  return {
    ok: true,
    mode: 'caption_fallback',
    transcript: fallbackTranscript,
    template_pattern: templatePayload.templatePattern,
    template_lines: templatePayload.templateLines,
    transcript_source: 'caption_fallback',
    transcript_status: 'success',
    transcript_attempts: retryResult.attempts,
  };
}
