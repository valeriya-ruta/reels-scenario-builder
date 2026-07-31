'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { getIdeaForContent, type IdeaSource } from '@/app/ideas-actions';
import { dispatchOpenBraindumpIdea } from '@/lib/content/braindumpIdeaEvent';

/**
 * Trace-back: the dump a piece came from, named and tappable.
 *
 * The link runs both ways by design — from a dump you see its fan-out, from any
 * piece you get back to the thought that produced it (with everything else that
 * came out of it). Without this the dump would be consumed on generation, which
 * is exactly what stops ideas compounding.
 *
 * Renders nothing when the piece has no recorded source, so it can be dropped
 * into every editor header unconditionally.
 */
export default function SourceDumpChip({ contentId }: { contentId: string }) {
  const [source, setSource] = useState<IdeaSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getIdeaForContent(contentId).then((s) => {
      if (!cancelled) setSource(s);
    });
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  if (!source) return null;

  return (
    <button
      type="button"
      data-testid="source-dump-chip"
      data-proven={source.proven ? 'true' : 'false'}
      onClick={() => dispatchOpenBraindumpIdea(source.id, source.text)}
      title={source.proven ? 'З цього дампу вже вийшло опубліковане' : 'Відкрити дамп'}
      className="app-pill max-w-full py-1.5 text-[12px]"
    >
      <Sparkles
        className="h-3.5 w-3.5 shrink-0"
        strokeWidth={2}
        style={{ color: source.proven ? 'var(--success)' : 'var(--text-muted)' }}
      />
      <span className="truncate">З дампу «{source.title}»</span>
    </button>
  );
}
