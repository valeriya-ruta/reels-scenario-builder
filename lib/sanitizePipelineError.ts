/**
 * Undici `fetch()` throws TypeError: "Failed to parse URL from /pipeline" for bad
 * relative URLs. Users should never see that raw string — and a corrupted Turbopack
 * cache can also serve stale server code that still triggers it.
 */
export function sanitizePipelineErrorForUser(message: string): string {
  const m = message.trim();
  if (
    /failed to parse url/i.test(m) ||
    (m.includes('/pipeline') && m.length < 160)
  ) {
    return (
      'Не вдалося завантажити відео (внутрішня помилка завантаження файлу). ' +
      'Спробуй: зупини `npm run dev`, у папці reels-planner видали каталог `.next`, ' +
      'знову `npm run dev` і відкрий лише http://localhost:3001 — не 3000. ' +
      'Якщо не допоможе, встав інший публічний Reel.'
    );
  }
  return m;
}
