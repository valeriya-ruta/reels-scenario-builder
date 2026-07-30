'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { RADIAL_OPTIONS, type RadialOptionId } from '@/components/CreateRadialMenu';
import { CONTENT_TYPES } from '@/lib/contentTypes';
import { OPEN_BRAINDUMP_FRESH_EVENT } from '@/lib/content/braindumpIdeaEvent';

/**
 * "＋ Створити" control for the План calendar detail panel (task 86d3d23nj
 * follow-up). Opens the same four create options as the FAB radial menu
 * (Ідея → braindump, Рілс / Карусель / Сторіс → their create flow). Shown both
 * when a day has content and when it's empty, so a date is always a jumping-off
 * point to make something.
 */
export default function PlanCreateMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const select = (id: RadialOptionId) => {
    setOpen(false);
    if (id === 'ideas') {
      // BottomNav (mounted on /plan) owns the braindump overlay and listens for this.
      window.dispatchEvent(new CustomEvent(OPEN_BRAINDUMP_FRESH_EVENT));
      return;
    }
    router.push(CONTENT_TYPES[id].createHref);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        data-testid="plan-create"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface2)] px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
      >
        <Plus className="h-4 w-4" />
        Створити
      </button>

      {open && (
        <>
          {/* Click-away backdrop. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            data-testid="plan-create-menu"
            className="absolute left-0 z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] p-1 shadow-lg"
          >
            {RADIAL_OPTIONS.map((opt) => {
              const { Icon } = opt;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitem"
                  data-testid={`plan-create-${opt.id}`}
                  onClick={() => select(opt.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: opt.color }}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
