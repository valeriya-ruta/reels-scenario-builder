'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { Clip, ReelBlock } from '@/lib/reels/blocks';
import { imagesFromClipboard, uploadPastedImage } from '@/lib/reels/pasteImage';
import { isPlayable, resolveReference } from '@/lib/reels/referenceLink';

/**
 * A shot with no words — one video (or photo), and what is written over it.
 *
 * A whole reel of these is a trend reel: a handful of clips, a caption on each,
 * a trending sound, nobody speaking. That is a real and common shape, not an
 * edge case, so it gets a real surface instead of being squeezed into a
 * textarea meant for speech — typing into that would have turned the card into
 * a talking block.
 *
 * Two fields and a paste. The paste is the import: the meme she wants is
 * already on the clipboard, or it is a link she copied from Reels, and a file
 * picker is three screens she will not walk through.
 */
export default function ClipCard({
  block,
  index,
  reelId,
  canMoveUp,
  canMoveDown,
  onChangeClip,
  onMove,
  onDelete,
}: {
  block: ReelBlock;
  index: number;
  reelId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChangeClip: (patch: Partial<Clip>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clip: Clip = block.clips[0] ?? { id: `${block.id}:0`, what: '' };
  const reference = resolveReference(clip.image || clip.url);

  const handlePaste = async (e: React.ClipboardEvent) => {
    const images = imagesFromClipboard(e.clipboardData);
    if (images.length === 0) return; // plain text is a link — let it land
    e.preventDefault();
    setError(null);
    setUploading(true);
    const result = await uploadPastedImage(images[0], reelId);
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeClip({ image: result.url });
  };

  return (
    <div
      data-testid="clip-card"
      data-block-id={block.id}
      className="rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] p-3"
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-1.5 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-[#0F8A6A] text-[11px] font-bold tabular-nums text-white"
        >
          {index}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            value={clip.what}
            onChange={(e) => onChangeClip({ what: e.target.value })}
            placeholder="Що на відео"
            className="min-h-11 w-full bg-transparent text-[17px] text-[color:var(--foreground)] placeholder-[color:var(--text-muted)] outline-none"
          />
          <input
            value={clip.screenText ?? ''}
            onChange={(e) => onChangeClip({ screenText: e.target.value })}
            placeholder="Напис на екрані"
            className="min-h-11 w-full rounded-[10px] bg-[color:var(--surface1)] px-3 text-[15px] text-[color:var(--foreground)] placeholder-[color:var(--text-muted)] outline-none"
          />
          <input
            value={clip.url ?? ''}
            onChange={(e) => onChangeClip({ url: e.target.value })}
            onPaste={handlePaste}
            inputMode="url"
            placeholder={uploading ? 'Завантажую…' : 'Встав посилання або картинку'}
            className="min-h-11 w-full rounded-[10px] bg-[color:var(--surface1)] px-3 text-[14px] text-[color:var(--foreground)] placeholder-[color:var(--text-muted)] outline-none"
          />

          {isPlayable(reference) && reference ? (
            reference.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={reference.embedUrl ?? reference.url}
                alt=""
                className="max-h-44 w-full rounded-[10px] object-cover"
              />
            ) : (
              <div className="aspect-[9/16] max-h-56 w-full overflow-hidden rounded-[10px] bg-black/5">
                <iframe
                  src={reference.embedUrl ?? ''}
                  title="Референс"
                  className="h-full w-full"
                  allow="autoplay; encrypted-media; picture-in-picture"
                />
              </div>
            )
          ) : null}

          {error ? (
            <p role="alert" className="text-[13px] text-red-600">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-1">
            <CardButton label="Вище" disabled={!canMoveUp} onClick={() => onMove(-1)}>
              <ChevronUp className="h-4 w-4" />
            </CardButton>
            <CardButton label="Нижче" disabled={!canMoveDown} onClick={() => onMove(1)}>
              <ChevronDown className="h-4 w-4" />
            </CardButton>
            <CardButton label="Видалити кадр" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </CardButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface1)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
