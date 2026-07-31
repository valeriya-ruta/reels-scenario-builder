/**
 * Staging — the undecided pile, modelled on Todoist's Inbox (pure logic).
 *
 * The rule this module encodes: staging is a place designed to be EMPTIED, not
 * a library, an archive, or "my ideas". So there is no neutral "stored" state
 * here — every staged item is aging, and aging is visible.
 *
 * A piece is staged when it is kept but uncommitted: no date, not published.
 * Braindumps are NOT staged — a dump is a source, not a piece awaiting a
 * decision; it has its own home and its own fan-out.
 */

import type { ContentPiece } from '@/lib/content/contentPiece';

/** Days after which an item starts visibly nagging. */
export const STALE_AFTER_DAYS = 5;
/** Days after which Ruta actively asks "schedule this or let it go?". */
export const NUDGE_AFTER_DAYS = 10;

export type Staleness = 'fresh' | 'aging' | 'stale';

/** Kept but uncommitted: no date, not published, and not a raw braindump. */
export function isStaged(piece: Pick<ContentPiece, 'scheduledDate' | 'status' | 'refTable'>): boolean {
  if (piece.refTable === 'ideas') return false;
  if (piece.scheduledDate) return false;
  return piece.status !== 'published';
}

export function stagedPieces(pieces: ReadonlyArray<ContentPiece>): ContentPiece[] {
  return pieces.filter(isStaged);
}

/** Whole days a piece has sat untouched. */
export function stagedAgeDays(piece: Pick<ContentPiece, 'updatedAt'>, nowIso: string): number {
  const then = Date.parse(piece.updatedAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(then) || Number.isNaN(now)) return 0;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

export function staleness(ageDays: number): Staleness {
  if (ageDays >= NUDGE_AFTER_DAYS) return 'stale';
  if (ageDays >= STALE_AFTER_DAYS) return 'aging';
  return 'fresh';
}

/**
 * The pressure line for a staged item. Never neutral: even a fresh item is
 * described as awaiting a decision, because "just sitting here" is the state
 * staging exists to prevent.
 */
export function stagingPressure(ageDays: number): string {
  const level = staleness(ageDays);
  if (level === 'stale') return `Лежить ${ageDays} дн. Ставимо дату чи відпускаємо?`;
  if (level === 'aging') return `${ageDays} дн без дати`;
  return ageDays === 0 ? 'Чекає на дату' : `${ageDays} дн без дати`;
}

/**
 * Sort so the item that most needs a decision is on top: oldest first. Staging
 * is worked from the top down until it is empty.
 */
export function sortByPressure(pieces: ReadonlyArray<ContentPiece>): ContentPiece[] {
  return [...pieces].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

/** How many staged items have crossed the nudge threshold. */
export function countNeedingDecision(
  pieces: ReadonlyArray<ContentPiece>,
  nowIso: string,
): number {
  return pieces.filter((p) => stagedAgeDays(p, nowIso) >= NUDGE_AFTER_DAYS).length;
}

/** One-line summary of the pile, for the Home pressure card and nav. */
export function stagingSummary(count: number): string {
  if (count === 0) return 'Нічого не зависло';
  if (count === 1) return '1 річ чекає на рішення';
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun =
    mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'речі чекають' : 'речей чекають';
  return `${count} ${noun} на рішення`;
}

/**
 * The Home inbox row's line (Prompt 7). Pressure, not storage: a neutral label
 * («Чернетки», «Збережене») invites the pile to grow, which is the failure mode
 * staging exists to prevent — so the row says how many are UNFINISHED and asks
 * to finish them. Ukrainian plurals are not optional here.
 */
export function unfinishedLine(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} ідея не завершена — давай її завершимо!`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} ідеї не завершені — давай їх завершимо!`;
  }
  return `${count} ідей не завершені — давай їх завершимо!`;
}

/**
 * Guard against dumping a whole generated batch into staging at once (4.4).
 * A batch bigger than this is a graveyard in the making, so the caller must
 * route it through a review instead of writing it straight to staging.
 */
export const MAX_BATCH_INTO_STAGING = 3;

export function wouldFloodStaging(batchSize: number): boolean {
  return batchSize > MAX_BATCH_INTO_STAGING;
}
