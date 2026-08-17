import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getAllContent } from '@/lib/content/contentList';
import { stagedPieces, countNeedingDecision } from '@/lib/content/staging';
import { getMyCalendarShareLink } from '@/lib/calendar/share';
import PlanCalendar from '@/components/plan/PlanCalendar';

/**
 * План — content calendar (task 86d3d23nj). Reads all of the user's content and
 * renders the month grid; days with scheduled content show a count badge, and
 * selecting a day lists that day's pieces as the real content cards.
 *
 * The page also carries the calendar's SHARE link (migration 029): the same plan,
 * read-only, on a URL a client can open without an account.
 */
export default async function PlanPage() {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  const [pieces, shareLink] = await Promise.all([getAllContent(), getMyCalendarShareLink()]);
  const staged = stagedPieces(pieces);
  const nowIso = new Date().toISOString();

  return (
    <PlanCalendar
      pieces={pieces}
      stagedCount={staged.length}
      stagedOverdue={countNeedingDecision(staged, nowIso)}
      shareLink={shareLink}
      shareTitle={user.user_metadata?.full_name || user.email || 'Контент-план'}
    />
  );
}
