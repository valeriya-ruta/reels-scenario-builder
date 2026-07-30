'use client';

import { useRouter } from 'next/navigation';
import { RADIAL_OPTIONS, type RadialOptionId } from '@/components/CreateRadialMenu';
import { CONTENT_TYPES } from '@/lib/contentTypes';
import { OPEN_BRAINDUMP_FRESH_EVENT } from '@/lib/content/braindumpIdeaEvent';

/**
 * Quick-create tiles on Home (app UI system). The four create options as a
 * 2×2 card grid — the "immediate actions under the title" pattern productivity
 * apps open with, so creating is one tap from landing instead of hunting the FAB.
 */
export default function HomeQuickActions() {
  const router = useRouter();

  const select = (id: RadialOptionId) => {
    if (id === 'ideas') {
      window.dispatchEvent(new CustomEvent(OPEN_BRAINDUMP_FRESH_EVENT));
      return;
    }
    router.push(CONTENT_TYPES[id].createHref);
  };

  return (
    <section aria-label="Створити">
      <div className="grid grid-cols-2 gap-2.5">
        {RADIAL_OPTIONS.map((opt) => {
          const { Icon } = opt;
          return (
            <button
              key={opt.id}
              type="button"
              data-testid={`quick-create-${opt.id}`}
              onClick={() => select(opt.id)}
              className="app-card flex items-center gap-3 px-3.5 py-3 text-left transition active:scale-[0.985]"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: opt.color }}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <span className="truncate text-[14px] font-semibold text-[color:var(--foreground)]">
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
