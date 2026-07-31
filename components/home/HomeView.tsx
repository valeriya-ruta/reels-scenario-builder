import { Suspense } from 'react';
import WelcomeModal from '@/components/WelcomeModal';
import Greeting from './Greeting';
import Agenda from './Agenda';
import HomeRecents from './HomeRecents';
import Insights from './Insights';
import WorkshopLessons from './WorkshopLessons';
import StagingPressureCard from '@/components/staging/StagingPressureCard';
import type { ContentPiece } from '@/lib/content/contentPiece';
import type { ProducerInsights } from '@/lib/insights/producerInsights';

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
  stagedCount,
  stagedOverdue,
  insights,
}: {
  userName?: string | null;
  /** Everything scheduled today or later, any type. */
  upcoming: ContentPiece[];
  todayKey: string;
  recents: ContentPiece[];
  /** Kept-but-undated work awaiting a decision (Розбір). */
  stagedCount: number;
  stagedOverdue: number;
  /** Real output insights (§7) — ambient on the main page, not a nav tab. */
  insights: ProducerInsights;
}) {
  return (
    <div className="app-page space-y-7">
      <Suspense fallback={null}>
        <WelcomeModal />
      </Suspense>
      <Greeting name={userName} />
      {/* The staging count sits directly under the plan: what's committed, then
          what's still undecided. It disappears entirely at zero. */}
      <StagingPressureCard count={stagedCount} overdue={stagedOverdue} />
      <Agenda pieces={upcoming} todayKey={todayKey} />
      <HomeRecents pieces={recents} />
      <Insights insights={insights} />
      <WorkshopLessons />
    </div>
  );
}
