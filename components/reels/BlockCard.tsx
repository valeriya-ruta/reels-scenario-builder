'use client';

import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Link2, Plus, Trash2, X } from 'lucide-react';
import {
  ASSET_KINDS,
  ASSET_LABELS,
  AUDIO_HINTS,
  AUDIO_LABELS,
  AUDIO_SOURCES,
  BLOCK_COLORS,
  BLOCK_KINDS,
  BLOCK_LABELS,
  OVERLAY_KINDS,
  OVERLAY_LABELS,
  effectiveAudio,
  resolveOverlays,
  textRuns,
  type AssetKind,
  type AudioSource,
  type BlockKind,
  type Overlay,
  type OverlayKind,
  type ReelBlock,
} from '@/lib/reels/blocks';

/**
 * One block of a reel, desktop-first: the writing on the left, its add-ons in
 * the margin on the right — the shape of a comment in a Google Doc, because
 * that is exactly the gesture. Select the words, attach the thing.
 *
 * The highlight under an anchored phrase is a mirrored div sitting behind a
 * transparent textarea, sharing its metrics. A textarea cannot render spans and
 * a contentEditable would mean owning caret handling, undo and paste sanitising
 * for the sake of one underline — the mirror keeps native typing intact.
 */

const FIELD =
  'w-full rounded-[10px] border border-[color:var(--border)] bg-white px-3 py-2 text-[14px] text-[color:var(--foreground)] outline-none transition-colors focus:border-[color:var(--border-strong)]';

/**
 * Shared metrics. The mirror and the textarea must wrap at exactly the same
 * points, so every property that affects line breaking is set on both — font,
 * size, line-height, tracking, padding AND border width (the border shifts the
 * text box, so a mirror without one sits a pixel out).
 */
const TEXT_METRICS =
  'whitespace-pre-wrap break-words font-sans text-[15px] leading-[1.6] tracking-normal px-3 py-2 border';

function Select<T extends string>({
  value,
  options,
  labels,
  onChange,
  placeholder,
}: {
  value: T | null;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value as T)}
      className="cursor-pointer rounded-[8px] border border-[color:var(--border)] bg-white px-2 py-1 text-[12.5px] font-medium text-[color:var(--foreground)] outline-none hover:border-[color:var(--border-strong)]"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {labels[o]}
        </option>
      ))}
    </select>
  );
}

export default function BlockCard({
  block,
  index,
  total,
  hint,
  onPatch,
  onDelete,
  onMove,
}: {
  block: ReelBlock;
  index: number;
  total: number;
  /** Placeholder seeded by a preset — what to write here. */
  hint?: string;
  onPatch: (patch: Partial<ReelBlock>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [openOverlay, setOpenOverlay] = useState<string | null>(null);

  const isSpoken = block.kind === 'talk' || block.kind === 'dialogue';
  const body = (isSpoken ? block.spoken : block.screenText) ?? '';
  const runs = textRuns(body, block.overlays);
  const resolved = resolveOverlays(body, block.overlays);
  const color = BLOCK_COLORS[block.kind];

  /** Selection in the textarea — what a new add-on will hang off. */
  const readSelection = () => {
    const el = textRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    setSelection(s !== e ? { start: s, end: e } : null);
  };

  const addOverlay = () => {
    const anchorText = selection ? body.slice(selection.start, selection.end) : '';
    const overlay: Overlay = {
      id: `ov_${Math.random().toString(36).slice(2, 10)}`,
      anchorText,
      anchorStart: selection?.start ?? 0,
      kind: 'image',
      note: '',
    };
    onPatch({ overlays: [...block.overlays, overlay] });
    setSelection(null);
    setOpenOverlay(overlay.id);
  };

  const patchOverlay = (id: string, patch: Partial<Overlay>) =>
    onPatch({ overlays: block.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

  const removeOverlay = (id: string) =>
    onPatch({ overlays: block.overlays.filter((o) => o.id !== id) });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4" data-testid="reel-block" data-kind={block.kind}>
      {/* ── the block itself ── */}
      <div
        className="rounded-[16px] border bg-[color:var(--background)] p-4"
        style={{ borderColor: 'var(--border)', boxShadow: 'var(--elev-1)' }}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold tabular-nums text-white"
            style={{ backgroundColor: color }}
          >
            {index + 1}
          </span>

          <Select
            value={block.kind}
            options={BLOCK_KINDS}
            labels={BLOCK_LABELS}
            onChange={(kind: BlockKind) => onPatch({ kind })}
          />

          {/* Sound is a separate axis from picture — this is the control that
              makes «б-рол із тим самим голосом зверху» expressible. */}
          <Select
            value={effectiveAudio(block)}
            options={AUDIO_SOURCES}
            labels={AUDIO_LABELS}
            onChange={(audioSource: AudioSource) => onPatch({ audioSource })}
          />
          <span className="text-[11.5px] text-[color:var(--text-muted)]">
            {AUDIO_HINTS[effectiveAudio(block)]}
          </span>

          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={index === 0}
              aria-label="Вище"
              className="cursor-pointer rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={index === total - 1}
              aria-label="Нижче"
              className="cursor-pointer rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Видалити блок"
              data-testid="delete-block"
              className="cursor-pointer rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {block.kind === 'dialogue' && (
          <input
            value={block.speaker ?? ''}
            onChange={(e) => onPatch({ speaker: e.target.value })}
            placeholder="Хто говорить"
            data-testid="block-speaker"
            className="mb-2 w-40 rounded-[8px] border border-[color:var(--border)] bg-white px-2.5 py-1.5 text-[13px] font-semibold outline-none focus:border-[color:var(--border-strong)]"
          />
        )}

        {/* ── the words, with the anchored phrases underlined ──
            The highlight layer draws ONLY the highlight: its glyphs are
            transparent and carry the marks, while the real text is the
            textarea's own on top. Drawing the text in both is what doubled it
            on screen. The layer scrolls with the box, since a textarea taller
            than its rows scrolls internally. */}
        {(isSpoken || block.kind === 'text') && (
          <div className="relative">
            <div
              ref={mirrorRef}
              aria-hidden
              className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[10px] border-transparent ${TEXT_METRICS}`}
              style={{ color: 'transparent' }}
            >
              {runs.map((run, i) =>
                run.overlayIds.length > 0 ? (
                  <mark
                    key={i}
                    className="rounded-[3px]"
                    style={{
                      color: 'transparent',
                      backgroundColor: `${color}24`,
                      boxShadow: `inset 0 -2px 0 ${color}`,
                    }}
                  >
                    {run.text}
                  </mark>
                ) : (
                  <span key={i}>{run.text}</span>
                ),
              )}
            </div>

            <textarea
              ref={textRef}
              value={body}
              onChange={(e) =>
                onPatch(isSpoken ? { spoken: e.target.value } : { screenText: e.target.value })
              }
              onSelect={readSelection}
              onScroll={(e) => {
                if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
              }}
              onBlur={() => window.setTimeout(() => setSelection(null), 150)}
              rows={4}
              data-testid="block-text"
              placeholder={
                hint ?? (block.kind === 'text' ? 'Що написано на екрані' : 'Що я кажу, слово в слово')
              }
              className={`relative w-full resize-y rounded-[10px] border-[color:var(--border)] bg-transparent outline-none focus:border-[color:var(--border-strong)] ${TEXT_METRICS}`}
              style={{ color: 'var(--foreground)', caretColor: 'var(--foreground)' }}
            />

            {selection && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={addOverlay}
                data-testid="add-overlay"
                className="absolute -top-3 right-2 z-10 flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white shadow-[var(--elev-2)]"
                style={{ backgroundColor: color }}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                Додати на це
              </button>
            )}
          </div>
        )}

        {/* ── what has to be captured ── */}
        {(block.kind === 'broll' || block.kind === 'sound') && (
          <div className="flex flex-wrap items-center gap-2">
            {block.kind === 'broll' && (
              <Select
                value={block.assetKind}
                options={ASSET_KINDS}
                labels={ASSET_LABELS}
                onChange={(assetKind: AssetKind) => onPatch({ assetKind })}
                placeholder="Що робимо"
              />
            )}
            <input
              value={block.assetNote ?? ''}
              onChange={(e) => onPatch({ assetNote: e.target.value })}
              placeholder={hint ?? (block.kind === 'sound' ? 'Який звук / тренд' : 'Що на кадрі')}
              data-testid="block-asset"
              className={`${FIELD} flex-1`}
            />
          </div>
        )}

        {(block.kind === 'broll' || block.kind === 'sound') && (
          <div className="mt-2 flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-muted)]" />
            <input
              value={block.assetUrl ?? ''}
              onChange={(e) => onPatch({ assetUrl: e.target.value })}
              placeholder="Посилання на референс"
              className={`${FIELD} text-[13px]`}
            />
          </div>
        )}

        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            value={block.recordNote ?? ''}
            onChange={(e) => onPatch({ recordNote: e.target.value })}
            placeholder="Як знімати"
            data-testid="block-record"
            className={`${FIELD} text-[13px]`}
          />
          <input
            value={block.editNote ?? ''}
            onChange={(e) => onPatch({ editNote: e.target.value })}
            placeholder="Як монтувати"
            data-testid="block-edit"
            className={`${FIELD} text-[13px]`}
          />
        </div>
      </div>

      {/* ── the margin: add-ons hanging off the words ── */}
      <div className="flex flex-col gap-2 pt-1">
        {resolved.length === 0 && (
          <p className="rounded-[12px] border border-dashed border-[color:var(--border)] px-3 py-4 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
            Виділи слова в тексті — і причепи до них фото, відео чи напис.
          </p>
        )}

        {resolved.map((o) => (
          <div
            key={o.id}
            data-testid="overlay-card"
            className="rounded-[12px] border bg-[color:var(--background)] p-2.5"
            style={{
              borderColor: openOverlay === o.id ? color : 'var(--border)',
              boxShadow: 'var(--elev-1)',
            }}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <Select
                value={o.kind}
                options={OVERLAY_KINDS}
                labels={OVERLAY_LABELS}
                onChange={(kind: OverlayKind) => patchOverlay(o.id, { kind })}
              />
              <button
                type="button"
                onClick={() => removeOverlay(o.id)}
                aria-label="Прибрати"
                className="ml-auto cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.2} />
              </button>
            </div>

            <p className="mb-1.5 text-[11.5px] leading-snug text-[color:var(--text-muted)]">
              {o.detached ? (
                <span className="text-amber-600">Текст змінився — перечепи</span>
              ) : o.anchorText ? (
                <>на «{o.anchorText}»</>
              ) : (
                'на весь блок'
              )}
            </p>

            <textarea
              value={o.note}
              onChange={(e) => patchOverlay(o.id, { note: e.target.value })}
              onFocus={() => setOpenOverlay(o.id)}
              rows={2}
              placeholder="Що саме вискакує"
              className="w-full resize-none rounded-[8px] border border-[color:var(--border)] bg-white px-2 py-1.5 text-[12.5px] outline-none focus:border-[color:var(--border-strong)]"
            />
            <input
              value={o.url ?? ''}
              onChange={(e) => patchOverlay(o.id, { url: e.target.value })}
              placeholder="Посилання"
              className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-white px-2 py-1 text-[12px] outline-none focus:border-[color:var(--border-strong)]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
