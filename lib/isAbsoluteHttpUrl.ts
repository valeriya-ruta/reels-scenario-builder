/** True only for parseable absolute http(s) URLs (rejects paths like `/pipeline`). */
export function isAbsoluteHttpUrlString(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
