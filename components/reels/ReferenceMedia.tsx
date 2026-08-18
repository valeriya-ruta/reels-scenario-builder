'use client';

import { useState } from 'react';
import { ExternalLink, Link2, Play, X } from 'lucide-react';
import { REFERENCE_LABELS, resolveReference } from '@/lib/reels/referenceLink';

/**
 * A reference, shown rather than linked.
 *
 * «Референс» as a blue word means opening a tab, losing the page, coming back.
 * A reel reference is nearly always a video meant to be watched NEXT to the
 * shot list, so anything playable plays here.
 *
 * The player is not mounted until it is asked for: a reel with six references
 * would otherwise load six third-party iframes on open, which is slow and hands
 * three companies a page view nobody wanted.
 */

export default function ReferenceMedia({
  url,
  compact = false,
}: {
  url: string | null | undefined;
  /** Inline in a list row, rather than as its own block. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = resolveReference(url);
  if (!ref) return null;

  const label = REFERENCE_LABELS[ref.kind];

  // A picture needs no player: it IS the thumbnail, and clicking opens it full
  // size where the details are actually visible.
  if (ref.kind === 'image') {
    return (
      <a
        href={ref.url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="reference-image"
        className="mt-1.5 inline-block overflow-hidden rounded-[10px] border border-[color:var(--border)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ref.url}
          alt="Референс"
          loading="lazy"
          className={compact ? 'max-h-24 w-auto object-cover' : 'max-h-48 w-auto object-cover'}
        />
      </a>
    );
  }

  if (ref.kind === 'video') {
    return (
      <video
        src={ref.url}
        controls
        preload="metadata"
        data-testid="reference-video"
        className={`mt-1.5 w-full rounded-[10px] bg-black ${compact ? 'max-h-56' : 'max-h-80'}`}
      />
    );
  }

  if (!ref.embedUrl) {
    return (
      <a
        href={ref.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--accent)] hover:underline"
      >
        <Link2 className="h-3.5 w-3.5" />
        Референс
      </a>
    );
  }

  return (
    <div className="mt-1.5">
      {open ? (
        <div className="relative overflow-hidden rounded-[12px] border border-[color:var(--border)] bg-black">
          <iframe
            src={ref.embedUrl}
            title={label}
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            data-testid="reference-embed"
            className={`w-full ${compact ? 'h-[420px]' : 'h-[560px]'}`}
            style={{ border: 0 }}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Згорнути"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
          >
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid="reference-play"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[12.5px] font-semibold text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--surface1)]"
          >
            <Play className="h-3.5 w-3.5" strokeWidth={2.4} />
            Переглянути {label}
          </button>
          <a
            href={ref.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Відкрити в новій вкладці"
            className="text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--foreground)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
