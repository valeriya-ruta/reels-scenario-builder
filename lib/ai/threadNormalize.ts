/**
 * Pure normalization + limits for the Threads output (repurposing).
 *
 * Split out of the generator for the same reason `storiesNormalize` is: the
 * generator is server-only (it holds the API key), while these are needed by the
 * review UI to render a character counter, and by the logic specs to prove the
 * clamp. A counter that disagrees with the clamp is worse than no counter, so
 * both sides read the numbers from HERE.
 */

/** Hard per-post character limit on Threads. */
export const THREADS_POST_CHAR_LIMIT = 500;

/** Fewer than this is not a thread; more than this is a blog post. */
export const THREAD_MIN_POSTS = 2;
export const THREAD_MAX_POSTS = 8;

/** "1/7", "3 / 8.", "2\4 —" at the head of a post — the counter the prompt bans. */
const POST_COUNTER_RE = /^\s*\d+\s*[/\\]\s*\d+\s*[.)–—-]?\s*/;

/**
 * Turn whatever the model returned into postable text: real strings only, no
 * numbering artifacts, nothing empty, nothing over the platform limit, and never
 * more posts than a thread should be.
 */
export function normalizeThreadPosts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const text =
        typeof entry === 'string'
          ? entry
          : entry && typeof entry === 'object'
            ? String((entry as { text?: unknown }).text ?? '')
            : '';
      return text.replace(POST_COUNTER_RE, '').trim();
    })
    .filter((text) => text.length > 0)
    .slice(0, THREAD_MAX_POSTS)
    .map((text) =>
      text.length <= THREADS_POST_CHAR_LIMIT
        ? text
        : `${text.slice(0, THREADS_POST_CHAR_LIMIT - 1).trimEnd()}…`,
    );
}

/**
 * What the thread is "called". The model supplies a title; when it doesn't, the
 * first post's opening words are the honest fallback — a thread is named by how
 * it starts.
 */
export function deriveThreadTitle(rawTitle: unknown, posts: string[]): string {
  const title = typeof rawTitle === 'string' ? rawTitle.replace(/\s+/g, ' ').trim() : '';
  if (title) return title.slice(0, 120);
  const lead = (posts[0] ?? '').replace(/\s+/g, ' ').trim();
  return lead.length > 60 ? `${lead.slice(0, 59).trimEnd()}…` : lead || 'Тред';
}

/** The whole thread as one copyable block — posts separated by a blank line. */
export function threadToPlainText(posts: string[]): string {
  return posts.join('\n\n');
}
