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

export function parseIdeaScanReelStringMap(raw: unknown): IdeaScanReelStringMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: IdeaScanReelStringMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
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
  /** Per-reel saved transcript after successful STT (shortCode -> text). */
  reel_transcripts?: IdeaScanReelStringMap | null;
}
