export interface IdeaScanSummary {
  id: string;
  handle: string;
  followers_count: number;
  scanned_at: string;
  saved_reel_ids: string[];
  /** Filled by list API from `top_reels.summary` for the recents table. */
  avgViewsDisplay?: string;
  avgErDisplay?: string;
}

export interface IdeaTopReelsSummary {
  reelsAnalyzed: number;
  avgViewsDisplay: string;
  avgErDisplay: string;
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
  videoViewCount: number;
  savesCount: number;
  likesCount: number;
  commentsCount: number;
  erPercent: number;
  viralScore: number;
  isViral: boolean;
}

export interface IdeaTopReelsPayload {
  summary: IdeaTopReelsSummary;
  items: IdeaTopReelItem[];
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
}
