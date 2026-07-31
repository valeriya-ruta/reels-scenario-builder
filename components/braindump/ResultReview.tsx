'use client';

import { useState } from 'react';
import { CalendarDays, ArrowRight } from 'lucide-react';
import DateSheet from '@/components/content/DateSheet';
import ContentTypeIcon from '@/components/ContentTypeIcon';
import ProposalActions from '@/components/propose/ProposalActions';
import { dayHeaderLabel } from '@/lib/content/calendar';
import { setContentScheduledDate } from '@/app/content-actions';
import { CONTENT_TYPES, type ContentType } from '@/lib/contentTypes';
import type { ContentPiece } from '@/lib/content/contentPiece';

/** What a single generated piece looks like in the in-place review. */
export type ResultPreview = {
  type: Exclude<ContentType, 'stories'>;
  id: string;
  name: string;
  /** The piece's own opening words — the hook, or the cover title. */
  lead: string;
  /** Second line of the preview (carousel cover body), when there is one. */
  sub?: string;
  /** "5 сцен" / "8 слайдів". */
  countLabel: string;
  /** One line of Ruta's thinking about this result. */
  rationale: string;
  scheduledDate: string | null;
};

const REF_TABLE: Record<ResultPreview['type'], ContentPiece['refTable']> = {
  reels: 'projects',
  carousel: 'carousel_projects',
};

/**
 * A single generated piece, reviewed IN PLACE with the app's three verbs.
 *
 * Nothing arrives final: the user keeps it, re-proposes it, or tweaks the
 * thought behind it — without having to know what to type next. The preview
 * shows the piece's own words in real type so the decision is made on the
 * content, not on a filename.
 */
export default function ResultReview({
  preview,
  onKeep,
  onRegenerate,
  onTweak,
  regenerating,
}: {
  preview: ResultPreview;
  onKeep: () => void;
  onRegenerate: () => void;
  onTweak: () => void;
  regenerating?: boolean;
}) {
  const [date, setDate] = useState<string | null>(preview.scheduledDate);
  const [pickerOpen, setPickerOpen] = useState(false);
  const meta = CONTENT_TYPES[preview.type];

  const schedule = (next: string | null) => {
    setDate(next);
    void setContentScheduledDate(REF_TABLE[preview.type], preview.id, next);
  };

  return (
    <div data-testid="result-review">
      <div
        className="rounded-[16px] border border-[color:var(--border)] bg-white/90 p-3.5"
        style={{ boxShadow: 'var(--elev-1)' }}
      >
        <div className="flex items-center gap-2">
          <ContentTypeIcon type={preview.type} size={16} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight text-[color:var(--foreground)]">
            {preview.name || meta.label}
          </span>
        </div>

        {preview.lead ? (
          <p className="mt-2 line-clamp-3 text-[16px] font-semibold leading-snug tracking-tight text-[color:var(--foreground)]">
            {preview.lead}
          </p>
        ) : null}
        {preview.sub ? (
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[color:var(--text-secondary)]">
            {preview.sub}
          </p>
        ) : null}

        <p className="mt-1.5 text-[11.5px] text-[color:var(--text-muted)]">{preview.countLabel}</p>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            data-testid="result-date"
            className="app-pill flex-1 justify-center py-2 text-[12.5px]"
          >
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
            {date ? dayHeaderLabel(date) : 'Поставити дату'}
          </button>
          <a
            href={meta.itemHref(preview.id)}
            data-testid="result-open"
            className="app-icon-btn"
            aria-label="Відкрити"
            title="Відкрити"
          >
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </a>
        </div>
      </div>

      <div className="mt-3">
        <ProposalActions
          rationale={preview.rationale}
          onKeep={onKeep}
          onRegenerate={onRegenerate}
          onTweak={onTweak}
          regenerating={regenerating}
        />
      </div>

      <DateSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={date}
        onPick={schedule}
      />
    </div>
  );
}
