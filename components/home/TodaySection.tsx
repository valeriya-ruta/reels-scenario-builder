'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import CenterModal from '@/components/ui/CenterModal';
import MaterialIcon from '@/components/ui/MaterialIcon';
import ContentRows from '@/components/content/ContentRows';
import ProposingEmptyState from '@/components/propose/ProposingEmptyState';
import { RADIAL_OPTIONS, type RadialOptionId } from '@/components/CreateRadialMenu';
import { createContentOnDate } from '@/app/content-actions';
import { OPEN_BRAINDUMP_FRESH_EVENT } from '@/lib/content/braindumpIdeaEvent';
import type { ContentPiece } from '@/lib/content/contentPiece';

/** Radial menu ids → the content types the create action understands. */
const TYPE_FOR: Record<Exclude<RadialOptionId, 'ideas' | 'repurpose'>, 'reel' | 'carousel' | 'story'> = {
  reels: 'reel',
  carousel: 'carousel',
  stories: 'story',
};

/**
 * Everything in THIS menu lands on today — that is the whole point of the «＋».
 * Переробити can't keep that promise (it produces a piece from a pasted post,
 * dated in its own review), so it is deliberately not offered here. It lives in
 * the FAB / sidebar create menus, which make no date promise.
 */
const TODAY_OPTIONS = RADIAL_OPTIONS.filter((opt) => opt.id !== 'repurpose');

/**
 * СЬОГОДНІ — the top of the urgency stack (Prompt 7).
 *
 * Today's content as the real editorial cards, so a piece looks and behaves
 * identically here and in Весь контент. The «＋» is scoped to the section: it
 * doesn't just create, it creates ON TODAY — a piece that landed undated would
 * fall straight through into Розбір, which is the opposite of what the user
 * asked for by tapping «＋» on today.
 *
 * Empty means PROPOSING, never «нічого немає»: an empty today is the moment the
 * assistant is most useful.
 */
export default function TodaySection({
  pieces,
  todayKey,
}: {
  pieces: ContentPiece[];
  /** YYYY-MM-DD the new piece is scheduled onto. */
  todayKey: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<RadialOptionId | null>(null);

  const pick = async (id: RadialOptionId) => {
    if (busy) return;
    if (id === 'ideas') {
      // An idea is a source, not a scheduled piece — it has no day to land on.
      setOpen(false);
      window.dispatchEvent(new CustomEvent(OPEN_BRAINDUMP_FRESH_EVENT));
      return;
    }
    if (id === 'repurpose') return; // not offered here — see TODAY_OPTIONS
    setBusy(id);
    const res = await createContentOnDate(TYPE_FOR[id], todayKey);
    setBusy(null);
    if (!res.ok) return;
    setOpen(false);
    router.push(res.href);
  };

  return (
    <section className="space-y-2.5" aria-labelledby="today-heading">
      <div className="flex items-center justify-between px-0.5">
        <h2 id="today-heading" className="app-section-label">
          Сьогодні
        </h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="today-add"
          aria-label="Додати контент на сьогодні"
          className="flex h-7 w-7 items-center justify-center rounded-full text-white transition active:scale-95"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.6} />
        </button>
      </div>

      {pieces.length === 0 ? (
        <div data-testid="today-empty">
          <ProposingEmptyState
            headline="Зробимо щось на сьогодні"
            sub="Ще нічого не заплановано — ось із чого я б почала."
            limit={2}
          />
        </div>
      ) : (
        <div data-testid="today-list">
          <ContentRows pieces={pieces} />
        </div>
      )}

      <CenterModal open={open} onClose={() => setOpen(false)} title="Додати на сьогодні">
        <div className="flex flex-col">
          {TODAY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={busy !== null}
              onClick={() => void pick(opt.id)}
              data-testid={`today-add-${opt.id}`}
              className="flex min-h-[52px] items-center gap-3 rounded-[14px] px-3 text-left transition-colors hover:bg-[color:var(--surface1)] disabled:opacity-50"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: opt.color }}
              >
                <MaterialIcon name={opt.icon} size={18} />
              </span>
              <span className="text-[15px] font-medium text-[color:var(--foreground)]">
                {busy === opt.id ? 'Створюю…' : opt.label}
              </span>
            </button>
          ))}
        </div>
      </CenterModal>
    </section>
  );
}
