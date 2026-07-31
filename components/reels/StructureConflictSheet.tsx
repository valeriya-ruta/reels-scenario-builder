'use client';

import { RefreshCw, Copy } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';

/**
 * Re-selecting a structure on a reel that already has writing (§4, 86d3wadne).
 *
 * The old behaviour appended, silently doubling the scenario. Silently replacing
 * instead would be worse — it would delete work without asking. So when there is
 * something to lose, the user picks:
 *
 *   • Замінити — rewrite THIS reel with the new structure
 *   • Створити новий — spin the structure off into a second reel, leave this one
 *
 * Rises from the bottom (thumb zone, §1), never a hard centre modal.
 */
export default function StructureConflictSheet({
  open,
  structureName,
  busy,
  onClose,
  onReplace,
  onSpinOff,
}: {
  open: boolean;
  structureName: string;
  busy?: boolean;
  onClose: () => void;
  onReplace: () => void;
  onSpinOff: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="У цьому рілсі вже є текст">
      <p className="px-1 pb-4 text-[13.5px] leading-relaxed text-[color:var(--text-secondary)]">
        Структура «{structureName}» замінить сцени, які ти вже написала. Або можна лишити цей
        рілс як є і зробити з неї окремий.
      </p>

      <div className="flex flex-col gap-2 pb-2">
        <button
          type="button"
          onClick={onSpinOff}
          disabled={busy}
          data-testid="structure-spinoff"
          className="app-btn-primary w-full"
        >
          <Copy className="h-4 w-4" strokeWidth={2.2} />
          Створити новий рілс
        </button>
        <button
          type="button"
          onClick={onReplace}
          disabled={busy}
          data-testid="structure-replace"
          className="app-pill w-full justify-center py-3"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={2} />
          Замінити і переписати цей
        </button>
      </div>
    </BottomSheet>
  );
}
