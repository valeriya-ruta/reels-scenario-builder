import { Suspense } from 'react';
import WelcomeModal from '@/components/WelcomeModal';
import Greeting from './Greeting';
import HomeRecents from './HomeRecents';
import InsightsSkeleton from './InsightsSkeleton';
import WorkshopLessons from './WorkshopLessons';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Home (Головна) — the default landing screen. Mobile-first, white surfaces,
 * blue #004BA8 functional accent, clean hairline lists. Sections top→bottom:
 * greeting → "Твій контент" recents (latest few, status rows) → insights
 * coming-soon skeleton → workshop lessons.
 */
export default function HomeView({
  userName,
  recents,
}: {
  userName?: string | null;
  recents: ContentPiece[];
}) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 pb-24">
      <Suspense fallback={null}>
        <WelcomeModal />
      </Suspense>
      <Greeting name={userName} />
      <HomeRecents pieces={recents} />
      <InsightsSkeleton />
      <WorkshopLessons />
    </div>
  );
}
