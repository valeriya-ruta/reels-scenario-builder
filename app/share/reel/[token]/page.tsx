import { notFound } from 'next/navigation';
import { getSharedReelSet } from '@/lib/reels/share';
import SharedReelSet from '@/components/reels/SharedReelSet';

export const dynamic = 'force-dynamic';

/**
 * What a share link opens, for the person doing the work. No login, and the only
 * thing they can change is whether something is ticked off as done.
 *
 * One token can carry one reel or fifteen — a set of one is not a special case,
 * so there is one route and one component for both.
 */
export default async function SharedReelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const set = await getSharedReelSet(token);
  if (!set || set.reels.length === 0) notFound();

  return (
    <SharedReelSet
      token={token}
      title={set.title}
      note={set.note}
      reels={set.reels}
      initialDone={set.done}
    />
  );
}
