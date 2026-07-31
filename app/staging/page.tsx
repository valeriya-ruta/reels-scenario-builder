import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getAllContent } from '@/lib/content/contentList';
import { stagedPieces } from '@/lib/content/staging';
import StagingView from '@/components/staging/StagingView';

export const dynamic = 'force-dynamic';

/**
 * Розбір — the single staging surface for kept-but-uncommitted work.
 *
 * Deliberately its own route rather than a section of План: the calendar shows
 * only committed, dated pieces, and mixing the undecided into it would turn the
 * plan back into a list of maybes.
 */
export default async function StagingPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  const all = await getAllContent();
  return <StagingView pieces={stagedPieces(all)} nowIso={new Date().toISOString()} />;
}
