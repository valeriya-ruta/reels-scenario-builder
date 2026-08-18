'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { resolveOverlays, textRuns, type ReelBlock } from '@/lib/reels/blocks';
import { overlayChipText, overlayStyle } from '@/lib/reels/overlayStyle';

/**
 * One paragraph of the script — which is to say one block.
 *
 * The underline under an attached phrase is drawn by a second copy of the text
 * sitting BEHIND a transparent textarea, aligned character for character. A
 * contenteditable would render the marks directly, but it also fights the
 * caret on every re-render and misbehaves with the Ukrainian keyboard's
 * composition; a real textarea keeps native editing, native selection and
 * native autocorrect, and the price is only that the highlight has to be drawn
 * behind it.
 *
 * The two copies MUST agree on every metric that affects wrapping — font, size,
 * line height, letter spacing, padding, width — or the underline drifts off the
 * word. They share one class string for exactly that reason; change it in one
 * place only.
 */

/** Everything that decides where a character lands. Shared, never duplicated. */
const TEXT_METRICS =
  'w-full whitespace-pre-wrap break-words text-[18px] leading-[1.62] tracking-[-0.006em] font-normal';

export type ParagraphRowProps = {
  block: ReelBlock;
  /** 1-based, shown only in «По сценах». */
  index: number;
  numbered: boolean;
  autoFocus?: boolean;
  /** Where to put the caret once focused — used after a split or a join. */
  caretAt?: number | null;
  placeholder?: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** The row the caret is in. Only that row shows its controls. */
  active: boolean;
  onChange: (spoken: string) => void;
  onSelectionChange: (selection: { start: number; end: number } | null) => void;
  /** Enter — cut here and start a new paragraph. */
  onSplit: (at: number) => void;
  /** Backspace at the very start — join back into the paragraph above. */
  onJoinUp: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onOpenOverlay: (overlayId: string) => void;
  onFocus: () => void;
};

export default function ParagraphRow({
  block,
  index,
  numbered,
  autoFocus = false,
  caretAt = null,
  placeholder,
  canMoveUp,
  canMoveDown,
  active,
  onChange,
  onSelectionChange,
  onSplit,
  onJoinUp,
  onMove,
  onDelete,
  onOpenOverlay,
  onFocus,
}: ParagraphRowProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const text = block.spoken ?? '';

  // Grow to fit: a scrollbar inside one paragraph of a script is never right,
  // the page is what scrolls.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    const at = caretAt ?? el.value.length;
    el.setSelectionRange(at, at);
  }, [autoFocus, caretAt]);

  const reportSelection = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value;
    const hasPhrase = end > start && value.slice(start, end).trim().length > 0;
    onSelectionChange(hasPhrase ? { start, end } : null);
  }, [onSelectionChange]);

  /**
   * On a phone a phrase is selected by long-pressing and dragging the handles,
   * which fires `selectionchange` on the document and none of the key or mouse
   * events the desktop path relies on. Without this the bar simply never came
   * up on the device the app is built for.
   */
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onSelectionChangeEvent = () => {
      if (document.activeElement === el) reportSelection();
    };
    document.addEventListener('selectionchange', onSelectionChangeEvent);
    return () => document.removeEventListener('selectionchange', onSelectionChangeEvent);
  }, [reportSelection]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    // Enter starts a new paragraph, the way a notes app does. Shift+Enter is
    // the escape hatch for a line break she wants kept inside this one.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSplit(el.selectionStart ?? 0);
      return;
    }
    // Backspace with the caret at the very start joins back upwards, so a
    // paragraph created by accident is undone by the same key that made it.
    if (
      e.key === 'Backspace' &&
      (el.selectionStart ?? 0) === 0 &&
      (el.selectionEnd ?? 0) === 0 &&
      canMoveUp
    ) {
      e.preventDefault();
      onJoinUp();
    }
  };

  // Attachments, positioned in the text as it reads NOW. A phrase that has
  // moved is found again; one that is gone still shows, unhighlighted, because
  // losing an editing instruction silently is worse than showing a stale one.
  const resolved = resolveOverlays(text, block.overlays);
  const runs = textRuns(text, block.overlays);
  const byId = new Map(resolved.map((o) => [o.id, o]));

  return (
    <div className="group relative" data-testid="paragraph-row" data-block-id={block.id}>
      <div className="flex items-start gap-2">
        {numbered ? (
          <span
            aria-hidden
            className="mt-[9px] inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-[color:var(--accent)] text-[11px] font-bold tabular-nums text-white"
          >
            {index}
          </span>
        ) : null}

        <div className="relative min-w-0 flex-1">
          {/* The mark layer. Its text is invisible; only the underlines show. */}
          <div
            aria-hidden
            className={`${TEXT_METRICS} pointer-events-none absolute inset-0 px-0 py-1.5 text-transparent`}
          >
            {runs.map((run, i) => {
              const overlay = run.overlayIds[0] ? byId.get(run.overlayIds[0]) : null;
              if (!overlay) return <span key={i}>{run.text}</span>;
              const style = overlayStyle(overlay.kind);
              return (
                <span
                  key={i}
                  style={{
                    borderBottom: `2px solid ${style.color}`,
                    backgroundColor: style.wash,
                    borderRadius: 2,
                  }}
                >
                  {run.text}
                </span>
              );
            })}
            {/* A trailing newline has no glyph, so the layer would come up one
                line short and the last underline would sit too high. */}
            {text.endsWith('\n') ? '​' : null}
          </div>

          <textarea
            ref={areaRef}
            value={text}
            rows={1}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onSelect={reportSelection}
            onKeyUp={reportSelection}
            onMouseUp={reportSelection}
            onFocus={onFocus}
            // The global focus ring is right for buttons and form fields and
            // wrong here: browsers apply :focus-visible to a text field on TAP
            // too, so every paragraph she touched drew a box around itself and
            // the page read as a stack of inputs. The caret is the focus
            // indicator in a document editor — same as Notes, same as Notion.
            className={`${TEXT_METRICS} relative resize-none overflow-hidden bg-transparent px-0 py-1.5 text-[color:var(--foreground)] placeholder-[color:var(--text-muted)] outline-none focus:outline-none focus-visible:outline-none`}
          />
        </div>
      </div>

      {/* Attachments sit on the line directly below, indented — never in a side
          margin. A phone has no margin to put them in. */}
      {resolved.length > 0 ? (
        <div className="ml-3 flex flex-col items-start gap-1.5 border-l-2 border-[color:var(--border)] pl-3 pb-1">
          {resolved.map((o) => {
            const style = overlayStyle(o.kind);
            return (
              <button
                key={o.id}
                type="button"
                data-testid="overlay-chip"
                onClick={() => onOpenOverlay(o.id)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-left text-[12px] font-semibold leading-tight"
                style={{ color: style.color, backgroundColor: style.wash }}
              >
                <span aria-hidden>{style.glyph}</span>
                <span className="truncate">{overlayChipText(o.kind, o.note, o.url)}</span>
                {o.detached ? (
                  <span
                    className="shrink-0 opacity-70"
                    title="Фрази більше немає в тексті"
                    aria-label="Фрази більше немає в тексті"
                  >
                    ⚠
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Reordering and deleting live on the row itself — drag is never the
          only way to move something, and with the keyboard up a drag is a
          fight. Shown only on the row she is IN: three 44pt targets under every
          paragraph pushed the script itself off the screen. */}
      {numbered && active ? (
        <div className="mt-1 flex items-center gap-1 pl-8">
          <RowButton label="Вище" disabled={!canMoveUp} onClick={() => onMove(-1)}>
            <ChevronUp className="h-4 w-4" />
          </RowButton>
          <RowButton label="Нижче" disabled={!canMoveDown} onClick={() => onMove(1)}>
            <ChevronDown className="h-4 w-4" />
          </RowButton>
          <RowButton label="Видалити сцену" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </RowButton>
        </div>
      ) : null}
    </div>
  );
}

function RowButton({
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
      // 44pt targets: this is a phone, and these sit next to each other.
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface1)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
