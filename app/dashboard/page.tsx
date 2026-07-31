import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getAllContent } from '@/lib/content/contentList';
import { dateKey } from '@/lib/content/calendar';
import { stagedPieces, countNeedingDecision } from '@/lib/content/staging';
import { countPostedLinks } from '@/app/posted-actions';
import HomeView from '@/components/home/HomeView';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  // ONE read powers the whole stack — today, the inbox count, the statistics
  // preview and the all-content list are all views of the same objects, so they
  // cannot disagree about a piece's status or its date (Prompt 9).
  const all = await getAllContent();
  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const today = all.filter((p) => p.scheduledDate?.slice(0, 10) === todayKey);
  // Kept-but-undecided work — the number the inbox row applies pressure with.
  const staged = stagedPieces(all);
  const nowIso = now.toISOString();

  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;
  // First name only keeps the greeting compact.
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;

  return (
    <HomeView
      userName={firstName}
      todayKey={todayKey}
      today={today}
      all={all}
      stagedCount={staged.length}
      stagedOverdue={countNeedingDecision(staged, nowIso)}
      postedCount={await countPostedLinks()}
    />
  );
}
