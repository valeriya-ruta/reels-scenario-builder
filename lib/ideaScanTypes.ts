export interface IdeaScanSummary {
  id: string;
  handle: string;
  followers_count: number;
  scanned_at: string;
  saved_reel_ids: string[];
  /** Filled by list API from `top_reels.summary` for the recents table. */
  avgPlaysDisplay?: string;
}

export interface IdeaTopReelsSummary {
  reelsAnalyzed: number;
  avgPlaysDisplay: string;
  qualifiedCount: number;
}

export interface IdeaTopReelItem {
  rank: number;
  shortCode: string;
  url: string;
  videoUrl: string;
  hook: string;
  templatePattern: string;
  templateLines: string[];
  /** Instagram play count (Apify `videoPlayCount`, with legacy fallbacks at ingest). */
  plays: number;
  likesCount: number;
  commentsCount: number;
  isViral: boolean;
}

export interface IdeaTopReelsPayload {
  summary: IdeaTopReelsSummary;
  items: IdeaTopReelItem[];
}

/** JSONB on idea_scans: shortCode -> string */
export type IdeaScanReelStringMap = Record<string, string>;

export type IdeaTranscriptSource = 'transcribed' | 'caption_fallback' | null;
export type IdeaTranscriptStatus = 'success' | 'failed' | 'pending';

export interface IdeaScanTranscriptEntry {
  transcript: string | null;
  transcript_source: IdeaTranscriptSource;
  transcript_status: IdeaTranscriptStatus;
  transcript_attempts: number;
  last_transcript_error: string | null;
}

/** During migration, legacy rows may still store plain string transcript values. */
export type IdeaScanTranscriptStoredValue = string | IdeaScanTranscriptEntry;
export type IdeaScanTranscriptStoredMap = Record<string, IdeaScanTranscriptStoredValue>;

export type IdeaScanTranscriptMap = Record<string, IdeaScanTranscriptEntry>;

export function parseIdeaScanReelStringMap(raw: unknown): IdeaScanReelStringMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: IdeaScanReelStringMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export function defaultTranscriptEntry(): IdeaScanTranscriptEntry {
  return {
    transcript: null,
    transcript_source: null,
    transcript_status: 'pending',
    transcript_attempts: 0,
    last_transcript_error: null,
  };
}

export function normalizeTranscriptEntry(raw: unknown): IdeaScanTranscriptEntry {
  if (typeof raw === 'string') {
    const transcript = raw.trim();
    return {
      transcript: transcript || null,
      transcript_source: transcript ? 'transcribed' : null,
      transcript_status: transcript ? 'success' : 'pending',
      transcript_attempts: transcript ? 1 : 0,
      last_transcript_error: null,
    };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaultTranscriptEntry();
  }

  const obj = raw as Partial<IdeaScanTranscriptEntry>;
  const transcript =
    typeof obj.transcript === 'string' && obj.transcript.trim().length > 0
      ? obj.transcript.trim()
      : null;
  const transcriptSource =
    obj.transcript_source === 'transcribed' || obj.transcript_source === 'caption_fallback'
      ? obj.transcript_source
      : null;
  const transcriptStatus =
    obj.transcript_status === 'success' ||
    obj.transcript_status === 'failed' ||
    obj.transcript_status === 'pending'
      ? obj.transcript_status
      : transcript
        ? 'success'
        : 'pending';
  const transcriptAttempts =
    typeof obj.transcript_attempts === 'number' && Number.isFinite(obj.transcript_attempts)
      ? Math.max(0, Math.round(obj.transcript_attempts))
      : transcript
        ? 1
        : 0;
  const lastTranscriptError =
    typeof obj.last_transcript_error === 'string' && obj.last_transcript_error.trim().length > 0
      ? obj.last_transcript_error
      : null;

  return {
    transcript,
    transcript_source: transcriptSource,
    transcript_status: transcriptStatus,
    transcript_attempts: transcriptAttempts,
    last_transcript_error: lastTranscriptError,
  };
}

export function parseIdeaScanTranscriptMap(raw: unknown): IdeaScanTranscriptMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: IdeaScanTranscriptMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = normalizeTranscriptEntry(v);
  }
  return out;
}

export interface IdeaScanRow {
  id: string;
  user_id: string;
  handle: string;
  followers_count: number;
  scanned_at: string;
  raw_reels: unknown;
  top_reels: IdeaTopReelsPayload;
  saved_reel_ids: string[];
  /** Per-reel author notes (shortCode -> text). */
  user_note?: IdeaScanReelStringMap | null;
  /** Per-reel Instagram URLs (shortCode -> url). */
  reference_url?: IdeaScanReelStringMap | null;
  /** Per-reel transcript state and content (shortCode -> transcript object; legacy string accepted). */
  reel_transcripts?: IdeaScanTranscriptStoredMap | null;
}
