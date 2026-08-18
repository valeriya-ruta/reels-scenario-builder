'use client';

import { useState } from 'react';
import { ImagePlus, Link2, Plus, X } from 'lucide-react';
import ReferenceMedia from '@/components/reels/ReferenceMedia';
import { imagesFromClipboard, uploadPastedImage } from '@/lib/reels/pasteImage';
import type { RefImage } from '@/lib/reels/blocks';

/**
 * References for the whole reel — the one it is modelled on, the mood, the two
 * screenshots of how it should feel.
 *
 * Block-level references answer «отак має виглядати оцей кадр». These answer
 * «отак має виглядати рілс», which has no block to hang off and belongs with
 * the brief: together they are the first thing the person editing reads.
 *
 * Two ways in, both cheap: paste a link, or paste a picture. Nothing is a file
 * upload, because saving an image and finding it again is enough friction that
 * the reference never gets attached.
 */

function newId(): string {
  return `ref_${Math.random().toString(36).slice(2, 10)}`;
}

export default function ReelReferences({
  reelId,
  references,
  onChange,
}: {
  reelId: string;
  references: RefImage[];
  onChange: (next: RefImage[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLink = () => {
    const url = draft.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setError('Посилання має починатися з https://');
      return;
    }
    setError(null);
    setDraft('');
    onChange([...references, { id: newId(), url }]);
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = imagesFromClipboard(e.clipboardData);
    if (files.length === 0) return; // a pasted link is just text in the field
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const added: RefImage[] = [];
      for (const file of files) {
        const res = await uploadPastedImage(file, reelId);
        if (!res.ok) {
          setError(res.error);
          break;
        }
        added.push({ id: newId(), url: res.url });
      }
      if (added.length > 0) onChange([...references, ...added]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4" onPaste={(e) => void onPaste(e)} data-testid="reel-references">
      <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
        Референси на весь рілс
      </p>

      <div className="flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-muted)]" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addLink();
            }
          }}
          placeholder="Встав посилання (Reels, TikTok, YouTube) або просто картинку — Ctrl+V"
          data-testid="reel-reference-input"
          className="min-w-0 flex-1 rounded-[10px] border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-[13px] outline-none transition-colors focus:border-[color:var(--border-strong)]"
        />
        <button
          type="button"
          onClick={addLink}
          disabled={!draft.trim()}
          aria-label="Додати референс"
          className="app-icon-btn shrink-0 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" strokeWidth={2.4} />
        </button>
      </div>

      {busy && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[color:var(--text-muted)]">
          <ImagePlus className="h-3.5 w-3.5" />
          Завантажую…
        </p>
      )}
      {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}

      {references.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {references.map((r) => (
            <div
              key={r.id}
              data-testid="reel-reference"
              className="relative rounded-[12px] border border-[color:var(--border)] bg-[color:var(--background)] p-2.5"
            >
              <button
                type="button"
                onClick={() => onChange(references.filter((x) => x.id !== r.id))}
                aria-label="Прибрати референс"
                className="absolute right-1.5 top-1.5 z-10 cursor-pointer rounded-full bg-white/90 p-1 text-zinc-400 hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.4} />
              </button>
              <ReferenceMedia url={r.url} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
