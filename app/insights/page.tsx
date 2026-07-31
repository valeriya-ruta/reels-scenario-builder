import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getAllContent } from '@/lib/content/contentList';
import InsightsTab from '@/components/insights/InsightsTab';

export const dynamic = 'force-dynamic';

/**
 * The Інсайти tab (Prompt 8) — YOUR performance, link-scraped.
 *
 * Previews ARE needed here: a carousel with no scraped thumbnail falls back to
 * its own cover palette, which is what `attachPreviews` carries.
 */
export default async function InsightsPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  return <InsightsTab pieces={await getAllContent()} />;
}
