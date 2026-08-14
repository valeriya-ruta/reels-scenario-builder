/**
 * "This storytelling just named itself" — one event, one listener.
 *
 * Auto-naming is triggered from the card the user is typing into, but the name
 * is shown by the editor's header (and, on the board, by the column header),
 * which holds it in its own state. Rather than thread a callback through every
 * card, the card announces the new name and whichever header is mounted picks
 * it up — the same shape as `postedLinkEvent`.
 *
 * Without this the title would keep reading «Нова історія» until a reload, and
 * the user would never see that the app had named their story for them.
 */

export const STORYTELLING_AUTO_NAMED_EVENT = 'ruta:storytelling-auto-named';

export type StorytellingAutoNamedDetail = {
  /** The storytelling (project) that was named. */
  id: string;
  name: string;
};

export function dispatchStorytellingAutoNamed(id: string, name: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<StorytellingAutoNamedDetail>(STORYTELLING_AUTO_NAMED_EVENT, {
      detail: { id, name },
    }),
  );
}

/** Subscribe; returns the unsubscribe. */
export function onStorytellingAutoNamed(
  handler: (detail: StorytellingAutoNamedDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<StorytellingAutoNamedDetail>).detail;
    if (detail?.id && detail.name) handler(detail);
  };
  window.addEventListener(STORYTELLING_AUTO_NAMED_EVENT, listener);
  return () => window.removeEventListener(STORYTELLING_AUTO_NAMED_EVENT, listener);
}
