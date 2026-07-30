'use client';

import { PlayCircle } from 'lucide-react';
import { flattenedWorkshopLessons } from '@/lib/workshopLessons';

/**
 * "Уроки воркшопу" — AI-content workshop lessons for founding users.
 *
 * Source: the hardcoded WORKSHOP_MODULES list (lib/workshopLessons.ts) — there
 * is no lessons backend yet. Visibility: there is no workshop-user flag in the
 * repo, so per the spec this is shown to all users for now. Each row opens the
 * lesson on YouTube in a new tab. No duration metadata exists in the source, so
 * the subline shows the module name instead of a fabricated "X хв".
 */
export default function WorkshopLessons() {
  const lessons = flattenedWorkshopLessons();

  return (
    <section className="space-y-2.5" aria-labelledby="workshop-heading">
      <h2 id="workshop-heading" className="app-section-label px-0.5">
        Уроки воркшопу
      </h2>

      <ul data-testid="workshop-list" className="app-card divide-y divide-[color:var(--border)] overflow-hidden">
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <a
              href={lesson.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="workshop-row"
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[color:var(--surface1)] active:bg-[color:var(--surface1)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)]">
                <PlayCircle className="h-[18px] w-[18px] text-[color:var(--accent)]" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[color:var(--foreground)]">
                  {lesson.title}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-[color:var(--text-muted)]">
                  Урок {lesson.index} · {lesson.moduleTitle}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
