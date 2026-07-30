'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import { RADIAL_OPTIONS, type RadialOptionId } from '@/components/CreateRadialMenu';
import { CONTENT_TYPES } from '@/lib/contentTypes';
import { OPEN_BRAINDUMP_FRESH_EVENT } from '@/lib/content/braindumpIdeaEvent';

/**
 * "＋ Створити" for the План calendar detail panel (task 86d3d23nj). Opens a
 * bottom sheet with the same four create options as the FAB (Ідея → braindump,
 * Рілс / Карусель / Сторіс → their create flow), matching the app-wide sheet
 * language. Shown on any selected day, full or empty.
 */
export default function PlanCreateMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const select = (id: RadialOptionId) => {
    setOpen(false);
    if (id === 'ideas') {
      window.dispatchEvent(new CustomEvent(OPEN_BRAINDUMP_FRESH_EVENT));
      return;
    }
    router.push(CONTENT_TYPES[id].createHref);
  };

  return (
    <>
      <button
        type="button"
        data-testid="plan-create"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface2)] px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
      >
        <Plus className="h-4 w-4" />
        Створити
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Створити">
        <div className="flex flex-col">
          {RADIAL_OPTIONS.map((opt) => {
            const { Icon } = opt;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`plan-create-${opt.id}`}
                onClick={() => select(opt.id)}
                className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-zinc-100"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: opt.color }}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <span className="text-[15px] font-medium text-[color:var(--foreground)]">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
