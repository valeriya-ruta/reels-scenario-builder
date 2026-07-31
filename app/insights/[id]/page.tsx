import { notFound, redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getAllContent } from '@/lib/content/contentList';
import { postedPieces, winnerIds } from '@/lib/insights/postedRanking';
import PostInsightsView from '@/components/insights/PostInsightsView';

export const dynamic = 'force-dynamic';

/**
 * Per-post view behind an Інсайти row (Prompt 8).
 *
 * Reads the same canonical list as the tab so "winner" means the same thing in
 * both places — the flag is relative to the account's own median, which only
 * exists when the whole population is in hand.
 */
export default async function PostInsightsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  if (!user) redirect('/');

  const { id } = await params;
  const posted = postedPieces(await getAllContent());
  const piece = posted.find((p) => p.id === id);
  if (!piece) notFound();

  return <PostInsightsView piece={piece} isWinnerPost={winnerIds(posted).has(piece.id)} />;
}
