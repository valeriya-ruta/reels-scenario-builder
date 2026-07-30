import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getAllContent } from '@/lib/content/contentList';
import PlanCalendar from '@/components/plan/PlanCalendar';

/**
 * План — content calendar (task 86d3d23nj). Reads all of the user's content and
 * renders the month grid; days with scheduled content show a count badge, and
 * selecting a day lists that day's pieces as the real content cards.
 */
export default async function PlanPage() {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  const pieces = await getAllContent();

  return <PlanCalendar pieces={pieces} />;
}
