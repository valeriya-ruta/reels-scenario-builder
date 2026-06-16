import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getAllContent } from '@/lib/content/contentList';
import HomeView from '@/components/home/HomeView';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  // Latest few across all types/statuses for the Home recents (full list at /content).
  const recents = await getAllContent(6);

  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;
  // First name only keeps the greeting compact.
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;

  return <HomeView userName={firstName} recents={recents} />;
}
