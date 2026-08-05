/**
 * Client-safe Pro types (no server-only deps), so client components — the top
 * selector, blogger manager, dashboard — can import these without pulling server
 * code.
 */
export type ProProject = {
  id: string;
  name: string;
  /** Hex color used for the blogger's calendar pills / avatar ring. */
  color: string;
  /** Optional emoji avatar. */
  emoji: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

/** A per-blogger brand style + memory row (mirrors the global brand_settings). */
export type ProBrand = {
  projectId: string;
  theme: 'light' | 'dark';
  vibe: 'bold' | 'refined';
  favColorHex: string | null;
  colors: {
    lightBg: string | null;
    darkBg: string | null;
    accent1: string | null;
    accent2: string | null;
  };
  fontId: string | null;
  accentStyle: string | null;
  brandMemory: string | null;
};

export const DEFAULT_BLOGGER_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#ef4444', // red
  '#84cc16', // lime
];
