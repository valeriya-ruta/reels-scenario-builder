import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getAllContent } from '@/lib/content/contentList';
import { dateKey } from '@/lib/content/calendar';
import HomeView from '@/components/home/HomeView';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  // One read powers both sections: everything scheduled for today (the «Сьогодні»
  // plan) and the latest few across all types (recents; full list at /content).
  const all = await getAllContent();
  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  // Everything from today onwards, soonest first — the agenda's source.
  const upcoming = all
    .filter((p) => (p.scheduledDate?.slice(0, 10) ?? '') >= todayKey)
    .sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''));
  const recents = all.slice(0, 6);

  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;
  // First name only keeps the greeting compact.
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;

  return <HomeView userName={firstName} upcoming={upcoming} todayKey={todayKey} recents={recents} />;
}
