import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getRecentContent } from '@/lib/recentContent';
import HomeView from '@/components/home/HomeView';

export default async function DashboardPage() {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  const recents = await getRecentContent(user.id, 5);

  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;
  // First name only keeps the greeting compact.
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;

  return <HomeView userName={firstName} recents={recents} />;
}
