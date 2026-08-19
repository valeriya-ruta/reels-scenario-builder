'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { Check, Copy, Link2, Loader2, MoreHorizontal, Sparkles, Undo2 } from 'lucide-react';
import EditorTopBar from '@/components/ui/EditorTopBar';
import StatusPill from '@/components/content/StatusPill';
import ScheduleChip from '@/components/content/ScheduleChip';
import NoteEditor from '@/components/reels/NoteEditor';
import ClipCard from '@/components/reels/ClipCard';
import AttachSheet from '@/components/reels/AttachSheet';
import CleanScriptSheet from '@/components/reels/CleanScriptSheet';
import OverlayListSheet from '@/components/reels/OverlayListSheet';
import ReelMoreSheet from '@/components/reels/ReelMoreSheet';
import ReferenceSheet from '@/components/reels/ReferenceSheet';
import MicButton, { type MicHandle } from '@/components/reels/MicButton';
import { updateProjectName } from '@/app/actions';
import {
  createReelBlock,
  deleteReelBlock,
  keepTranscript,
  rewriteReel,
  saveReelMeta,
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
import { insertAt, mergeBlockText, overlayForSelection } from '@/lib/reels/edit';
import {
  canUndo,
  pushSnapshot,
  shouldCheckpoint,
  undo as stepBack,
  type Snapshot,
} from '@/lib/reels/history';
import { OFFERED_OVERLAY_KINDS, overlayStyle } from '@/lib/reels/overlayStyle';
import { useKeyboardInset } from '@/lib/ui/keyboardInset';
import type { Project } from '@/lib/domain';

/**
 * A reel is a note.
 *
 * One page of text with a mic — the way the idea actually gets captured today,
 * in Apple Notes or a message to yourself. The difference is that this note
 * writes its own lists.
 *
 * THE TEXT IS ONE FIELD. Blocks are still the model (the shot list, the edit
 * list and the timecodes are derived from them) but the whole spoken script
 * lives in a single block, and paragraphs are blank lines inside it. One field
 * per paragraph was tried and was wrong in the way that matters: a selection
 * could not cross a blank line, so «shorten this bit» stopped at the paragraph
 * break. Clip cards — the wordless shots of a trend reel — are separate blocks
 * after it.
 *
 * ONE toolbar that changes rather than multiplying, offset by the keyboard's
 * height so it rides on top of the keys (useKeyboardInset). Pinned to the page
 * bottom it sat UNDERNEATH them, which made selecting a phrase look like it did
 * nothing.
 */

const SAVE_DELAY_MS = 600;

const DRAFT = 'draft:';
const isDraft = (id: string) => id.startsWith(DRAFT);
const draftId = () => `${DRAFT}${nanoid(8)}`;

type Busy = null | 'reel' | 'shorter' | 'longer';

/**
 * Fold every spoken block into one.
 *
 * Reels written before the note was a single field arrive as several blocks,
 * and so does anything the AI import paths still create. Joining is lossless —
 * `mergeBlockText` re-bases each attachment's anchor as the text moves — and it
 * happens on open so there is never a note whose halves cannot be selected
 * across.
 */
function foldToNote(blocks: ReelBlock[], projectId: string): { note: ReelBlock; clips: ReelBlock[]; merged: ReelBlock[] } {
  const spoken = blocks.filter((b) => b.kind !== 'broll');
  const clips = blocks.filter((b) => b.kind === 'broll');

  if (spoken.length === 0) {
    return { note: emptyBlock('talk', projectId, 0, draftId()), clips, merged: [] };
  }

  let note = { ...spoken[0], orderIndex: 0 };
  for (const next of spoken.slice(1)) {
    // A blank line between blocks: they were separate paragraphs.
    const withGap = { spoken: `${(note.spoken ?? '').trim()}\n\n`, overlays: note.overlays };
    const joined = mergeBlockText(withGap, next);
    note = { ...note, spoken: joined.spoken, overlays: joined.overlays };
  }

  return { note, clips, merged: spoken.slice(1) };
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
  const folded = useMemo(
    () => foldToNote(initialBlocks, initialProject.id),
    [initialBlocks, initialProject.id],
  );

  const [project, setProject] = useState(initialProject);
  const [note, setNote] = useState<ReelBlock>(folded.note);
  const [clips, setClips] = useState<ReelBlock[]>(folded.clips);
  const [caretAt, setCaretAt] = useState<number | null>(null);
  const [caret, setCaret] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [openOverlayId, setOpenOverlayId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'more' | 'script' | 'overlays' | 'reference'>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(
    initialProject.reference_url ?? null,
  );
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rawDump, setRawDump] = useState<string | null>(initialProject.raw_dump ?? null);
  const [saveState, setSaveState] = useState<SaveQueueState>({ pending: 0, inFlight: 0, failed: false });
  const [everSaved, setEverSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  /**
   * Every state worth getting back to.
   *
   * She selected what she thought was one paragraph, the handles took two, and
   * both went with no way to return. A React-controlled textarea has no native
   * undo — every keystroke replaces the value — and a phone has no Ctrl+Z.
   */
  const [history, setHistory] = useState<Snapshot[]>([]);

  const keyboard = useKeyboardInset();
  const micRef = useRef<MicHandle>(null);
  /** Where dictation started, so the preview grows from there. */
  const dictationBase = useRef<{ text: string; at: number } | null>(null);

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

  // Blocks folded away on open are removed once, so the next open does not have
  // to fold again — and their text is already inside the note by then.
  const foldedAway = useRef(folded.merged);
  useEffect(() => {
    const extra = foldedAway.current.filter((b) => !isDraft(b.id));
    if (extra.length === 0) return;
    foldedAway.current = [];
    queue.now(async () => {
      for (const b of extra) await deleteReelBlock(b.id);
      return true;
    });
  }, [queue]);

  const noteIdRef = useRef<Promise<string | null> | null>(null);
  const realNoteId = useCallback(
    async (current: ReelBlock): Promise<string | null> => {
      if (!isDraft(current.id)) return current.id;
      if (noteIdRef.current) return noteIdRef.current;
      const create = createReelBlock(project.id, 0, 'talk', {
        spoken: current.spoken,
        overlays: current.overlays,
      }).then((res) => {
        if (!res.ok) return null;
        setNote((n) => (isDraft(n.id) ? { ...n, id: res.data.id } : n));
        return res.data.id;
      });
      noteIdRef.current = create;
      return create;
    },
    [project.id],
  );

  const saveNote = useCallback(
    (next: ReelBlock) => {
      queue.schedule(`note:${next.id}`, async () => {
        const id = await realNoteId(next);
        if (!id) return false;
        const res = await updateReelBlock(id, {
          spoken: next.spoken,
          overlays: next.overlays,
        });
        return res.ok;
      });
    },
    [queue, realNoteId],
  );

  const applyNote = useCallback(
    (patch: Partial<ReelBlock>) => {
      setNote((prev) => {
        const next = { ...prev, ...patch };
        if (typeof patch.spoken === 'string' && patch.spoken !== (prev.spoken ?? '')) {
          const now = Date.now();
          setHistory((h) =>
            shouldCheckpoint(h[h.length - 1], patch.spoken as string, now)
              ? pushSnapshot(h, { text: prev.spoken ?? '', overlays: prev.overlays, at: now })
              : h,
          );
        }
        saveNote(next);
        return next;
      });
    },
    [saveNote],
  );

  /** One step back, whatever took the text away — a delete, a paste, a rewrite. */
  const undoEdit = () => {
    const stepped = stepBack(history, text);
    if (!stepped) return;
    setHistory(stepped.history);
    applyNote({ spoken: stepped.restored.text, overlays: stepped.restored.overlays });
  };

  const text = note.spoken ?? '';

  // ── dictation ─────────────────────────────────────────────────────────────

  const onRecordingChange = useCallback(
    (recording: boolean) => {
      if (recording) {
        dictationBase.current = { text: note.spoken ?? '', at: selection?.start ?? caret };
        setPreview(note.spoken ?? '');
      } else {
        // Keep the preview until the real transcript lands — clearing it here
        // would blank the words she just watched appear.
      }
    },
    [note.spoken, selection, caret],
  );

  /** The running transcript, growing segment by segment while she talks. */
  const onInterim = useCallback((heard: string) => {
    const base = dictationBase.current;
    if (!base) return;
    setPreview(insertAt(base.text, base.at, heard).text);
  }, []);

  /** The take is over. What is on screen becomes what is saved. */
  const onFinal = useCallback(
    (piece: string) => {
      const base = dictationBase.current;
      dictationBase.current = null;
      setPreview(null);
      if (!base || !piece.trim()) return;

      // The transcript is filed and linked to this reel before it is edited at
      // all — it is the source every other format should be derived from, and
      // the copy no button on this screen can overwrite.
      void keepTranscript(project.id, piece.trim());

      const result = insertAt(base.text, base.at, piece.trim(), note.overlays);
      setCaretAt(result.caret);
      applyNote({ spoken: result.text, overlays: result.overlays });
    },
    [applyNote, note.overlays, project.id],
  );

  // ── the AI buttons ────────────────────────────────────────────────────────

  /**
   * Every rewrite keeps what it replaced.
   *
   * The first version of this overwrote the note in place with nothing kept
   * anywhere, and turned several minutes of spoken argument into three generic
   * lines that could not be undone. The dump is written to the reel BEFORE a
   * single word on screen changes, so «Повернути» is always available and
   * survives a reload.
   */
  const keepDump = (before: string) => {
    setRawDump(before);
    // Also on the undo stack: «Скасувати» must take back a rewrite as readily
    // as a delete. `raw_dump` is the copy that survives a reload; this is the
    // one that survives a tap.
    setHistory((h) => pushSnapshot(h, { text: before, overlays: note.overlays, at: Date.now() }));
    queue.now(async () => (await saveReelMeta(project.id, { rawDump: before })).ok);
  };

  const makeReel = async () => {
    if (busy || !text.trim()) {
      if (!text.trim()) setError('Спочатку напиши або наговори щось.');
      return;
    }
    setBusy('reel');
    setError(null);
    const before = text;
    const res = await rewriteReel(before, 'reel');
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    keepDump(before);
    applyNote({ spoken: res.data.text });
    if (res.data.title) {
      setProject((p) => ({ ...p, name: res.data.title! }));
      queue.now(async () => (await updateProjectName(project.id, res.data.title!)).ok);
    }
  };

  const resize = async (mode: 'shorter' | 'longer') => {
    if (busy) return;
    const scoped = selection ? text.slice(selection.start, selection.end) : '';
    const source = scoped.trim() || text;
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

    keepDump(text);

    if (scoped.trim() && selection) {
      const replaced = text.slice(0, selection.start) + res.data.text + text.slice(selection.end);
      const shift = res.data.text.length - (selection.end - selection.start);
      applyNote({
        spoken: replaced,
        overlays: note.overlays.map((o) =>
          o.anchorStart >= selection.end ? { ...o, anchorStart: o.anchorStart + shift } : o,
        ),
      });
      setSelection(null);
      return;
    }
    applyNote({ spoken: res.data.text });
  };

  const undo = () => {
    if (!rawDump) return;
    applyNote({ spoken: rawDump });
    setRawDump(null);
    queue.now(async () => (await saveReelMeta(project.id, { rawDump: null })).ok);
  };

  const applyReferenceText = (incoming: string) => {
    keepDump(text);
    applyNote({ spoken: incoming.trim() });
  };

  // ── attachments and clips ─────────────────────────────────────────────────

  const attach = (kind: OverlayKind) => {
    if (!selection) return;
    const overlay = overlayForSelection(nanoid(10), kind, text, selection.start, selection.end);
    applyNote({ overlays: [...note.overlays, overlay] });
    setSelection(null);
    setOpenOverlayId(overlay.id);
  };

  const changeOverlay = (patch: Partial<Overlay>) => {
    if (!openOverlayId) return;
    applyNote({
      overlays: note.overlays.map((o) => (o.id === openOverlayId ? { ...o, ...patch } : o)),
    });
  };

  const removeOverlay = () => {
    if (!openOverlayId) return;
    applyNote({ overlays: note.overlays.filter((o) => o.id !== openOverlayId) });
    setOpenOverlayId(null);
  };

  const addClipCard = () => {
    const card: ReelBlock = {
      ...emptyBlock('broll', project.id, clips.length + 1, draftId()),
      audioSource: null,
      clips: [{ id: nanoid(8), what: '' }],
    };
    setClips((prev) => [...prev, card]);
    queue.now(async () => {
      const res = await createReelBlock(project.id, card.orderIndex, 'broll', {
        clips: card.clips,
        audioSource: null,
      });
      if (res.ok) setClips((prev) => prev.map((c) => (c.id === card.id ? { ...c, id: res.data.id } : c)));
      return res.ok;
    });
  };

  const patchClip = (blockId: string, patch: Partial<Clip>) => {
    setClips((prev) => {
      const next = prev.map((c) =>
        c.id === blockId
          ? { ...c, clips: [{ ...(c.clips[0] ?? { id: nanoid(8), what: '' }), ...patch }] }
          : c,
      );
      const changed = next.find((c) => c.id === blockId);
      if (changed && !isDraft(changed.id)) {
        queue.schedule(`clip:${changed.id}`, async () =>
          (await updateReelBlock(changed.id, { clips: changed.clips })).ok,
        );
      }
      return next;
    });
  };

  const removeClip = (blockId: string) => {
    setClips((prev) => prev.filter((c) => c.id !== blockId));
    if (!isDraft(blockId)) queue.now(async () => (await deleteReelBlock(blockId)).ok);
  };

  // ── header ────────────────────────────────────────────────────────────────

  const allBlocks = useMemo(() => [note, ...clips], [note, clips]);
  const seconds = useMemo(() => estimateSeconds(allBlocks), [allBlocks]);
  const label = saveLabel(saveState, everSaved);
  const hasContent = text.trim().length > 0 || clips.length > 0;
  const activeOverlay = note.overlays.find((o) => o.id === openOverlayId) ?? null;

  const rename = async (next: string) => {
    const previous = project.name;
    setProject((p) => ({ ...p, name: next }));
    const res = await updateProjectName(project.id, next);
    if (!res.ok) setProject((p) => ({ ...p, name: previous }));
  };

  /**
   * The script, on the clipboard, exactly as written.
   *
   * The same text «Чистий текст» copies — one function, so the two can never
   * disagree about what «весь текст» means.
   */
  const copyScript = async () => {
    const script = text.trim();
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
    } catch {
      // Older WebViews refuse the async clipboard; the textarea route works.
      const area = document.createElement('textarea');
      area.value = script;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
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
                {note.overlays.length > 0 ? ` · ${note.overlays.length} поверх` : ''}
              </span>
              {/* The reference is an INPUT — the thing you have before you
                  write — so it sits with the reel's other properties. It was
                  under ⋯ next to the caption, which is an OUTPUT, and she went
                  looking for it there and gave up. */}
              <button
                type="button"
                data-testid="reference-chip"
                onClick={() => setSheet('reference')}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium"
                style={{
                  color: referenceUrl ? 'var(--accent)' : 'var(--text-muted)',
                  borderColor: referenceUrl ? 'var(--accent)' : 'var(--border)',
                }}
              >
                <Link2 className="h-3.5 w-3.5" />
                Референс
              </button>
              <SaveChip label={label} />
            </>
          }
        />

        {/* Copy is the app's ENTIRE handoff to the camera, and it was buried
            behind ⋯ where she went looking for it and gave up. It sits on the
            page, next to the text it copies. */}
        {hasContent ? (
          <button
            type="button"
            data-testid="copy-inline"
            onClick={() => void copyScript()}
            className="mb-3 mr-2 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 text-[12.5px] font-semibold text-[color:var(--foreground)]"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Скопійовано' : 'Скопіювати текст'}
          </button>
        ) : null}

        {canUndo(history, text) ? (
          <button
            type="button"
            data-testid="undo-edit"
            onClick={undoEdit}
            className="mb-3 mr-2 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 text-[12.5px] font-semibold text-[color:var(--foreground)]"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Скасувати
          </button>
        ) : null}

        {/* «Повернути» stays until she dismisses it by using it. A rewrite she
            did not want is only a mistake if it cannot be taken back. */}
        {rawDump ? (
          <button
            type="button"
            data-testid="undo-rewrite"
            onClick={undo}
            className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 text-[12.5px] font-semibold text-[color:var(--foreground)]"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Повернути те, що я наговорила
          </button>
        ) : null}

        <div>
          <NoteEditor
            text={text}
            overlays={note.overlays}
            previewText={preview}
            readOnly={busy !== null}
            rewriting={busy !== null}
            caretAt={caretAt}
            // The placeholder IS the onboarding. Three cards saying «tap the
            // mic», floating above a toolbar that contains the mic, taught
            // nothing and covered the text she was trying to type into.
            placeholder="Тисни мікрофон і розкажи. Або просто пиши тут."
            onChange={(next) => applyNote({ spoken: next })}
            onSelectionChange={setSelection}
            onCaretChange={setCaret}
            onOpenOverlay={setOpenOverlayId}
          />
        </div>

        {clips.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3">
            {clips.map((clip, i) => (
              <ClipCard
                key={clip.id}
                block={clip}
                index={i + 1}
                reelId={project.id}
                canMoveUp={false}
                canMoveDown={false}
                onChangeClip={(patch) => patchClip(clip.id, patch)}
                onMove={() => {}}
                onDelete={() => removeClip(clip.id)}
              />
            ))}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      <div
        data-testid="reel-toolbar"
        className="fixed inset-x-0 z-50 border-t border-[color:var(--border)] bg-[color:var(--surface1)] px-2 py-2"
        style={{ bottom: keyboard }}
      >
        <div className="mx-auto flex max-w-[680px] items-center gap-1.5">
          {selection && busy === null ? (
            <>
              {/* The glyph alone was unreadable: she looked at 🔊 and could
                  not tell whether it meant «звук» or something else entirely.
                  Every button says its word now. */}
              {OFFERED_OVERLAY_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  data-kind={kind}
                  aria-label={overlayStyle(kind).label}
                  onMouseDown={(e) => e.preventDefault()}
                  onTouchStart={(e) => e.preventDefault()}
                  onClick={() => attach(kind)}
                  className="flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-[12px] text-[10px] font-semibold leading-none"
                  style={{ backgroundColor: overlayStyle(kind).wash, color: overlayStyle(kind).color }}
                >
                  <span aria-hidden className="text-[15px] leading-none">
                    {overlayStyle(kind).glyph}
                  </span>
                  {overlayStyle(kind).label}
                </button>
              ))}
              <ToolButton label="Коротше" busy={busy === 'shorter'} onClick={() => void resize('shorter')} />
              <ToolButton label="Довше" busy={busy === 'longer'} onClick={() => void resize('longer')} />
            </>
          ) : (
            <>
              <MicButton
                ref={micRef}
                onInterim={onInterim}
                onDone={onFinal}
                onRecordingChange={onRecordingChange}
                onError={setError}
              />
              <button
                type="button"
                data-testid="make-reel"
                disabled={busy !== null || !text.trim()}
                onClick={() => void makeReel()}
                className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[color:var(--accent)] text-[14px] font-semibold text-white disabled:opacity-40"
              >
                {busy === 'reel' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span className="truncate">{busy === 'reel' ? 'Переписую…' : 'Зробити рілс'}</span>
              </button>
              <button
                type="button"
                data-testid="more"
                aria-label="Ще"
                onClick={() => setSheet('more')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-[color:var(--text-secondary)]"
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
        onClose={() => setOpenOverlayId(null)}
        onChange={changeOverlay}
        onDelete={removeOverlay}
      />
      <ReelMoreSheet
        open={sheet === 'more'}
        project={project}
        script={text}
        onClose={() => setSheet(null)}
        onOpenScript={() => setSheet('script')}
        onOpenOverlays={() => setSheet('overlays')}
        onAddClip={() => {
          setSheet(null);
          addClipCard();
        }}
      />
      <ReferenceSheet
        open={sheet === 'reference'}
        projectId={project.id}
        initialUrl={referenceUrl}
        hasWriting={text.trim().length > 0}
        onClose={() => setSheet(null)}
        onText={applyReferenceText}
        onUrlChange={setReferenceUrl}
      />
      <CleanScriptSheet open={sheet === 'script'} blocks={allBlocks} onClose={() => setSheet(null)} />
      <OverlayListSheet open={sheet === 'overlays'} blocks={allBlocks} onClose={() => setSheet(null)} />
    </div>
  );
}

function ToolButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid={`tool-${label}`}
      // Tapping must not take the selection away — it is what the button acts on.
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
