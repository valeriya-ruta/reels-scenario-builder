'use client';

import { useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, Pencil } from 'lucide-react';
import BackLink from '@/components/ui/BackLink';
import { displayTitle, type TitleKind } from '@/lib/content/displayTitle';

/**
 * The one top bar every content editor uses (§1).
 *
 * Reels, carousels and stories each had their own header: one showed
 * chevron+"Назад"+name, one a bare arrow, one no title at all (so a carousel
 * could not be renamed on a phone). This is the single shape:
 *
 *   [‹]  Title ✎            (optional trailing slot)
 *   [ meta row: status · date · source ]
 *
 * Back is a plain chevron with no label — the real back path on a phone is the
 * edge swipe, and the word only ate space next to the title. Repeated and
 * primary actions do NOT belong here; they live in the bottom thumb zone, so
 * `trailing` is for rare non-repeated affordances only.
 *
 * The title is inline-editable in place, with a pen affordance so it reads as
 * editable — no separate rename screen anywhere.
 */
export default function EditorTopBar({
  backHref,
  backLabel = 'Назад',
  title,
  onRename,
  meta,
  trailing,
  titleClassName = 'app-title',
  kind,
}: {
  backHref: string;
  backLabel?: string;
  title: string;
  /** Called with the trimmed new name; skipped when unchanged or empty. */
  onRename: (next: string) => void;
  /** Status / date / source chips, rendered on their own row underneath. */
  meta?: ReactNode;
  /** Rare, non-repeated action. Leave empty by default. */
  trailing?: ReactNode;
  titleClassName?: string;
  /** Drives the untitled fallback («Новий рілс» / «Нова карусель» / …), §1. */
  kind: TitleKind;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  // The draft is seeded when editing STARTS rather than synced from a prop in an
  // effect: an effect would either fight the user's typing or need a guard, and
  // there is exactly one moment the draft should come from the title.
  const startEditing = () => {
    setDraft(displayTitle(title, kind));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === title) {
      setDraft(title);
      return;
    }
    onRename(trimmed);
  };

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1">
        <BackLink fallbackHref={backHref} ariaLabel={backLabel} className="app-icon-btn shrink-0">
          <ChevronLeft className="h-5 w-5" />
        </BackLink>

        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(title);
                setEditing(false);
              }
            }}
            aria-label="Назва"
            data-testid="editor-title-input"
            className="min-w-0 flex-1 rounded-[10px] border border-[color:var(--border-strong)] bg-white px-2.5 py-1.5 text-[19px] font-bold tracking-tight text-[color:var(--foreground)] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            data-testid="editor-title"
            title="Перейменувати"
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[10px] px-1.5 py-1 text-left transition-colors hover:bg-[color:var(--surface1)]"
          >
            <span className={`${titleClassName} truncate`}>{displayTitle(title, kind)}</span>
            <Pencil
              className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-muted)]"
              strokeWidth={2}
              aria-hidden
            />
          </button>
        )}

        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>

      {meta ? (
        <div data-testid="editor-meta" className="mt-2 flex flex-wrap items-center gap-2 pl-1">
          {meta}
        </div>
      ) : null}
    </div>
  );
}
