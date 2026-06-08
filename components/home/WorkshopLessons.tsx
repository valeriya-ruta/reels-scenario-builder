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
    <section className="space-y-2" aria-labelledby="workshop-heading">
      <h2 id="workshop-heading" className="font-display text-lg font-semibold text-black">
        Уроки воркшопу
      </h2>

      <ul data-testid="workshop-list" className="divide-y divide-[color:var(--border)]">
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <a
              href={lesson.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="workshop-row"
              className="flex items-center gap-3 py-3 transition-colors active:bg-[color:var(--surface)]"
            >
              <span className="flex w-6 shrink-0 items-center justify-center">
                <PlayCircle className="h-5 w-5 text-[color:var(--accent)]" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-black">{lesson.title}</span>
                <span className="mt-0.5 block truncate text-xs text-zinc-500">
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
