import { Suspense } from 'react';
import WelcomeModal from '@/components/WelcomeModal';
import Greeting from './Greeting';
import TodayPlan from './TodayPlan';
import HomeRecents from './HomeRecents';
import InsightsSkeleton from './InsightsSkeleton';
import WorkshopLessons from './WorkshopLessons';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Home (Головна). The app opens as an assistant, not a menu: greeting →
 * «Сьогодні» (what you're posting today, or a single low-friction way in when
 * nothing is planned) → recents → insights → lessons.
 *
 * Deliberately NO grid of "create a reel / carousel / story" buttons: the user's
 * problem isn't choosing a format, it's knowing what to make — so the app leads
 * with the plan and keeps creation to one entry point.
 */
export default function HomeView({
  userName,
  today,
  recents,
}: {
  userName?: string | null;
  today: ContentPiece[];
  recents: ContentPiece[];
}) {
  return (
    <div className="app-page space-y-7">
      <Suspense fallback={null}>
        <WelcomeModal />
      </Suspense>
      <Greeting name={userName} />
      <TodayPlan pieces={today} />
      <HomeRecents pieces={recents} />
      <InsightsSkeleton />
      <WorkshopLessons />
    </div>
  );
}
