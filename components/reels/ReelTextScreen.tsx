'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { Captions, Layers, ListChecks, Plus } from 'lucide-react';
import EditorTopBar from '@/components/ui/EditorTopBar';
import StatusPill from '@/components/content/StatusPill';
import ScheduleChip from '@/components/content/ScheduleChip';
import ParagraphRow from '@/components/reels/ParagraphRow';
import ClipCard from '@/components/reels/ClipCard';
import AttachSheet from '@/components/reels/AttachSheet';
import CleanScriptSheet from '@/components/reels/CleanScriptSheet';
import OverlayListSheet from '@/components/reels/OverlayListSheet';
import { updateProjectName } from '@/app/actions';
import {
  createReelBlock,
  deleteReelBlock,
  reorderReelBlocks,
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
import { mergeBlockText, moveBlock, overlayForSelection, splitBlockText } from '@/lib/reels/edit';
import { OFFERED_OVERLAY_KINDS, overlayStyle } from '@/lib/reels/overlayStyle';
import type { Project } from '@/lib/domain';

/**
 * The reel, as the text she is going to say.
 *
 * One input. She writes, and marks a phrase to say what appears there; the shot
 * list, the editing list and the clean script are all derived and none of them
 * asks her for anything. The ten fields the old scene card wanted — framing,
 * pose, arm state, facing, camera motion, shot size, location, transition —
 * are gone from the screen entirely. They are the vocabulary of a shoot with a
 * crew, and she is one person holding a tripod.
 *
 * Designed for the keyboard OPEN: that is this screen's normal state, not an
 * edge case. Everything repeated lives in the bottom third, because a thumb
 * does not reach the top of a 6" phone.
 *
 * A paragraph is a block, so «По сценах» is a change of drawing rather than a
 * conversion — see lib/reels/edit.ts.
 */

/** Long enough to coalesce a burst of typing, short enough to not lose a thought. */
const SAVE_DELAY_MS = 600;

type View = 'yap' | 'scenes';

/** Blocks not yet acknowledged by the server carry this prefix. */
const DRAFT = 'draft:';
const isDraft = (id: string) => id.startsWith(DRAFT);

function draftId(): string {
  return `${DRAFT}${nanoid(8)}`;
}

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
  // A reel that arrives as ONE block was dictated, not cut, so it opens as
  // flowing text; one that arrives already in pieces was cut on purpose and
  // opens as scenes. Decided once, at mount — after that it is her choice.
  const [view, setView] = useState<View>(() => (initialBlocks.length > 1 ? 'scenes' : 'yap'));
  const [focusId, setFocusId] = useState<string | null>(null);
  const [caretAt, setCaretAt] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(blocks[0]?.id ?? null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [openOverlay, setOpenOverlay] = useState<{ blockId: string; overlayId: string } | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [showOverlays, setShowOverlays] = useState(false);
  const [saveState, setSaveState] = useState<SaveQueueState>({
    pending: 0,
    inFlight: 0,
    failed: false,
  });
  const [everSaved, setEverSaved] = useState(false);

  // One queue for the lifetime of the screen, built lazily. Held in state
  // rather than a ref because a ref read during render is exactly the pattern
  // that silently stops updating; the value never changes, so nothing re-renders
  // because of it.
  const [queue] = useState(
    () =>
      new SaveQueue(SAVE_DELAY_MS, (s) => {
        setSaveState(s);
        if (s.inFlight > 0) setEverSaved(true);
      }),
  );

  // Leaving is guarded and unsaved work is flushed. A 600ms debounce plus a
  // reload is how writing was lost before; the queue makes that state knowable,
  // and these two listeners are what act on it.
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

  /**
   * Persist one block. A draft has no row yet, so its first write CREATES it
   * and every later write patches it — the id swap happens here rather than at
   * each call site, which is what keeps a fast typist from creating two rows
   * for one paragraph.
   */
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
        // The row was created with this content already; patching it again
        // would be a second write saying the same thing.
        if (isDraft(block.id)) return true;
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

  const patchBlock = useCallback(
    (blockId: string, patch: Partial<ReelBlock>, field: string) => {
      const next = blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b));
      setBlocks(next);
      const changed = next.find((b) => b.id === blockId);
      if (changed) save(changed, field);
    },
    [blocks, save],
  );

  /** A clip block holds ONE shot here; the operator edition allows a list. */
  const patchClip = useCallback(
    (blockId: string, patch: Partial<Clip>) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;
      const current = block.clips[0] ?? { id: nanoid(8), what: '' };
      patchBlock(blockId, { clips: [{ ...current, ...patch }] }, 'clips');
    },
    [blocks, patchBlock],
  );

  // ── text ──────────────────────────────────────────────────────────────────

  const handleChange = (blockId: string, spoken: string) => {
    patchBlock(blockId, { spoken }, 'spoken');
  };

  /**
   * These handlers read `blocks` and compute the next list OUTSIDE the state
   * updater, then set it.
   *
   * Deliberate: minting an id or scheduling a write inside `setBlocks(prev =>
   * …)` is a side effect in what React treats as a pure reducer, and it runs
   * twice in development — two ids for one paragraph, of which the screen keeps
   * one and the database the other. They are event handlers, so `blocks` is
   * already the current list and there is nothing to gain from the updater form.
   */

  /** Enter — this paragraph ends here and a new one starts. */
  const handleSplit = (blockId: string, at: number) => {
    const index = blocks.findIndex((b) => b.id === blockId);
    if (index === -1) return;

    const { head, tail } = splitBlockText(blocks[index], at);
    const tailBlock: ReelBlock = {
      ...emptyBlock('talk', project.id, index + 1, draftId()),
      ...tail,
    };

    const next = [...blocks];
    next.splice(index, 1, { ...blocks[index], ...head }, tailBlock);
    const renumbered = next.map((b, i) => ({ ...b, orderIndex: i }));

    setBlocks(renumbered);
    setFocusId(tailBlock.id);
    setCaretAt(0);
    renumbered.forEach((b) => save(b, 'split'));
  };

  /** Backspace at the start — undo the paragraph, keeping both halves' marks. */
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

    setBlocks(next);
    setFocusId(above.id);
    setCaretAt(merged.joinAt);
    next.forEach((b) => save(b, 'join'));
    if (!isDraft(gone.id)) {
      queue.now(async () => (await deleteReelBlock(gone.id)).ok);
    }
  };

  const handleMove = (blockId: string, direction: -1 | 1) => {
    const order = moveBlock(
      blocks.map((b) => b.id),
      blockId,
      direction,
    );
    const byId = new Map(blocks.map((b) => [b.id, b]));
    setBlocks(order.map((id, i) => ({ ...byId.get(id)!, orderIndex: i })));
    // A draft has no row to reorder yet; its position is carried by the create.
    if (order.every((id) => !isDraft(id))) {
      queue.now(async () => (await reorderReelBlocks(project.id, order)).ok);
    }
  };

  const handleDelete = (blockId: string) => {
    // Never leave the screen with nothing to type into.
    if (blocks.length === 1) return;
    const gone = blocks.find((b) => b.id === blockId);
    setBlocks(blocks.filter((b) => b.id !== blockId).map((b, i) => ({ ...b, orderIndex: i })));
    if (gone && !isDraft(gone.id)) {
      queue.now(async () => (await deleteReelBlock(gone.id)).ok);
    }
  };

  /**
   * A shot with no words — one video, one caption. A whole reel of these is a
   * trend reel, which is a first-class thing here and not an edge case.
   *
   * It carries no sound of its OWN: `emptyBlock` starts a cutaway at «голос
   * продовжується поверх», which is right when a cutaway interrupts talking and
   * wrong here, where there is no voice to continue. Leaving it null lets the
   * reel's own sound cover it, stated once instead of on all ten clips.
   */
  const addSilentCard = () => {
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
    const blockId = activeId;
    if (!blockId || !selection) return;
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;

    const overlay = overlayForSelection(
      nanoid(10),
      kind,
      block.spoken ?? '',
      selection.start,
      selection.end,
    );
    patchBlock(blockId, { overlays: [...block.overlays, overlay] }, 'overlays');
    setSelection(null);
    setOpenOverlay({ blockId, overlayId: overlay.id });
  };

  const changeOverlay = (patch: Partial<Overlay>) => {
    if (!openOverlay) return;
    const block = blocks.find((b) => b.id === openOverlay.blockId);
    if (!block) return;
    patchBlock(
      block.id,
      {
        overlays: block.overlays.map((o) =>
          o.id === openOverlay.overlayId ? { ...o, ...patch } : o,
        ),
      },
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

  const activeOverlay =
    openOverlay
      ? (blocks
          .find((b) => b.id === openOverlay.blockId)
          ?.overlays.find((o) => o.id === openOverlay.overlayId) ?? null)
      : null;

  // ── header ────────────────────────────────────────────────────────────────

  const seconds = useMemo(() => estimateSeconds(blocks), [blocks]);
  const hasContent = useMemo(
    () => blocks.some((b) => (b.spoken ?? '').trim() || b.clips.length > 0 || b.overlays.length > 0),
    [blocks],
  );
  const overlayCount = useMemo(
    () => blocks.reduce((n, b) => n + b.overlays.length, 0),
    [blocks],
  );
  const label = saveLabel(saveState, everSaved);

  const rename = async (next: string) => {
    const previous = project.name;
    setProject((p) => ({ ...p, name: next }));
    const res = await updateProjectName(project.id, next);
    if (!res.ok) setProject((p) => ({ ...p, name: previous }));
  };

  return (
    <div className="app-canvas">
      {/* Bottom padding clears the fixed action bar — the script's last line
          must never sit under it. */}
      <div className="mx-auto max-w-[680px] px-4 pb-44 pt-4">
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

        <div className={view === 'scenes' ? 'flex flex-col gap-3' : 'flex flex-col gap-1'}>
          {blocks.map((block, i) =>
            // A clip block is a shot, not a sentence — it gets the card, which
            // asks what is on screen instead of what is said.
            block.kind === 'broll' ? (
              <ClipCard
                key={block.id}
                block={block}
                index={i + 1}
                reelId={project.id}
                canMoveUp={i > 0}
                canMoveDown={i < blocks.length - 1}
                onChangeClip={(patch) => patchClip(block.id, patch)}
                onMove={(d) => handleMove(block.id, d)}
                onDelete={() => handleDelete(block.id)}
              />
            ) : (
            <ParagraphRow
              key={block.id}
              block={block}
              index={i + 1}
              numbered={view === 'scenes'}
              autoFocus={focusId === block.id}
              caretAt={focusId === block.id ? caretAt : null}
              placeholder={i === 0 ? 'Що ти скажеш…' : undefined}
              canMoveUp={i > 0}
              canMoveDown={i < blocks.length - 1}
              active={activeId === block.id}
              onChange={(spoken) => handleChange(block.id, spoken)}
              onSelectionChange={(sel) => {
                setActiveId(block.id);
                setSelection(sel);
              }}
              onSplit={(at) => handleSplit(block.id, at)}
              onJoinUp={() => handleJoinUp(block.id)}
              onMove={(d) => handleMove(block.id, d)}
              onDelete={() => handleDelete(block.id)}
              onOpenOverlay={(overlayId) => setOpenOverlay({ blockId: block.id, overlayId })}
              onFocus={() => setActiveId(block.id)}
            />
            ),
          )}
        </div>

        {/* An empty reel is a blank note, not a form. The dashed box is an
            instruction to do something before there is anything to do it to,
            so it appears only once the reel has content. */}
        {hasContent ? (
          <button
            type="button"
            onClick={addSilentCard}
            className="mt-4 w-full rounded-[14px] border-2 border-dashed border-[color:var(--border)] px-4 py-4 text-[14px] font-medium text-[color:var(--text-muted)]"
          >
            + Кадр без слів
          </button>
        ) : null}
      </div>

      {/* Selection bar — rises above the action bar, on the keyboard, because
          that is where her thumb already is when a phrase is selected. */}
      {selection ? (
        <div
          data-testid="attach-bar"
          className="fixed inset-x-3 bottom-[86px] z-[60] flex gap-1 rounded-[16px] bg-[#14151F] p-1.5 shadow-[0_18px_50px_rgba(20,21,31,0.32)]"
        >
          {OFFERED_OVERLAY_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              data-kind={kind}
              // The textarea must keep its selection while this is tapped.
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onClick={() => attach(kind)}
              className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-[12px] py-1.5 text-[11px] font-semibold text-white/90 active:bg-white/15"
            >
              <span aria-hidden className="text-[15px] leading-none">
                {overlayStyle(kind).glyph}
              </span>
              {overlayStyle(kind).label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[color:var(--border)] bg-[color:var(--surface1)] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto flex max-w-[680px] gap-1.5">
          <BarButton
            active={view === 'scenes'}
            label={view === 'scenes' ? 'Суцільно' : 'По сценах'}
            onClick={() => setView((v) => (v === 'scenes' ? 'yap' : 'scenes'))}
          >
            <Layers className="h-4 w-4" />
          </BarButton>
          <BarButton label="Чистий текст" onClick={() => setShowScript(true)}>
            <Captions className="h-4 w-4" />
          </BarButton>
          <BarButton label="Що поверх" onClick={() => setShowOverlays(true)}>
            <ListChecks className="h-4 w-4" />
          </BarButton>
          <BarButton label="Кадр" onClick={addSilentCard}>
            <Plus className="h-4 w-4" />
          </BarButton>
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
      <CleanScriptSheet open={showScript} blocks={blocks} onClose={() => setShowScript(false)} />
      <OverlayListSheet
        open={showOverlays}
        blocks={blocks}
        onClose={() => setShowOverlays(false)}
      />
    </div>
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

function BarButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-[12px] px-1 py-1.5 text-[11px] font-semibold"
      style={{
        backgroundColor: active ? 'var(--background)' : 'transparent',
        color: active ? 'var(--foreground)' : 'var(--text-muted)',
        boxShadow: active ? 'var(--elev-1)' : undefined,
      }}
    >
      {children}
      {label}
    </button>
  );
}
