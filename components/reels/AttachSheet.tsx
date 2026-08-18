'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import type { Overlay, OverlayKind } from '@/lib/reels/blocks';
import { OFFERED_OVERLAY_KINDS, overlayStyle } from '@/lib/reels/overlayStyle';
import { imagesFromClipboard, uploadPastedImage } from '@/lib/reels/pasteImage';
import { isPlayable, resolveReference } from '@/lib/reels/referenceLink';

/**
 * One attachment, one screen: what it is, one line about it, and the picture or
 * link — then Готово.
 *
 * It names the phrase it hangs off («На словах …») because by the time the
 * sheet is open the text is behind it, and an instruction whose cue you can't
 * see is one you can't check.
 *
 * Import is PASTE, not a file picker. The screenshot she wants is already on
 * the clipboard; a picker means saving it, finding it and choosing it, which is
 * enough friction that the reference never gets attached at all.
 */
export default function AttachSheet({
  open,
  overlay,
  reelId,
  onClose,
  onChange,
  onDelete,
}: {
  open: boolean;
  overlay: Overlay | null;
  reelId: string;
  onClose: () => void;
  onChange: (patch: Partial<Overlay>) => void;
  onDelete: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  // An upload failure belongs to the attachment it happened on; moving to
  // another one must not carry the message across. Adjusted during render
  // rather than in an effect, which would show it for a frame first.
  const [shownId, setShownId] = useState(overlay?.id ?? null);
  if ((overlay?.id ?? null) !== shownId) {
    setShownId(overlay?.id ?? null);
    setError(null);
  }

  useEffect(() => {
    if (!open) return;
    // The description is the point of the sheet, so the caret starts there.
    const t = window.setTimeout(() => noteRef.current?.focus(), 260);
    return () => window.clearTimeout(t);
  }, [open, overlay?.id]);

  if (!overlay) return null;

  const handlePaste = async (e: React.ClipboardEvent) => {
    const images = imagesFromClipboard(e.clipboardData);
    if (images.length === 0) return; // a plain text paste is a link; let it land
    e.preventDefault();
    setError(null);
    setUploading(true);
    const result = await uploadPastedImage(images[0], reelId);
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChange({ url: result.url });
  };

  const reference = resolveReference(overlay.url);

  return (
    <BottomSheet open={open} onClose={onClose} title={overlayStyle(overlay.kind).label}>
      <div className="flex flex-col gap-3">
        {overlay.anchorText.trim() ? (
          <p className="text-[12px] leading-snug text-[color:var(--text-muted)]">
            На словах «{overlay.anchorText.trim()}»
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {OFFERED_OVERLAY_KINDS.map((kind) => {
            const style = overlayStyle(kind);
            const active = overlay.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                data-testid="attach-kind"
                data-active={active ? 'true' : 'false'}
                onClick={() => onChange({ kind: kind as OverlayKind })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-opacity"
                style={{
                  color: style.color,
                  backgroundColor: style.wash,
                  opacity: active ? 1 : 0.42,
                }}
              >
                <span aria-hidden>{style.glyph}</span>
                {style.label}
              </button>
            );
          })}
        </div>

        <input
          ref={noteRef}
          value={overlay.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="Що саме тут зʼявляється"
          className="min-h-11 w-full rounded-[12px] border border-[color:var(--border)] bg-[color:var(--background)] px-3.5 py-2.5 text-[15px] text-[color:var(--foreground)] placeholder-[color:var(--text-muted)] outline-none focus:border-[color:var(--accent)]"
        />

        <input
          value={overlay.url ?? ''}
          onChange={(e) => onChange({ url: e.target.value })}
          onPaste={handlePaste}
          inputMode="url"
          placeholder={uploading ? 'Завантажую…' : 'Встав картинку або посилання'}
          className="min-h-11 w-full rounded-[12px] border border-[color:var(--border)] bg-[color:var(--background)] px-3.5 py-2.5 text-[15px] text-[color:var(--foreground)] placeholder-[color:var(--text-muted)] outline-none focus:border-[color:var(--accent)]"
        />

        {/* Shown, not linked: opening a tab to check a reference means losing
            the script you were checking it against. */}
        {isPlayable(reference) && reference ? (
          reference.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reference.embedUrl ?? reference.url}
              alt=""
              className="max-h-52 w-full rounded-[12px] object-cover"
            />
          ) : (
            <div className="aspect-[9/16] max-h-64 w-full overflow-hidden rounded-[12px] bg-black/5">
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

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-[12px] bg-[color:var(--accent)] px-4 text-[15px] font-semibold text-white"
          >
            Готово
          </button>
          <button
            type="button"
            aria-label="Видалити"
            onClick={onDelete}
            className="inline-flex h-11 w-12 items-center justify-center rounded-[12px] border border-[color:var(--border)] text-[color:var(--text-muted)]"
          >
            <Trash2 className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
