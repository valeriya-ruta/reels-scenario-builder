'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { Keyboard, Link2, Loader2, Mic, MoreHorizontal, Sparkles } from 'lucide-react';
import EditorTopBar from '@/components/ui/EditorTopBar';
import StatusPill from '@/components/content/StatusPill';
import ScheduleChip from '@/components/content/ScheduleChip';
import ParagraphRow from '@/components/reels/ParagraphRow';
import ClipCard from '@/components/reels/ClipCard';
import AttachSheet from '@/components/reels/AttachSheet';
import CleanScriptSheet from '@/components/reels/CleanScriptSheet';
import OverlayListSheet from '@/components/reels/OverlayListSheet';
import ReelMoreSheet from '@/components/reels/ReelMoreSheet';
import MicButton, { type MicHandle } from '@/components/reels/MicButton';
import { updateProjectName } from '@/app/actions';
import {
  createReelBlock,
  deleteReelBlock,
  rewriteReel,
  updateReelBlock,
} from '@/app/reel-actions';
import { SaveQueue, saveLabel, type SaveQueueState } from '@/lib/reels/saveQueue';
import {
  emptyBlock,
  estimateSeconds,
  formatDuration,
  type Clip,
  type Overlay,
  type OverlayKind,
  type ReelBlock,
} from '@/lib/reels/blocks';
import { cleanScript } from '@/lib/reels/script';
import {
  insertAt,
  mergeBlockText,
  overlayForSelection,
  redistributeOverlays,
  splitBlockText,
} from '@/lib/reels/edit';
import { OFFERED_OVERLAY_KINDS, overlayStyle } from '@/lib/reels/overlayStyle';
import { useKeyboardInset } from '@/lib/ui/keyboardInset';
import type { Project } from '@/lib/domain';

/**
 * A reel is a note.
 *
 * Not a scene list, not a form, not a builder — a white page you type on, with
 * a mic, the way the idea actually gets captured today in Apple Notes or a
 * message to yourself. The difference is that this note writes its own lists.
 *
 * Everything that made it read as a tool is gone: the numbered cards, the
 * per-row reorder controls, the dashed «add» box in the middle of the writing,
 * the scenes/text switch. Blocks are still the model underneath — the shot list
 * and the editing list are derived from them — but she never sees the word.
 *
 * ONE toolbar, and it changes rather than multiplying. Nothing selected: the
 * mic, «Зробити рілс», and everything rarer behind ⋯. A phrase selected: what
 * can go on top of it, and the two length buttons.
 *
 * The toolbar is offset by the keyboard's height rather than pinned to the
 * bottom of the page — see useKeyboardInset. Pinned, it sat UNDERNEATH the
 * keys, so selecting a phrase appeared to do nothing unless she dismissed the
 * keyboard first, which on Android also cleared the selection she had just made.
 */

const SAVE_DELAY_MS = 600;

const DRAFT = 'draft:';
const isDraft = (id: string) => id.startsWith(DRAFT);
const draftId = () => `${DRAFT}${nanoid(8)}`;

type Busy = null | 'reel' | 'shorter' | 'longer';

export default function ReelTextScreen({
  project: initialProject,
  initialBlocks,
  backHref = '/projects',
}: {
  project: Project;
  initialBlocks: ReelBlock[];
  backHref?: string;
}) {
  const [project, setProject] = useState(initialProject);
  const [blocks, setBlocks] = useState<ReelBlock[]>(() =>
    initialBlocks.length > 0 ? initialBlocks : [emptyBlock('talk', initialProject.id, 0, draftId())],
  );
  const [focusId, setFocusId] = useState<string | null>(null);
  const [caretAt, setCaretAt] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(blocks[0]?.id ?? null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [openOverlay, setOpenOverlay] = useState<{ blockId: string; overlayId: string } | null>(null);
  const [sheet, setSheet] = useState<null | 'more' | 'script' | 'overlays'>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveQueueState>({
    pending: 0,
    inFlight: 0,
    failed: false,
  });
  const [everSaved, setEverSaved] = useState(false);

  const keyboard = useKeyboardInset();
  const micRef = useRef<MicHandle>(null);

  const [queue] = useState(
    () =>
      new SaveQueue(SAVE_DELAY_MS, (s) => {
        setSaveState(s);
        if (s.inFlight > 0) setEverSaved(true);
      }),
  );

  useEffect(() => {
    const flush = () => queue.flush();
    const guard = (e: BeforeUnloadEvent) => {
      if (!queue.busy) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', guard);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', guard);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [queue]);

  const pendingCreates = useRef(new Map<string, Promise<string | null>>());

  const realIdFor = useCallback(
    async (block: ReelBlock): Promise<string | null> => {
      if (!isDraft(block.id)) return block.id;
      const started = pendingCreates.current.get(block.id);
      if (started) return started;

      const create = createReelBlock(project.id, block.orderIndex, block.kind, {
        spoken: block.spoken,
        overlays: block.overlays,
        clips: block.clips,
        audioSource: block.audioSource,
      }).then((res) => {
        if (!res.ok) return null;
        const realId = res.data.id;
        setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, id: realId } : b)));
        return realId;
      });

      pendingCreates.current.set(block.id, create);
      return create;
    },
    [project.id],
  );

  const save = useCallback(
    (block: ReelBlock, field: string) => {
      queue.schedule(`${block.id}:${field}`, async () => {
        const id = await realIdFor(block);
        if (!id) return false;
        if (isDraft(block.id)) return true; // the create carried this content
        const res = await updateReelBlock(id, {
          spoken: block.spoken,
          overlays: block.overlays,
          clips: block.clips,
          orderIndex: block.orderIndex,
          kind: block.kind,
        });
        return res.ok;
      });
    },
    [queue, realIdFor],
  );

  /** Apply a whole new list and persist every row that changed. */
  const commit = useCallback(
    (next: ReelBlock[], field: string, changed?: ReelBlock[]) => {
      setBlocks(next);
      (changed ?? next).forEach((b) => save(b, field));
    },
    [save],
  );

  const patchBlock = useCallback(
    (blockId: string, patch: Partial<ReelBlock>, field: string) => {
      const next = blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b));
      const changed = next.find((b) => b.id === blockId);
      setBlocks(next);
      if (changed) save(changed, field);
    },
    [blocks, save],
  );

  const patchClip = useCallback(
    (blockId: string, patch: Partial<Clip>) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;
      const current = block.clips[0] ?? { id: nanoid(8), what: '' };
      patchBlock(blockId, { clips: [{ ...current, ...patch }] }, 'clips');
    },
    [blocks, patchBlock],
  );

  // ── typing ────────────────────────────────────────────────────────────────

  const handleSplit = (blockId: string, at: number) => {
    const index = blocks.findIndex((b) => b.id === blockId);
    if (index === -1) return;

    const { head, tail } = splitBlockText(blocks[index], at);
    const tailBlock: ReelBlock = { ...emptyBlock('talk', project.id, index + 1, draftId()), ...tail };

    const next = [...blocks];
    next.splice(index, 1, { ...blocks[index], ...head }, tailBlock);
    const renumbered = next.map((b, i) => ({ ...b, orderIndex: i }));

    setFocusId(tailBlock.id);
    setCaretAt(0);
    commit(renumbered, 'split');
  };

  const handleJoinUp = (blockId: string) => {
    const index = blocks.findIndex((b) => b.id === blockId);
    if (index <= 0) return;

    const above = blocks[index - 1];
    const gone = blocks[index];
    const merged = mergeBlockText(above, gone);

    const next = blocks
      .filter((b) => b.id !== gone.id)
      .map((b, i) =>
        b.id === above.id
          ? { ...b, spoken: merged.spoken, overlays: merged.overlays, orderIndex: i }
          : { ...b, orderIndex: i },
      );

    setFocusId(above.id);
    setCaretAt(merged.joinAt);
    commit(next, 'join');
    if (!isDraft(gone.id)) queue.now(async () => (await deleteReelBlock(gone.id)).ok);
  };

  const handleDelete = (blockId: string) => {
    if (blocks.length === 1) return;
    const gone = blocks.find((b) => b.id === blockId);
    commit(
      blocks.filter((b) => b.id !== blockId).map((b, i) => ({ ...b, orderIndex: i })),
      'delete',
    );
    if (gone && !isDraft(gone.id)) queue.now(async () => (await deleteReelBlock(gone.id)).ok);
  };

  /** Dictation lands where the caret is, the way a notes app does it. */
  const insertDictation = (piece: string) => {
    const targetId = activeId ?? blocks[blocks.length - 1]?.id;
    const block = blocks.find((b) => b.id === targetId);
    if (!block) return;

    const at = selection?.start ?? (block.spoken ?? '').length;
    const result = insertAt(block.spoken ?? '', at, piece, block.overlays);

    setFocusId(block.id);
    setCaretAt(result.caret);
    setSelection(null);
    patchBlock(block.id, { spoken: result.text, overlays: result.overlays }, 'spoken');
  };

  // ── the AI buttons ────────────────────────────────────────────────────────

  /**
   * «Зробити рілс» — the whole note becomes a script with a hook on the front.
   *
   * Her attachments are re-homed onto the rewritten paragraphs rather than
   * dropped: the words can be regenerated, the marks she made cannot.
   */
  const makeReel = async () => {
    if (busy) return;
    const source = cleanScript(blocks);
    if (!source.trim()) {
      setError('Спочатку напиши або наговори щось.');
      return;
    }

    setBusy('reel');
    setError(null);
    const res = await rewriteReel(source, 'reel');
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }

    const paragraphs = res.data.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) {
      setError('Модель повернула порожній текст. Спробуй ще раз.');
      return;
    }

    const allOverlays = blocks.flatMap((b) => b.overlays);
    const homes = redistributeOverlays(paragraphs, allOverlays);
    // Clip cards are not speech and are not part of the rewrite — they keep
    // their place at the end rather than being regenerated away.
    const clipBlocks = blocks.filter((b) => b.kind === 'broll');

    const rewritten: ReelBlock[] = paragraphs.map((text, i) => {
      const reuse = blocks[i] && blocks[i].kind !== 'broll' ? blocks[i] : null;
      return reuse
        ? { ...reuse, spoken: text, overlays: homes[i], orderIndex: i }
        : { ...emptyBlock('talk', project.id, i, draftId()), spoken: text, overlays: homes[i] };
    });

    const dropped = blocks.filter(
      (b) => b.kind !== 'broll' && !rewritten.some((r) => r.id === b.id) && !isDraft(b.id),
    );

    const next = [...rewritten, ...clipBlocks].map((b, i) => ({ ...b, orderIndex: i }));
    commit(next, 'rewrite');
    for (const gone of dropped) queue.now(async () => (await deleteReelBlock(gone.id)).ok);

    if (res.data.title) {
      setProject((p) => ({ ...p, name: res.data.title! }));
      queue.now(async () => (await updateProjectName(project.id, res.data.title!)).ok);
    }
  };

  /**
   * Коротше / Довше — on the selected phrase when there is one, otherwise on
   * the whole note. Selecting first is how you say «this bit», and having to
   * explain that in a menu would be a worse app.
   */
  const resize = async (mode: 'shorter' | 'longer') => {
    if (busy) return;
    const block = activeId ? blocks.find((b) => b.id === activeId) : null;
    const scoped = selection && block ? (block.spoken ?? '').slice(selection.start, selection.end) : '';
    const source = scoped.trim() || cleanScript(blocks);
    if (!source.trim()) {
      setError('Спочатку напиши або наговори щось.');
      return;
    }

    setBusy(mode);
    setError(null);
    const res = await rewriteReel(source, mode);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }

    if (scoped.trim() && block && selection) {
      // Splice back into the phrase's own place, so the paragraph around it and
      // every anchor after it stay where they were.
      const text = block.spoken ?? '';
      const replaced = text.slice(0, selection.start) + res.data.text + text.slice(selection.end);
      const shift = res.data.text.length - (selection.end - selection.start);
      patchBlock(
        block.id,
        {
          spoken: replaced,
          overlays: block.overlays.map((o) =>
            o.anchorStart >= selection.end ? { ...o, anchorStart: o.anchorStart + shift } : o,
          ),
        },
        'spoken',
      );
      setSelection(null);
      return;
    }

    const paragraphs = res.data.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) return;
    const homes = redistributeOverlays(paragraphs, blocks.flatMap((b) => b.overlays));
    const clipBlocks = blocks.filter((b) => b.kind === 'broll');
    const rewritten: ReelBlock[] = paragraphs.map((text, i) => {
      const reuse = blocks[i] && blocks[i].kind !== 'broll' ? blocks[i] : null;
      return reuse
        ? { ...reuse, spoken: text, overlays: homes[i], orderIndex: i }
        : { ...emptyBlock('talk', project.id, i, draftId()), spoken: text, overlays: homes[i] };
    });
    const dropped = blocks.filter(
      (b) => b.kind !== 'broll' && !rewritten.some((r) => r.id === b.id) && !isDraft(b.id),
    );
    commit([...rewritten, ...clipBlocks].map((b, i) => ({ ...b, orderIndex: i })), 'rewrite');
    for (const gone of dropped) queue.now(async () => (await deleteReelBlock(gone.id)).ok);
  };

  /** A reference's words, dropped in as the note's text. */
  const applyReferenceText = (text: string) => {
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const list = paragraphs.length > 0 ? paragraphs : [text.trim()];
    const rewritten: ReelBlock[] = list.map((spoken, i) => {
      const reuse = blocks[i] && blocks[i].kind !== 'broll' ? blocks[i] : null;
      return reuse
        ? { ...reuse, spoken, overlays: [], orderIndex: i }
        : { ...emptyBlock('talk', project.id, i, draftId()), spoken };
    });
    const dropped = blocks.filter(
      (b) => b.kind !== 'broll' && !rewritten.some((r) => r.id === b.id) && !isDraft(b.id),
    );
    commit(rewritten.map((b, i) => ({ ...b, orderIndex: i })), 'reference');
    for (const gone of dropped) queue.now(async () => (await deleteReelBlock(gone.id)).ok);
  };

  const addClipCard = () => {
    const card: ReelBlock = {
      ...emptyBlock('broll', project.id, blocks.length, draftId()),
      audioSource: null,
      clips: [{ id: nanoid(8), what: '' }],
    };
    setBlocks([...blocks, card]);
    save(card, 'create');
  };

  // ── attachments ───────────────────────────────────────────────────────────

  const attach = (kind: OverlayKind) => {
    if (!activeId || !selection) return;
    const block = blocks.find((b) => b.id === activeId);
    if (!block) return;

    const overlay = overlayForSelection(
      nanoid(10),
      kind,
      block.spoken ?? '',
      selection.start,
      selection.end,
    );
    patchBlock(block.id, { overlays: [...block.overlays, overlay] }, 'overlays');
    setSelection(null);
    setOpenOverlay({ blockId: block.id, overlayId: overlay.id });
  };

  const changeOverlay = (patch: Partial<Overlay>) => {
    if (!openOverlay) return;
    const block = blocks.find((b) => b.id === openOverlay.blockId);
    if (!block) return;
    patchBlock(
      block.id,
      { overlays: block.overlays.map((o) => (o.id === openOverlay.overlayId ? { ...o, ...patch } : o)) },
      'overlays',
    );
  };

  const removeOverlay = () => {
    if (!openOverlay) return;
    const block = blocks.find((b) => b.id === openOverlay.blockId);
    if (block) {
      patchBlock(
        block.id,
        { overlays: block.overlays.filter((o) => o.id !== openOverlay.overlayId) },
        'overlays',
      );
    }
    setOpenOverlay(null);
  };

  const activeOverlay = openOverlay
    ? (blocks
        .find((b) => b.id === openOverlay.blockId)
        ?.overlays.find((o) => o.id === openOverlay.overlayId) ?? null)
    : null;

  // ── header ────────────────────────────────────────────────────────────────

  const seconds = useMemo(() => estimateSeconds(blocks), [blocks]);
  const overlayCount = useMemo(() => blocks.reduce((n, b) => n + b.overlays.length, 0), [blocks]);
  const label = saveLabel(saveState, everSaved);
  const hasWriting = useMemo(() => cleanScript(blocks).trim().length > 0, [blocks]);
  const hasContent = useMemo(
    () => hasWriting || blocks.some((b) => b.clips.length > 0 || b.overlays.length > 0),
    [blocks, hasWriting],
  );

  const rename = async (next: string) => {
    const previous = project.name;
    setProject((p) => ({ ...p, name: next }));
    const res = await updateProjectName(project.id, next);
    if (!res.ok) setProject((p) => ({ ...p, name: previous }));
  };

  const BAR_HEIGHT = 68;

  return (
    <div className="app-canvas min-h-dvh">
      <div
        className="mx-auto max-w-[680px] px-4 pt-4"
        style={{ paddingBottom: BAR_HEIGHT + keyboard + 40 }}
      >
        <EditorTopBar
          backHref={backHref}
          title={project.name}
          kind="reel"
          onRename={rename}
          meta={
            <>
              <StatusPill
                refTable="projects"
                id={project.id}
                type="reel"
                initialStatus={project.status ?? 'idea'}
              />
              <ScheduleChip
                refTable="projects"
                id={project.id}
                initialDate={project.scheduled_date ?? null}
              />
              <span className="text-[12px] tabular-nums text-[color:var(--text-muted)]">
                ~{formatDuration(seconds)}
                {overlayCount > 0 ? ` · ${overlayCount} поверх` : ''}
              </span>
              <SaveChip label={label} />
            </>
          }
        />

        {/* The note. No numbers, no cards, no chrome — paragraphs on a page. */}
        <div className="flex flex-col">
          {blocks.map((block, i) =>
            block.kind === 'broll' ? (
              <div key={block.id} className="my-2">
                <ClipCard
                  block={block}
                  index={i + 1}
                  reelId={project.id}
                  canMoveUp={false}
                  canMoveDown={false}
                  onChangeClip={(patch) => patchClip(block.id, patch)}
                  onMove={() => {}}
                  onDelete={() => handleDelete(block.id)}
                />
              </div>
            ) : (
              <ParagraphRow
                key={block.id}
                block={block}
                index={i + 1}
                numbered={false}
                active={activeId === block.id}
                autoFocus={focusId === block.id}
                caretAt={focusId === block.id ? caretAt : null}
                placeholder={i === 0 ? 'Пиши або тисни мікрофон…' : undefined}
                canMoveUp={i > 0}
                canMoveDown={i < blocks.length - 1}
                onChange={(spoken) => patchBlock(block.id, { spoken }, 'spoken')}
                onSelectionChange={(sel) => {
                  setActiveId(block.id);
                  setSelection(sel);
                }}
                onSplit={(at) => handleSplit(block.id, at)}
                onJoinUp={() => handleJoinUp(block.id)}
                onMove={() => {}}
                onDelete={() => handleDelete(block.id)}
                onOpenOverlay={(overlayId) => setOpenOverlay({ blockId: block.id, overlayId })}
                onFocus={() => setActiveId(block.id)}
              />
            ),
          )}
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      {/*
        An empty note is a blank box, and a blank box is the hardest thing to
        start from. So the three ways in are shown IN the note until there is
        something in it — not as a screen before it, which would tax the case
        where she already knows what she is writing. They vanish for good on the
        first word.
      */}
      {!hasContent ? (
        <div
          data-testid="reel-doors"
          className="pointer-events-none fixed inset-x-0 z-40 px-4"
          style={{ bottom: keyboard + BAR_HEIGHT + 12 }}
        >
          <div className="pointer-events-auto mx-auto flex max-w-[680px] flex-col gap-2">
            <Door
              primary
              icon={<Mic className="h-5 w-5" />}
              title="Наговорити"
              hint="Розкажи, як другові. Далі одна кнопка зробить із цього рілс."
              onClick={() => micRef.current?.start()}
            />
            <Door
              icon={<Keyboard className="h-5 w-5" />}
              title="Написати"
              hint="Просто почни друкувати."
              onClick={() => {
                const first = blocks[0];
                if (first) {
                  setActiveId(first.id);
                  setFocusId(first.id);
                  setCaretAt(0);
                }
              }}
            />
            <Door
              icon={<Link2 className="h-5 w-5" />}
              title="З референсу"
              hint="Встав посилання на Reels — витягну з нього текст."
              onClick={() => setSheet('more')}
            />
          </div>
        </div>
      ) : null}

      {/* One toolbar, lifted clear of the keyboard. */}
      <div
        data-testid="reel-toolbar"
        className="fixed inset-x-0 z-50 border-t border-[color:var(--border)] bg-[color:var(--surface1)] px-2 py-2"
        style={{ bottom: keyboard, paddingBottom: keyboard > 0 ? 8 : undefined }}
      >
        <div className="mx-auto flex max-w-[680px] items-center gap-1.5">
          {selection ? (
            <>
              {OFFERED_OVERLAY_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  data-kind={kind}
                  aria-label={overlayStyle(kind).label}
                  onMouseDown={(e) => e.preventDefault()}
                  onTouchStart={(e) => e.preventDefault()}
                  onClick={() => attach(kind)}
                  className="flex h-11 flex-1 items-center justify-center rounded-[12px] text-[17px]"
                  style={{ backgroundColor: overlayStyle(kind).wash }}
                >
                  <span aria-hidden>{overlayStyle(kind).glyph}</span>
                </button>
              ))}
              <ToolButton
                label="Коротше"
                busy={busy === 'shorter'}
                onClick={() => void resize('shorter')}
              />
              <ToolButton
                label="Довше"
                busy={busy === 'longer'}
                onClick={() => void resize('longer')}
              />
            </>
          ) : (
            <>
              <MicButton ref={micRef} onText={insertDictation} onError={setError} />
              <button
                type="button"
                data-testid="make-reel"
                disabled={busy !== null || !hasWriting}
                onClick={() => void makeReel()}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[color:var(--accent)] text-[14px] font-semibold text-white disabled:opacity-40"
              >
                {busy === 'reel' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {busy === 'reel' ? 'Роблю…' : 'Зробити рілс'}
              </button>
              <button
                type="button"
                data-testid="more"
                aria-label="Ще"
                onClick={() => setSheet('more')}
                className="flex h-11 w-11 items-center justify-center rounded-[12px] text-[color:var(--text-secondary)]"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>

      <AttachSheet
        open={activeOverlay !== null}
        overlay={activeOverlay}
        reelId={project.id}
        onClose={() => setOpenOverlay(null)}
        onChange={changeOverlay}
        onDelete={removeOverlay}
      />
      <ReelMoreSheet
        open={sheet === 'more'}
        project={project}
        script={cleanScript(blocks)}
        hasWriting={hasWriting}
        onClose={() => setSheet(null)}
        onOpenScript={() => setSheet('script')}
        onOpenOverlays={() => setSheet('overlays')}
        onAddClip={() => {
          setSheet(null);
          addClipCard();
        }}
        onProjectUpdate={setProject}
        onReferenceText={applyReferenceText}
      />
      <CleanScriptSheet open={sheet === 'script'} blocks={blocks} onClose={() => setSheet(null)} />
      <OverlayListSheet open={sheet === 'overlays'} blocks={blocks} onClose={() => setSheet(null)} />
    </div>
  );
}

function Door({
  icon,
  title,
  hint,
  primary = false,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="door"
      data-door={title}
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-[16px] border p-3.5 text-left"
      style={{
        borderColor: primary ? 'var(--accent)' : 'var(--border)',
        backgroundColor: primary ? 'var(--accent-soft)' : 'var(--surface)',
      }}
    >
      <span
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]"
        style={{
          backgroundColor: primary ? 'var(--accent)' : 'var(--surface1)',
          color: primary ? '#fff' : 'var(--text-secondary)',
        }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-[color:var(--foreground)]">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-[color:var(--text-muted)]">
          {hint}
        </span>
      </span>
    </button>
  );
}

function ToolButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`tool-${label}`}
      // Tapping must not take the selection away — that is what the button acts on.
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-11 flex-1 items-center justify-center gap-1 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--background)] px-2 text-[13px] font-semibold text-[color:var(--foreground)]"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {label}
    </button>
  );
}

function SaveChip({ label }: { label: ReturnType<typeof saveLabel> }) {
  const text =
    label === 'failed'
      ? '⚠ Не збережено'
      : label === 'saving'
        ? 'Зберігаю…'
        : label === 'saved'
          ? '✓ Збережено'
          : '';
  if (!text) return null;
  return (
    <span
      data-testid="save-chip"
      data-state={label}
      className={`text-[12px] font-medium ${
        label === 'failed' ? 'text-red-600' : 'text-[color:var(--text-muted)]'
      }`}
    >
      {text}
    </span>
  );
}
