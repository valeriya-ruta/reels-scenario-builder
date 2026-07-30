import { Suspense } from 'react';
import WelcomeModal from '@/components/WelcomeModal';
import Greeting from './Greeting';
import Agenda from './Agenda';
import HomeRecents from './HomeRecents';
import InsightsSkeleton from './InsightsSkeleton';
import WorkshopLessons from './WorkshopLessons';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Home (Головна). The app opens as an assistant, not a menu: greeting → the
 * agenda («Сьогодні» / «Завтра» / dated days — what you're actually posting) →
 * recents → insights → lessons.
 *
 * Deliberately NO grid of "create a reel / carousel / story" buttons: the user's
 * problem isn't choosing a format, it's knowing what to make — so the app leads
 * with the plan and keeps creation to one entry point.
 */
export default function HomeView({
  userName,
  upcoming,
  todayKey,
  recents,
}: {
  userName?: string | null;
  /** Everything scheduled today or later, any type. */
  upcoming: ContentPiece[];
  todayKey: string;
  recents: ContentPiece[];
}) {
  return (
    <div className="app-page space-y-7">
      <Suspense fallback={null}>
        <WelcomeModal />
      </Suspense>
      <Greeting name={userName} />
      <Agenda pieces={upcoming} todayKey={todayKey} />
      <HomeRecents pieces={recents} />
      <InsightsSkeleton />
      <WorkshopLessons />
    </div>
  );
}
