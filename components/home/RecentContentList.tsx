'use client';

import Link from 'next/link';
import ContentTypeIcon from '@/components/ContentTypeIcon';
import { CONTENT_TYPES, relativeTimeUk } from '@/lib/contentTypes';
import type { RecentContentItem } from '@/lib/recentContent';

/**
 * "Твій контент" — ClickUp-style recents list. Hairline dividers, no chunky
 * cards, no chevron. Each row: inline type icon (in the type tint, no tile) ·
 * title (single-line ellipsis) · subline "{Тип} · {relative time}". The whole
 * row is tappable and opens that content item.
 *
 * Left-gutter note: the icon sits in a fixed-width gutter so a ~18px status
 * ring/dot can be slotted in *before* it later (separate feature) without
 * restructuring the row.
 */
export default function RecentContentList({ items }: { items: RecentContentItem[] }) {
  return (
    <section className="space-y-2" aria-labelledby="recents-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="recents-heading" className="font-display text-lg font-semibold text-black">
          Твій контент
        </h2>
        <Link
          href="/projects"
          data-testid="recents-all-link"
          className="text-sm font-medium text-[color:var(--accent)] hover:underline"
        >
          Усі
        </Link>
      </div>

      {items.length === 0 ? (
        <div
          data-testid="recents-empty"
          className="rounded-xl bg-[color:var(--surface)] px-4 py-6 text-center"
        >
          <p className="text-sm font-medium text-zinc-700">Поки що порожньо</p>
          <p className="mt-1 text-sm leading-normal text-zinc-500">
            Натисни <span className="font-semibold text-[color:var(--accent)]">＋</span>, щоб
            створити перший контент.
          </p>
        </div>
      ) : (
        <ul data-testid="recents-list" className="divide-y divide-[color:var(--border)]">
          {items.map((item) => {
            const meta = CONTENT_TYPES[item.type];
            return (
              <li key={`${item.type}-${item.id}`}>
                <Link
                  href={meta.itemHref(item.id)}
                  data-testid="recent-row"
                  data-type={item.type}
                  className="flex items-center gap-3 py-3 transition-colors active:bg-[color:var(--surface)]"
                >
                  {/* Fixed-width left gutter (status indicator can slot in here later). */}
                  <span className="flex w-6 shrink-0 items-center justify-center">
                    <ContentTypeIcon type={item.type} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-black">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {meta.label}
                      {item.updatedAt ? ` · ${relativeTimeUk(item.updatedAt)}` : ''}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
