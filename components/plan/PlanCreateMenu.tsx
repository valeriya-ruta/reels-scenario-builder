'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import CenterModal from '@/components/ui/CenterModal';
import MaterialIcon from '@/components/ui/MaterialIcon';
import { RADIAL_OPTIONS, type RadialOptionId } from '@/components/CreateRadialMenu';
import { CONTENT_TYPES } from '@/lib/contentTypes';
import { OPEN_BRAINDUMP_FRESH_EVENT } from '@/lib/content/braindumpIdeaEvent';

/**
 * "＋ Створити" for the План calendar detail panel (task 86d3d23nj). Opens a
 * bottom sheet with the same four create options as the FAB (Ідея → braindump,
 * Рілс / Карусель / Сторіс → their create flow), matching the app-wide sheet
 * language. Shown on any selected day, full or empty.
 *
 * The menu does not decide what "create" MEANS. On a calendar with a day
 * selected it should make the thing on that day and open it right there, which
 * only the calendar can do — so it hands the choice up through `onSelect` and
 * keeps its own navigation as the fallback for callers with no day in hand.
 */
export default function PlanCreateMenu({
  onSelect,
}: {
  onSelect?: (id: RadialOptionId) => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const select = (id: RadialOptionId) => {
    setOpen(false);
    if (onSelect) {
      onSelect(id);
      return;
    }
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

      <CenterModal open={open} onClose={() => setOpen(false)} title="Створити">
        <div className="flex flex-col">
          {RADIAL_OPTIONS.map((opt) => {
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`plan-create-${opt.id}`}
                onClick={() => select(opt.id)}
                className="flex min-h-[52px] items-center gap-3 rounded-[14px] px-3 text-left transition-colors hover:bg-[color:var(--surface1)]"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: opt.color }}
                >
                  <MaterialIcon name={opt.icon} size={18} />
                </span>
                <span className="text-[15px] font-medium text-[color:var(--foreground)]">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </CenterModal>
    </>
  );
}
