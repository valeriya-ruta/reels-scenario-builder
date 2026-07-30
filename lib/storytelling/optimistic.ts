/**
 * Pure helpers for optimistic create in the storytelling board (task 86d3fcnny).
 *
 * The lag fix renders new columns/stories instantly from local state and fires
 * the Supabase insert in the background. To avoid a temp-id→real-id reconcile
 * window (during which StoryCard autosaves would target a non-existent row and
 * silently lose edits), we generate the row id on the CLIENT and pass it into
 * the insert — so the id is real from the first render.
 *
 * Import-free so the ordering rule + builders are unit-testable without a DOM.
 */

import type { StorytellingColumn, StorytellingStory } from '@/lib/domain';

/** Stable client-side id. Uses crypto.randomUUID when available (secure ctx). */
export function genClientId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback (non-secure contexts / very old runtimes): RFC-4122-ish v4.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Next order_index = max existing + 1 (NOT array length — length is wrong once
 * items have been deleted/reordered and gaps appear). Empty list → 0.
 */
export function nextOrderIndex(items: ReadonlyArray<{ order_index: number }>): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((i) => i.order_index)) + 1;
}

export function makeOptimisticStory(
  columnId: string,
  orderIndex: number,
  id: string = genClientId(),
  createdAt: string = new Date().toISOString(),
): StorytellingStory {
  return {
    id,
    column_id: columnId,
    order_index: orderIndex,
    text: '',
    visual: null,
    engagement: null,
    created_at: createdAt,
  };
}

export function makeOptimisticColumn(
  projectId: string,
  name: string,
  orderIndex: number,
  columnId: string = genClientId(),
  createdAt: string = new Date().toISOString(),
): StorytellingColumn {
  return {
    id: columnId,
    project_id: projectId,
    name,
    order_index: orderIndex,
    created_at: createdAt,
  };
}
