'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { resolveOverlays, textRuns, type Overlay } from '@/lib/reels/blocks';
import { overlayChipText, overlayStyle } from '@/lib/reels/overlayStyle';

/**
 * The note: ONE text field holding the whole reel.
 *
 * It was briefly one field per paragraph, on the theory that a paragraph is a
 * scene. That is true of the model and false of the writing: a selection could
 * not cross a paragraph, so «select this bit and shorten it» stopped at the
 * first blank line, and Enter did something clever instead of what Enter does.
 * A notes app is one page of text, so this is one textarea and a paragraph is
 * just a blank line inside it.
 *
 * The coloured underline is drawn by a second copy of the text sitting BEHIND
 * the textarea, aligned character for character. A contenteditable would render
 * the marks directly but fights the caret on every re-render and misbehaves
 * with the Ukrainian keyboard's composition; a real textarea keeps native
 * selection, native autocorrect and the OS's own selection handles.
 *
 * The two copies MUST agree on every metric that affects wrapping — font, size,
 * line height, letter spacing, padding, width — or the underline slides off the
 * word. They share one class string for exactly that reason.
 */

/** Everything that decides where a character lands. Shared, never duplicated. */
const TEXT_METRICS =
  'w-full whitespace-pre-wrap break-words text-[18px] leading-[1.62] tracking-[-0.006em] font-normal';

export type NoteEditorProps = {
  text: string;
  overlays: Overlay[];
  placeholder?: string;
  /**
   * Shown INSTEAD of `text`, greyed. Carries the provisional words while she is
   * still speaking, in the place the sentence will actually land.
   */
  previewText?: string | null;
  /** Locked while the note is being rewritten — see ReelTextScreen. */
  readOnly?: boolean;
  /**
   * The rewrite is running. The text renders as a div for the duration so the
   * gradient can be clipped to the WORDS — `background-clip: text` does nothing
   * on a textarea. It is read-only while this is true anyway.
   */
  rewriting?: boolean;
  /** Set the caret here once, after dictation or an undo. */
  caretAt?: number | null;
  onChange: (text: string) => void;
  onSelectionChange: (selection: { start: number; end: number } | null) => void;
  onCaretChange: (at: number) => void;
  onOpenOverlay: (overlayId: string) => void;
};

export default function NoteEditor({
  text,
  overlays,
  placeholder,
  previewText = null,
  readOnly = false,
  rewriting = false,
  caretAt = null,
  onChange,
  onSelectionChange,
  onCaretChange,
  onOpenOverlay,
}: NoteEditorProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const shown = previewText ?? text;
  const locked = readOnly || previewText !== null;

  // Grow to fit: the page scrolls, never a box inside it.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [shown]);

  useEffect(() => {
    if (caretAt === null) return;
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(caretAt, caretAt);
  }, [caretAt]);

  const report = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    onCaretChange(start);
    const hasPhrase = end > start && el.value.slice(start, end).trim().length > 0;
    onSelectionChange(hasPhrase ? { start, end } : null);
  }, [onCaretChange, onSelectionChange]);

  /**
   * On a phone a phrase is selected by long-pressing and dragging the handles,
   * which fires `selectionchange` on the document and none of the key or mouse
   * events the desktop path relies on. Without this the toolbar never changed
   * on the device the app is built for.
   */
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onSel = () => {
      if (document.activeElement === el) report();
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [report]);

  // Marks are hidden while a preview is showing: they belong to the saved text,
  // not to words that have not been committed yet.
  const marked = previewText === null ? overlays : [];
  const resolved = resolveOverlays(shown, marked);
  const runs = textRuns(shown, marked);
  const byId = new Map(resolved.map((o) => [o.id, o]));

  return (
    <div data-testid="note-editor">
      <div className="relative">
        {/* The mark layer. Its text is invisible; only the underlines show. */}
        <div
          aria-hidden
          className={`${TEXT_METRICS} pointer-events-none absolute inset-0 px-0 py-1 text-transparent`}
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
          {/* A trailing newline has no glyph, so the layer would come up a line
              short and the last underline would sit too high. */}
          {shown.endsWith('\n') ? '​' : null}
        </div>

        {rewriting ? (
          <p
            data-testid="note-rewriting"
            className={`${TEXT_METRICS} reel-text-sweep relative px-0 py-1`}
          >
            {shown}
          </p>
        ) : (
        <textarea
          ref={areaRef}
          value={shown}
          rows={1}
          readOnly={locked}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onSelect={report}
          onKeyUp={report}
          onMouseUp={report}
          onClick={report}
          // The global focus ring is right for buttons and wrong here: browsers
          // apply :focus-visible to a text field on TAP too, so the whole note
          // drew a box around itself and read as a form.
          className={`${TEXT_METRICS} relative resize-none overflow-hidden bg-transparent px-0 py-1 text-[color:var(--foreground)] placeholder-[color:var(--text-muted)] outline-none focus:outline-none focus-visible:outline-none`}
          // `outline` inline, because the global `textarea:focus-visible` rule
          // wins over any utility class: browsers fire :focus-visible on a text
          // field when you TAP it, so the whole note drew a blue box around
          // itself. No notes app does that; the caret is the focus indicator.
          style={{ outline: 'none', ...(previewText !== null ? { opacity: 0.55 } : {}) }}
        />
        )}
      </div>

      {/* What is attached, under the text. Each says which words it hangs off,
          because in one continuous note the underline alone does not say which
          chip belongs to which phrase. */}
      {resolved.length > 0 ? (
        <div className="mt-2 flex flex-col items-start gap-1.5">
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
                {o.anchorText.trim() ? (
                  <span className="shrink-0 font-normal opacity-70">
                    · «{o.anchorText.trim().slice(0, 24)}»
                  </span>
                ) : null}
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
    </div>
  );
}
