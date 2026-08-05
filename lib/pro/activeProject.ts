import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';

/**
 * The active blogger/project is pinned in a cookie set by the top selector. A
 * missing cookie (or the sentinel 'all') means "All / Dashboard" — no single
 * project is pinned.
 */
export const ACTIVE_PROJECT_COOKIE = 'ruta_pro_pid';
export const ALL_SENTINEL = 'all';

/** Raw pinned project id from the cookie, or null for All/Dashboard. */
export const getActiveProjectId = cache(async (): Promise<string | null> => {
  const store = await cookies();
  const raw = store.get(ACTIVE_PROJECT_COOKIE)?.value?.trim();
  if (!raw || raw === ALL_SENTINEL) return null;
  return raw;
});
