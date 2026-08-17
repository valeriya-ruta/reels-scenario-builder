import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getAllContent } from '@/lib/content/contentList';
import { stagedPieces, countNeedingDecision } from '@/lib/content/staging';
import { canShareCalendar, getMyCalendarShareLink } from '@/lib/calendar/share';
import { getProScope } from '@/lib/pro/scope';
import { getProProject } from '@/lib/pro/projects';
import PlanCalendar from '@/components/plan/PlanCalendar';

/**
 * План — content calendar (task 86d3d23nj). Reads all of the user's content and
 * renders the month grid; days with scheduled content show a count badge, and
 * selecting a day lists that day's pieces as the real content cards.
 *
 * The page also carries the calendar's SHARE link (migrations 029/032): the same
 * plan, read-only, on a URL a client can open without an account. The link is
 * scoped to the blogger the page is currently showing — under Pro one account
 * holds several, and one client must never be handed another's plan.
 */
export default async function PlanPage() {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  const [pieces, shareLink, canShare, scope] = await Promise.all([
    getAllContent(),
    getMyCalendarShareLink(),
    canShareCalendar(),
    getProScope(),
  ]);
  const staged = stagedPieces(pieces);
  const nowIso = new Date().toISOString();

  // The link is per blogger, so it is named after the blogger it shows — not
  // after the operator, whose name means nothing to that blogger's client.
  const blogger =
    scope.kind === 'project' ? (await getProProject(scope.projectId))?.name ?? null : null;

  return (
    <PlanCalendar
      pieces={pieces}
      stagedCount={staged.length}
      stagedOverdue={countNeedingDecision(staged, nowIso)}
      shareLink={shareLink}
      canShare={canShare}
      shareTitle={blogger || user.user_metadata?.full_name || user.email || 'Контент-план'}
    />
  );
}
