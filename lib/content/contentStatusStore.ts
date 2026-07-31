'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { setContentStatus } from '@/app/content-actions';
import { dispatchContentPublished } from '@/lib/content/postedLinkEvent';
import { nextStatus, PUBLISHED_STATUS, type ContentStatus } from '@/lib/content/statusSystem';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * ONE status per content object, read identically by every surface (Prompt 9).
 *
 * ── The bug this replaces ──────────────────────────────────────────────────
 * Status was persisted correctly, but FOUR components each kept their own
 * private `statusById` override map (`ContentRows`, `SwipeableContentList`,
 * `PlanCalendar`, `StatusPill`), and the server action never invalidated the
 * RSC cache. So:
 *
 *   • Home mounts `ContentRows` three times (Сьогодні, Що постимо, Твій
 *     контент). Advancing a piece's ring in Сьогодні wrote the override into
 *     THAT instance only — the same object, on the same screen, kept rendering
 *     its old status in the other two. That is exactly the reported
 *     «Опубліковано here, Скрипт there».
 *   • With no `revalidatePath`, navigating away and back re-served the cached
 *     RSC payload, so the stale status survived the round trip too.
 *
 * ── The rule now enforced ─────────────────────────────────────────────────
 * The DB is the source of truth. This module is the ONE in-flight overlay on
 * top of it — module-scoped, not per-component — so an optimistic change is
 * visible to every mounted surface in the same tick. It is deliberately NOT a
 * React context: a context has to be mounted at the right place to work, and a
 * surface rendered outside it would silently fall back to its own copy, which
 * is the class of bug being fixed.
 *
 * An override is self-healing: as soon as the server re-renders with the same
 * value, `settle` drops it, and the DB is once again the only thing being read.
 */

/** pieceId → status the user just set, pending server confirmation. */
let overrides: Readonly<Record<string, ContentStatus>> = Object.freeze({});
const EMPTY: Readonly<Record<string, ContentStatus>> = Object.freeze({});

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Readonly<Record<string, ContentStatus>> {
  return overrides;
}

/** Server render never has pending overrides — it IS the source of truth. */
function getServerSnapshot(): Readonly<Record<string, ContentStatus>> {
  return EMPTY;
}

function setOverride(id: string, status: ContentStatus): void {
  if (overrides[id] === status) return;
  overrides = Object.freeze({ ...overrides, [id]: status });
  emit();
}

function clearOverride(id: string): void {
  if (!(id in overrides)) return;
  const next = { ...overrides };
  delete next[id];
  overrides = Object.freeze(next);
  emit();
}

/**
 * Drop overrides the server has caught up with. Called by every read hook with
 * the freshest props it has, so the overlay shrinks back to empty on its own
 * and a later server-side change is never masked by a stale local value.
 */
function settle(pieces: ReadonlyArray<Pick<ContentPiece, 'id' | 'status'>>): void {
  let changed = false;
  const next = { ...overrides };
  for (const piece of pieces) {
    if (piece.id in next && next[piece.id] === piece.status) {
      delete next[piece.id];
      changed = true;
    }
  }
  if (!changed) return;
  overrides = Object.freeze(next);
  emit();
}

function useOverrides(): Readonly<Record<string, ContentStatus>> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Server pieces with the canonical status applied. Every list on every screen
 * runs its data through this, so two lists showing the same object cannot
 * disagree.
 */
export function useLiveStatuses<T extends ContentPiece>(pieces: T[]): T[] {
  const map = useOverrides();

  useEffect(() => {
    settle(pieces);
  }, [pieces]);

  return useMemo(
    () =>
      pieces.map((piece) => {
        const pending = map[piece.id];
        return pending && pending !== piece.status ? { ...piece, status: pending } : piece;
      }),
    [pieces, map],
  );
}

/** Single-piece read, for the editors' status pill. */
export function useLiveStatus(id: string, serverStatus: ContentStatus): ContentStatus {
  const map = useOverrides();

  useEffect(() => {
    settle([{ id, status: serverStatus }]);
  }, [id, serverStatus]);

  return map[id] ?? serverStatus;
}

export type StatusTarget = Pick<ContentPiece, 'id' | 'refTable' | 'type'> & {
  status: ContentStatus;
};

/**
 * The ONE status write path.
 *
 * Optimistic (so the tap feels instant), shared (so every surface moves at
 * once), rolled back on failure, and followed by `router.refresh()` — the
 * server action revalidates, and the refresh pulls the fresh RSC payload so the
 * overlay can settle and the DB becomes the only thing being read again.
 */
export function useSetContentStatus() {
  const router = useRouter();

  return useCallback(
    async (target: StatusTarget, next: ContentStatus): Promise<boolean> => {
      const current = overrides[target.id] ?? target.status;
      if (current === next) return true;

      setOverride(target.id, next);
      const res = await setContentStatus(target.refTable, target.id, target.type, next);

      if (!res.ok) {
        // Roll back to whatever the server last told us, not to a guess.
        if (current === target.status) clearOverride(target.id);
        else setOverride(target.id, current);
        return false;
      }

      // Publishing from ANY surface asks for the link through the same host.
      if (next === PUBLISHED_STATUS) dispatchContentPublished(target.refTable, target.id);
      router.refresh();
      return true;
    },
    [router],
  );
}

/**
 * Advance one stage along the piece's track.
 *
 * Three distinct outcomes, because the callers must not conflate them: `'end'`
 * is a gentle no-op at Опубліковано, `'failed'` deserves a hint.
 */
export type AdvanceOutcome = 'moved' | 'end' | 'failed';

export function useAdvanceContentStatus() {
  const set = useSetContentStatus();

  return useCallback(
    async (target: StatusTarget): Promise<AdvanceOutcome> => {
      const current = overrides[target.id] ?? target.status;
      const next = nextStatus(target.type, current);
      if (!next) return 'end'; // already at Опубліковано → gentle no-op
      return (await set({ ...target, status: current }, next)) ? 'moved' : 'failed';
    },
    [set],
  );
}
