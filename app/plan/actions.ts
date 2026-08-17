'use server';

import {
  ensureCalendarShareLink,
  regenerateCalendarShareLink,
  revokeCalendarShareLink,
  updateCalendarShareHeader,
  type CalendarShareLink,
} from '@/lib/calendar/share';

/**
 * Owner-side actions behind the «Поділитися» button on План. Every one of them
 * is scoped to the signed-in user inside `lib/calendar/share.ts` — nothing here
 * takes a user id from the client.
 */

export type ShareLinkResult =
  | { ok: true; link: CalendarShareLink }
  | { ok: false; error: string };

const FAILED = 'Не вдалося створити посилання. Спробуй ще раз.';

export async function createCalendarShareLinkAction(title?: string): Promise<ShareLinkResult> {
  const link = await ensureCalendarShareLink(title ?? null);
  return link ? { ok: true, link } : { ok: false, error: FAILED };
}

export async function regenerateCalendarShareLinkAction(title?: string): Promise<ShareLinkResult> {
  const link = await regenerateCalendarShareLink(title ?? null);
  return link ? { ok: true, link } : { ok: false, error: FAILED };
}

export async function revokeCalendarShareLinkAction(): Promise<{ ok: boolean }> {
  return { ok: await revokeCalendarShareLink() };
}

export async function updateCalendarShareHeaderAction(
  title: string,
  note: string,
): Promise<{ ok: boolean }> {
  return { ok: await updateCalendarShareHeader(title, note) };
}
