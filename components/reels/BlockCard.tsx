'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, ImagePlus, Link2, Plus, Trash2, X } from 'lucide-react';
import ReferenceMedia from '@/components/reels/ReferenceMedia';
import { imagesFromClipboard, uploadPastedImage } from '@/lib/reels/pasteImage';
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
  blockClips,
  effectiveAudio,
  resolveOverlays,
  textRuns,
  type AssetKind,
  type AudioSource,
  type BlockKind,
  type Clip,
  type Overlay,
  type RefImage,
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
 *
 * The one that is NOT a property: a scrollbar. Past four rows the textarea grew
 * one, which took ~15px off its content width, so it wrapped earlier than the
 * mirror and every highlight after that point slid off its words. The textarea
 * therefore grows to fit its text and never scrolls — see `useAutoGrow`.
 */
const TEXT_METRICS =
  'whitespace-pre-wrap break-words font-sans text-[15px] leading-[1.6] tracking-normal px-3 py-2 border';

/** Four rows of `TEXT_METRICS`, plus its padding — where an empty block starts. */
const TEXT_MIN_HEIGHT = 4 * Math.round(15 * 1.6) + 16 + 2;

/**
 * Grow a textarea to its content, so it never scrolls inside itself.
 *
 * Measured on every change to `text` because that is the only thing that can
 * change the height, and on width changes because rewrapping changes the line
 * count. `height:auto` first: `scrollHeight` of an element already tall enough
 * reports the height it HAS, not the height it needs, so a shrinking edit would
 * otherwise never shrink the box.
 */
function useAutoGrow(ref: React.RefObject<HTMLTextAreaElement | null>, text: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, TEXT_MIN_HEIGHT)}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, text]);
}

/** Outside the component: an id is minted in an event, never during a render. */
function newClipId(): string {
  return `cl_${Math.random().toString(36).slice(2, 10)}`;
}

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
  reelAudio,
  onPatch,
  onDelete,
  onDuplicate,
  onMove,
}: {
  block: ReelBlock;
  index: number;
  total: number;
  /** Placeholder seeded by a preset — what to write here. */
  hint?: string;
  /** The reel's own sound, shown as the fallback this block inherits. */
  reelAudio?: AudioSource | null;
  onPatch: (patch: Partial<ReelBlock>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [pasting, setPasting] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [openOverlay, setOpenOverlay] = useState<string | null>(null);

  const isSpoken = block.kind === 'talk' || block.kind === 'dialogue';
  const body = (isSpoken ? block.spoken : block.screenText) ?? '';
  useAutoGrow(textRef, body);
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

  // A cutaway's shots. A legacy block keeps its single asset in the block's own
  // columns; the first edit moves it into `clips` and clears them, so there is
  // never more than one source of truth for what has to be shot.
  const clips = blockClips(block);
  const writeClips = (next: Clip[]) =>
    onPatch({ clips: next, assetNote: null, assetKind: null, assetUrl: null });

  const addClip = () =>
    writeClips([...clips, { id: newClipId(), what: '', assetKind: block.assetKind ?? 'film' }]);

  const patchClip = (id: string, patch: Partial<Clip>) =>
    writeClips(clips.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const removeClip = (id: string) => writeClips(clips.filter((c) => c.id !== id));

  const moveClip = (id: string, dir: -1 | 1) => {
    const from = clips.findIndex((c) => c.id === id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= clips.length) return;
    const next = [...clips];
    [next[from], next[to]] = [next[to], next[from]];
    writeClips(next);
  };

  /**
   * Ctrl+V anywhere in the block. If the paste happened inside a clip row the
   * picture belongs to THAT shot; otherwise it is a reference for the whole
   * block. Text pastes fall through untouched.
   */
  const onPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = imagesFromClipboard(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault();

    const target = e.target as HTMLElement | null;
    const clipId = target?.closest?.('[data-clip-id]')?.getAttribute('data-clip-id') ?? null;
    // An add-on card is where «на цих словах вискакує ось це» is written, so a
    // picture pasted into one is a picture of that thing, not of the block.
    const overlayId = target?.closest?.('[data-overlay-id]')?.getAttribute('data-overlay-id') ?? null;

    setPasting(true);
    setPasteError(null);
    try {
      for (const file of files) {
        const res = await uploadPastedImage(file, block.projectId);
        if (!res.ok) {
          setPasteError(res.error);
          break;
        }
        if (clipId) {
          onPatch({
            clips: blockClips(block).map((c) => (c.id === clipId ? { ...c, image: res.url } : c)),
          });
        } else if (overlayId) {
          patchOverlay(overlayId, { url: res.url });
        } else {
          const image: RefImage = { id: newClipId().replace('cl_', 'img_'), url: res.url };
          onPatch({ images: [...block.images, image] });
        }
      }
    } finally {
      setPasting(false);
    }
  };

  const removeImage = (id: string) => onPatch({ images: block.images.filter((i) => i.id !== id) });

  const patchOverlay = (id: string, patch: Partial<Overlay>) =>
    onPatch({ overlays: block.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

  const removeOverlay = (id: string) =>
    onPatch({ overlays: block.overlays.filter((o) => o.id !== id) });

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_260px] gap-4"
      data-testid="reel-block"
      data-kind={block.kind}
      onPaste={(e) => void onPaste(e)}
    >
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
            value={effectiveAudio(block, reelAudio)}
            options={AUDIO_SOURCES}
            labels={AUDIO_LABELS}
            onChange={(audioSource: AudioSource) => onPatch({ audioSource })}
          />
          <span className="text-[11.5px] text-[color:var(--text-muted)]">
            {block.audioSource
              ? AUDIO_HINTS[effectiveAudio(block, reelAudio)]
              : reelAudio
                ? 'як у всього рілса'
                : AUDIO_HINTS[effectiveAudio(block, reelAudio)]}
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
              onClick={onDuplicate}
              aria-label="Дублювати блок"
              data-testid="duplicate-block"
              className="cursor-pointer rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <Copy className="h-4 w-4" />
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
            on screen. Neither box ever scrolls inside itself — the textarea
            grows to its text — so the two stay wrapped identically. */}
        {(isSpoken || block.kind === 'text') && (
          <div className="relative">
            <div
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
              onBlur={() => window.setTimeout(() => setSelection(null), 150)}
              rows={1}
              data-testid="block-text"
              placeholder={
                hint ?? (block.kind === 'text' ? 'Що написано на екрані' : 'Що я кажу, слово в слово')
              }
              // `resize-none` + `overflow-hidden`: the box is sized by its text,
              // and a scrollbar here would silently rewrap it away from the
              // mirror behind it.
              className={`relative w-full resize-none overflow-hidden rounded-[10px] border-[color:var(--border)] bg-transparent outline-none focus:border-[color:var(--border-strong)] ${TEXT_METRICS}`}
              style={{
                color: 'var(--foreground)',
                caretColor: 'var(--foreground)',
                minHeight: TEXT_MIN_HEIGHT,
              }}
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

        {/* ── the shots inside a cutaway ──
            A rapid sequence is one block with many clips, not many blocks: each
            row is a shot, its words on screen, and its own sound if it has one. */}
        {block.kind === 'broll' && (
          <div className="flex flex-col gap-2" data-testid="clip-list">
            {clips.map((c, ci) => (
              <div
                key={c.id}
                data-testid="clip-row"
                data-clip-id={c.id}
                className="rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface1)]/50 p-2.5"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-[10.5px] font-bold tabular-nums text-white"
                    style={{ backgroundColor: color }}
                  >
                    {ci + 1}
                  </span>
                  <Select
                    value={c.assetKind ?? block.assetKind ?? 'film'}
                    options={ASSET_KINDS}
                    labels={ASSET_LABELS}
                    onChange={(assetKind: AssetKind) => patchClip(c.id, { assetKind })}
                  />
                  <input
                    value={c.what}
                    onChange={(e) => patchClip(c.id, { what: e.target.value })}
                    placeholder={ci === 0 ? (hint ?? 'Що на кадрі') : 'Що на кадрі'}
                    data-testid="clip-what"
                    className={`${FIELD} flex-1 text-[13.5px]`}
                  />
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveClip(c.id, -1)}
                      disabled={ci === 0}
                      aria-label="Кадр вище"
                      className="cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveClip(c.id, 1)}
                      disabled={ci === clips.length - 1}
                      aria-label="Кадр нижче"
                      className="cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeClip(c.id)}
                      aria-label="Прибрати кадр"
                      data-testid="delete-clip"
                      className="cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={c.screenText ?? ''}
                    onChange={(e) => patchClip(c.id, { screenText: e.target.value })}
                    placeholder="Напис поверх"
                    data-testid="clip-screen"
                    className={`${FIELD} text-[13px]`}
                  />
                  <input
                    value={c.soundNote ?? ''}
                    onChange={(e) => patchClip(c.id, { soundNote: e.target.value })}
                    placeholder="Звук поверх (якщо інший)"
                    className={`${FIELD} text-[13px]`}
                  />
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-muted)]" />
                  <input
                    value={c.url ?? ''}
                    onChange={(e) => patchClip(c.id, { url: e.target.value })}
                    placeholder="Посилання на референс — Reels, TikTok, YouTube"
                    className={`${FIELD} text-[12.5px]`}
                  />
                </div>

                <ReferenceMedia url={c.url} compact />

                {/* A picture pasted onto this shot: «отак має виглядати». */}
                {c.image && (
                  <div className="relative mt-1.5 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.image}
                      alt="Референс кадру"
                      className="max-h-28 w-auto rounded-[8px] border border-[color:var(--border)] object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => patchClip(c.id, { image: undefined })}
                      aria-label="Прибрати зображення"
                      className="absolute -right-2 -top-2 cursor-pointer rounded-full bg-white p-1 text-zinc-400 shadow-[var(--elev-1)] hover:text-red-500"
                    >
                      <X className="h-3 w-3" strokeWidth={2.4} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addClip}
              data-testid="add-clip"
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[color:var(--border-strong)] px-3 py-2 text-[12.5px] font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--foreground)]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
              {clips.length === 0 ? 'Додати кадр' : 'Ще кадр'}
            </button>
          </div>
        )}

        {/* ── a sound block: one track, no picture ── */}
        {block.kind === 'sound' && (
          <>
            <input
              value={block.assetNote ?? ''}
              onChange={(e) => onPatch({ assetNote: e.target.value })}
              placeholder={hint ?? 'Який звук / тренд'}
              data-testid="block-asset"
              className={`${FIELD} w-full`}
            />
            <div className="mt-2 flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-muted)]" />
              <input
                value={block.assetUrl ?? ''}
                onChange={(e) => onPatch({ assetUrl: e.target.value })}
                placeholder="Посилання на референс"
                className={`${FIELD} text-[13px]`}
              />
            </div>
          </>
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

        {block.kind === 'sound' && <ReferenceMedia url={block.assetUrl} compact />}

        {/* Pictures pasted onto the block as a whole. */}
        {(block.images.length > 0 || pasting || pasteError) && (
          <div className="mt-2 flex flex-wrap items-start gap-2" data-testid="block-images">
            {block.images.map((img) => (
              <div key={img.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt="Референс"
                  className="max-h-28 w-auto rounded-[8px] border border-[color:var(--border)] object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  aria-label="Прибрати зображення"
                  className="absolute -right-2 -top-2 cursor-pointer rounded-full bg-white p-1 text-zinc-400 shadow-[var(--elev-1)] hover:text-red-500"
                >
                  <X className="h-3 w-3" strokeWidth={2.4} />
                </button>
              </div>
            ))}
            {pasting && (
              <span className="flex items-center gap-1.5 rounded-[8px] border border-dashed border-[color:var(--border-strong)] px-3 py-2 text-[12px] text-[color:var(--text-muted)]">
                <ImagePlus className="h-3.5 w-3.5" />
                Завантажую…
              </span>
            )}
            {pasteError && <span className="text-[12px] text-red-600">{pasteError}</span>}
          </div>
        )}

        {block.images.length === 0 && !pasting && (
          <p className="mt-2 text-[11.5px] text-[color:var(--text-muted)]">
            <ImagePlus className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            Встав картинку (Ctrl+V) — стане референсом до цього блоку
          </p>
        )}
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
            data-overlay-id={o.id}
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
              placeholder="Посилання або встав картинку"
              className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-white px-2 py-1 text-[12px] outline-none focus:border-[color:var(--border-strong)]"
            />
            <ReferenceMedia url={o.url} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
