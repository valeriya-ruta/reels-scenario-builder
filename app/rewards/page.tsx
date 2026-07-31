import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { countPostedLinks } from '@/app/posted-actions';
import RewardsView from '@/components/rewards/RewardsView';

export const dynamic = 'force-dynamic';

/**
 * The gamification page behind Home's coin (Prompt 3). A route rather than a
 * nav tab: it is somewhere you go when the coin catches your eye, not a
 * destination competing with the daily work.
 */
export default async function RewardsPage() {
  const user = await requireAuth();
  if (!user) redirect('/');
  return <RewardsView initialCount={await countPostedLinks()} />;
}
