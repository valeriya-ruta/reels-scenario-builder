import { Suspense } from 'react';
import WelcomeModal from '@/components/WelcomeModal';
import Greeting from './Greeting';
import HomeRecents from './HomeRecents';
import InsightsSkeleton from './InsightsSkeleton';
import WorkshopLessons from './WorkshopLessons';
import HomeQuickActions from './HomeQuickActions';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Home (Головна) — the landing screen, rebuilt on the app UI system: off-white
 * canvas, a large greeting, quick-create actions, then grouped cards
 * (recents → insights → lessons). Structure mirrors the productivity apps this
 * app sits next to: big title, immediate actions, then content groups.
 */
export default function HomeView({
  userName,
  recents,
}: {
  userName?: string | null;
  recents: ContentPiece[];
}) {
  return (
    <div className="app-page space-y-7">
      <Suspense fallback={null}>
        <WelcomeModal />
      </Suspense>
      <Greeting name={userName} />
      <HomeQuickActions />
      <HomeRecents pieces={recents} />
      <InsightsSkeleton />
      <WorkshopLessons />
    </div>
  );
}
