import { Suspense } from 'react';
import WelcomeModal from '@/components/WelcomeModal';
import Greeting from './Greeting';
import CoinBadge from './CoinBadge';
import TodaySection from './TodaySection';
import InboxPressureRow from './InboxPressureRow';
import StatsPreview from './StatsPreview';
import AllContentSection from './AllContentSection';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Home (Головна) — ONE vertical stack, ranked by urgency (Prompt 7).
 *
 * This supersedes the earlier greeting + coin + today-widget layout and the
 * agenda/recents/rhythm sections that grew around it. The order is the whole
 * design:
 *
 *   1. greeting + coin   — who you are, how you're doing (the coin is the ONLY
 *                          entry point to Нагороди)
 *   2. Сьогодні          — what you're posting today, with «＋» to add to today
 *   3. inbox row         — the unfinished pile, framed as pressure to finish;
 *                          the inbox's only home in the app (no inbox tab, no
 *                          standalone inbox screen — just this row and the list
 *                          it opens)
 *   4. Статистика        — a preview of the Insights tab, same data, «більше»
 *   5. Весь контент      — everything, last, because it's the least urgent
 *
 * Deliberately NO grid of "create a reel / carousel / story" buttons: the user's
 * problem isn't choosing a format, it's knowing what to make.
 *
 * Bottom clearance is the shell's job (`.app-main-scroll`), so nothing here
 * renders under the nav.
 */
export default function HomeView({
  userName,
  todayKey,
  today,
  all,
  stagedCount,
  stagedOverdue,
  postedCount,
}: {
  userName?: string | null;
  todayKey: string;
  /** Pieces scheduled for today. */
  today: ContentPiece[];
  /** Everything, for the bottom section and the statistics preview. */
  all: ContentPiece[];
  /** Kept-but-undated work awaiting a decision — the inbox count. */
  stagedCount: number;
  stagedOverdue: number;
  /** Posted links logged, shown on the coin. */
  postedCount: number;
}) {
  return (
    <div className="app-page space-y-7">
      <Suspense fallback={null}>
        <WelcomeModal />
      </Suspense>

      {/* 1 — top bar. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Greeting name={userName} />
        </div>
        <CoinBadge count={postedCount} />
      </div>

      {/* 2 — today. */}
      <TodaySection pieces={today} todayKey={todayKey} />

      {/* 3 — the inbox, as one row. Disappears at zero. */}
      <InboxPressureRow count={stagedCount} overdue={stagedOverdue} />

      {/* 4 — statistics preview (same data as the Insights tab). */}
      <StatsPreview pieces={all} />

      {/* 5 — everything else. */}
      <AllContentSection pieces={all} />
    </div>
  );
}
