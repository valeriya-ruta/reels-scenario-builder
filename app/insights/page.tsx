import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getAllContent } from '@/lib/content/contentList';
import { dateKey } from '@/lib/content/calendar';
import { buildProducerInsights } from '@/lib/insights/producerInsights';
import InsightsFull from '@/components/home/InsightsFull';

export const dynamic = 'force-dynamic';

/**
 * The fuller insights view behind Home's «Вся статистика» (§7).
 *
 * A separate route, NOT a nav tab: insights are ambient on the home screen and
 * this is where you go when a glance wasn't enough. Аналіз stays competitor
 * scraping — a different job with a different subject.
 */
export default async function InsightsPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  // Previews aren't needed here — this view counts pieces, it doesn't show them.
  const pieces = await getAllContent(undefined, false);
  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  return <InsightsFull insights={buildProducerInsights(pieces, todayKey)} pieces={pieces} />;
}
