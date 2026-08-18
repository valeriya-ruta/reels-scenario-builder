'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Check, Clapperboard, FileText, Loader2, Plus, Sparkles, TriangleAlert } from 'lucide-react';
import EditorTopBar from '@/components/ui/EditorTopBar';
import ScheduleChip from '@/components/content/ScheduleChip';
import StatusPill from '@/components/content/StatusPill';
import BlockCard from '@/components/reels/BlockCard';
import ReelRecipe from '@/components/reels/ReelRecipe';
import ReelShareButton from '@/components/reels/ReelShareButton';
import ReelReferences from '@/components/reels/ReelReferences';
import {
  BLOCK_HINTS,
  BLOCK_KINDS,
  BLOCK_LABELS,
  BLOCK_COLORS,
  AUDIO_LABELS,
  AUDIO_SOURCES,
  editKey,
  editList,
  estimateSeconds,
  formatDuration,
  shotKey,
  shotList,
  shotSummary,
  toRefImages,
  type AudioSource,
  type BlockKind,
  type ReelBlock,
  type RefImage,
} from '@/lib/reels/blocks';
import { REEL_PRESETS } from '@/lib/reels/presets';
import { SaveQueue, saveLabel, type SaveQueueState } from '@/lib/reels/saveQueue';
import { updateProjectName } from '@/app/actions';
import {
  addReelBlock,
  applyReelPreset,
  deleteReelBlock,
  duplicateReelBlock,
  reorderReelBlocks,
  setReelDefaultAudio,
  setReelOverview,
  setReelReferences,
  updateReelBlock,
  type BlockPatch,
} from '@/app/reel-block-actions';
import type { Project } from '@/lib/domain';

/**
 * The reel builder — a stack of blocks you mix, and three ways to read it.
 *
 * Писати (blocks) is where the reel is authored. Знімати and Монтувати are the
 * SAME blocks re-read as the two jobs that come after: what a camera has to
 * capture, and what an editor has to do. They are derived, never stored, so a
 * shot list can never drift from the script it came from — which is the whole
 * reason the client's shared page can be trusted.
 *
 * Desktop-first by request: the writing sits in a column with its add-ons in the
 * margin beside it, which is the layout the "comment on a phrase" gesture wants.
 */

type Tab = 'write' | 'shoot' | 'edit';

const SAVE_CHIP: Record<'saving' | 'saved' | 'failed', { text: string; color: string; Icon: typeof Check }> = {
  saving: { text: 'Зберігаю…', color: '#8A6D0F', Icon: Loader2 },
  saved: { text: 'Збережено', color: '#0F6B54', Icon: Check },
  failed: { text: 'НЕ збережено', color: '#B4231C', Icon: TriangleAlert },
};

/** Block → the column names the database knows. */
function toPatch(patch: Partial<ReelBlock>): BlockPatch {
  const out: BlockPatch = {};
  if ('kind' in patch) out.kind = patch.kind;
  if ('speaker' in patch) out.speaker = patch.speaker ?? null;
  if ('spoken' in patch) out.spoken = patch.spoken ?? null;
  if ('screenText' in patch) out.screen_text = patch.screenText ?? null;
  if ('recordNote' in patch) out.record_note = patch.recordNote ?? null;
  if ('assetKind' in patch) out.asset_kind = patch.assetKind ?? null;
  if ('assetNote' in patch) out.asset_note = patch.assetNote ?? null;
  if ('assetUrl' in patch) out.asset_url = patch.assetUrl ?? null;
  if ('editNote' in patch) out.edit_note = patch.editNote ?? null;
  if ('overlays' in patch) out.overlays = patch.overlays;
  if ('clips' in patch) out.clips = patch.clips;
  if ('images' in patch) out.images = patch.images;
  if ('audioSource' in patch) out.audio_source = patch.audioSource ?? null;
  return out;
}

export default function ReelBuilder({
  project,
  initialBlocks,
  shareToken = null,
  ownerProgress,
}: {
  project: Project;
  initialBlocks: ReelBlock[];
  /** Existing share link for this reel, if one was already created. */
  shareToken?: string | null;
  /**
   * What the person on the other end of the share link has already ticked off.
   * Read-only here — she tracks, she does not un-tick someone else's work.
   */
  ownerProgress?: string[];
}) {
  const [blocks, setBlocks] = useState<ReelBlock[]>(initialBlocks);
  const [tab, setTab] = useState<Tab>('write');
  const [addOpen, setAddOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [hints, setHints] = useState<Record<string, string>>({});
  // A write that fails has to SAY so. The first version swallowed every failure,
  // so when RLS silently refused the insert the button simply did nothing and
  // there was no way to tell a broken save from a slow one.
  const [error, setError] = useState<string | null>(null);

  // Every write on this screen goes through one queue, so the header can say
  // whether the reel is saved and `beforeunload` can refuse to lose an edit
  // that is still sitting in the debounce.
  const [saveState, setSaveState] = useState<SaveQueueState>({
    pending: 0,
    inFlight: 0,
    failed: false,
  });
  const [everSaved, setEverSaved] = useState(false);
  const [queue] = useState(() => new SaveQueue(600, setSaveState));
  const persist = useCallback(
    (key: string, run: () => Promise<boolean>) => {
      setEverSaved(true);
      queue.schedule(key, run);
    },
    [queue],
  );
  const track = useCallback(
    (run: () => Promise<boolean>) => {
      setEverSaved(true);
      queue.now(run);
    },
    [queue],
  );

  // Leaving the page is where the work used to go. `pagehide` and a hidden tab
  // send whatever is waiting; `beforeunload` then asks before closing if a
  // write is still in the air, because a server action cancelled mid-flight
  // never reaches the database.
  useEffect(() => {
    const flush = () => queue.flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flush();
      if (queue.busy) e.preventDefault();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      // Whatever is still waiting belongs to a screen that is going away —
      // send it rather than drop it.
      queue.flush();
    };
  }, [queue]);

  // Moving out of a field is a decision, not a pause: send it now instead of
  // waiting out a debounce she might cut short by reloading. `onBlur` in React
  // is focusout, so one handler on the wrapper covers every input below it.
  const flushOnBlur = useCallback(() => queue.flush(), [queue]);

  const label = saveLabel(saveState, everSaved);

  // The name lives here so the header shows the new one immediately; the write
  // follows and rolls back if it fails, the same as every other edit on this
  // screen.
  const [name, setName] = useState(project.name);
  const rename = useCallback(
    (next: string) => {
      const previous = name;
      setName(next);
      track(() =>
        updateProjectName(project.id, next).then((res) => {
          if (!res.ok) {
            setName(previous);
            setError('Не вдалося змінити назву.');
          }
          return res.ok;
        }),
      );
    },
    [name, project.id, track],
  );

  // The reel's own sound. A trend belongs to the whole reel far more often than
  // to one block, and setting it eight times is both tedious and why the edit
  // list used to repeat it on every line.
  const [reelAudio, setReelAudio] = useState<AudioSource | null>(
    (project.default_audio_source as AudioSource | null) ?? null,
  );
  const changeReelAudio = useCallback(
    (next: AudioSource | null) => {
      const previous = reelAudio;
      setReelAudio(next);
      track(() =>
        setReelDefaultAudio(project.id, next).then((res) => {
          if (!res.ok) {
            setReelAudio(previous);
            setError('Не вдалося зберегти звук рілса.');
          }
          return res.ok;
        }),
      );
    },
    [project.id, reelAudio, track],
  );

  // «Про що цей рілс» — the brief. The storyboard says what happens beat by
  // beat, which is not the same as knowing what the reel IS; for a purely
  // edited video nothing carried the idea at all.
  const [overview, setOverview] = useState(project.overview ?? '');
  const saveOverview = useCallback(
    (next: string) => {
      setOverview(next);
      persist('overview', () =>
        setReelOverview(project.id, next).then((res) => {
          if (!res.ok) setError('Не вдалося зберегти опис.');
          return res.ok;
        }),
      );
    },
    [persist, project.id],
  );

  // References for the whole reel, kept next to the brief: «отак має виглядати
  // рілс» has no single block to hang off.
  const [references, setReferences] = useState<RefImage[]>(() =>
    toRefImages(project.reference_media),
  );
  const saveReferences = useCallback(
    (next: RefImage[]) => {
      const previous = references;
      setReferences(next);
      track(() =>
        setReelReferences(project.id, next).then((res) => {
          if (!res.ok) {
            setReferences(previous);
            setError('Не вдалося зберегти референси.');
          }
          return res.ok;
        }),
      );
    },
    [project.id, references, track],
  );

  const duplicate = useCallback(
    (id: string) => {
      track(() =>
        duplicateReelBlock(id).then((res) => {
          if (!res.ok) {
            setError('Не вдалося дублювати блок. Онови сторінку.');
            return false;
          }
          setBlocks((prev) => {
            const at = prev.findIndex((b) => b.id === id);
            const next = [...prev];
            next.splice(at < 0 ? prev.length : at + 1, 0, res.block);
            return next;
          });
          return true;
        }),
      );
    },
    [track],
  );

  const done = useMemo(() => new Set(ownerProgress ?? []), [ownerProgress]);
  // How far along the other side is, counted against THIS tab's list — a shot
  // count that included edits would read as progress she hasn't got.
  const tabProgress = useMemo(() => {
    if (done.size === 0) return null;
    const keys =
      tab === 'shoot'
        ? shotList(blocks).map(shotKey)
        : tab === 'edit'
          ? editList(blocks, reelAudio).map(editKey)
          : [];
    if (keys.length === 0) return null;
    return { finished: keys.filter((k) => done.has(k)).length, total: keys.length };
  }, [blocks, done, tab, reelAudio]);
  const seconds = useMemo(() => estimateSeconds(blocks), [blocks]);
  const shots = useMemo(() => shotSummary(blocks), [blocks]);

  const patchBlock = useCallback(
    (id: string, patch: Partial<ReelBlock>) => {
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
      // Keyed by block AND field, so editing the text does not cancel the write
      // of an overlay attached a moment earlier.
      persist(`${id}:${Object.keys(patch).join(',')}`, () =>
        updateReelBlock(id, toPatch(patch)).then((res) => {
          if (!res.ok) setError('Не вдалося зберегти. Онови сторінку.');
          return res.ok;
        }),
      );
    },
    [persist],
  );

  const add = useCallback(
    (kind: BlockKind) => {
      setAddOpen(false);
      const orderIndex = blocks.length;
      track(() =>
        addReelBlock(project.id, kind, orderIndex).then((res) => {
          if (res.ok) setBlocks((prev) => [...prev, res.block]);
          else setError('Не вдалося додати блок. Онови сторінку.');
          return res.ok;
        }),
      );
    },
    [blocks.length, project.id, track],
  );

  const remove = useCallback(
    (id: string) => {
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      track(() => deleteReelBlock(id).then((res) => res.ok));
    },
    [track],
  );

  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      const from = blocks.findIndex((b) => b.id === id);
      const to = from + dir;
      if (from < 0 || to < 0 || to >= blocks.length) return;
      const next = [...blocks];
      [next[from], next[to]] = [next[to], next[from]];
      setBlocks(next);
      track(() =>
        reorderReelBlocks(
          project.id,
          next.map((b) => b.id),
        ).then((res) => res.ok),
      );
    },
    [blocks, project.id, track],
  );

  const applyPreset = useCallback(
    (presetId: string) => {
      setPresetOpen(false);
      const preset = REEL_PRESETS.find((p) => p.id === presetId);
      track(() =>
        applyReelPreset(project.id, presetId).then((res) => {
          if (!res.ok) {
            setError('Не вдалося додати форму. Онови сторінку.');
            return false;
          }
          setBlocks((prev) => [...prev, ...res.blocks]);
          // The preset's per-block prompts become placeholders — an empty
          // preset should read as instructions, not a column of blank boxes.
          if (preset) {
            setHints((prev) => {
              const next = { ...prev };
              res.blocks.forEach((b, i) => {
                const h = preset.blocks[i]?.hint;
                if (h) next[b.id] = h;
              });
              return next;
            });
          }
          return true;
        }),
      );
    },
    [project.id, track],
  );

  const tabs: { id: Tab; label: string; Icon: typeof FileText }[] = [
    { id: 'write', label: 'Сценарій', Icon: FileText },
    { id: 'shoot', label: 'Що знімаємо', Icon: Camera },
    { id: 'edit', label: 'Як іде рілс', Icon: Clapperboard },
  ];

  return (
    <div className="app-canvas min-h-screen">
      {error && (
        <div
          role="status"
          data-testid="reel-error"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          {error}
          <button
            type="button"
            onClick={() => {
              setError(null);
              queue.clearFailed();
            }}
            aria-label="Закрити"
            className="cursor-pointer opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      <div className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-5" onBlur={flushOnBlur}>
        <EditorTopBar
          backHref="/projects"
          title={name}
          onRename={rename}
          kind="reel"
          trailing={<ReelShareButton reelId={project.id} initialToken={shareToken} />}
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill refTable="projects" id={project.id} type="reel" initialStatus={project.status ?? 'idea'} />
              <ScheduleChip refTable="projects" id={project.id} initialDate={project.scheduled_date ?? null} />

              {/* Set once for the reel; a block can still say otherwise. */}
              {/* Whether it is safe to close the tab. The reel used to give no
                  answer at all, so a reload a second after the last keystroke
                  threw that keystroke away with nothing to see. */}
              {label !== 'idle' && (
                <span
                  data-testid="save-state"
                  data-state={label}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                  style={{
                    color: SAVE_CHIP[label].color,
                    backgroundColor: `${SAVE_CHIP[label].color}14`,
                  }}
                >
                  {(() => {
                    const { Icon } = SAVE_CHIP[label];
                    return (
                      <Icon
                        className={`h-3.5 w-3.5 ${label === 'saving' ? 'animate-spin' : ''}`}
                        strokeWidth={2.4}
                      />
                    );
                  })()}
                  {SAVE_CHIP[label].text}
                </span>
              )}

              <label className="flex items-center gap-1.5 rounded-[12px] border border-[color:var(--border)] px-2.5 py-1.5 text-[12.5px] text-[color:var(--text-muted)]">
                Звук рілса
                <select
                  value={reelAudio ?? ''}
                  onChange={(e) =>
                    changeReelAudio((e.target.value || null) as AudioSource | null)
                  }
                  data-testid="reel-audio"
                  className="cursor-pointer bg-transparent font-semibold text-[color:var(--foreground)] outline-none"
                >
                  <option value="">за блоками</option>
                  {AUDIO_SOURCES.map((a) => (
                    <option key={a} value={a}>
                      {AUDIO_LABELS[a]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          }
        />

        <p className="mb-4 px-1 text-[12.5px] font-medium text-[color:var(--text-muted)]">
          {blocks.length} {blocks.length === 1 ? 'блок' : 'блоків'} · ~{formatDuration(seconds)}
          {shots ? ` · ${shots}` : ''}
        </p>

        <div className="mb-4">
          <label
            htmlFor="reel-overview"
            className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--text-muted)]"
          >
            Про що цей рілс
          </label>
          <textarea
            id="reel-overview"
            value={overview}
            onChange={(e) => saveOverview(e.target.value)}
            rows={2}
            maxLength={2000}
            data-testid="reel-overview"
            placeholder="Загальна ідея — що це за рілс, який настрій, що людина має відчути. Це перше, що прочитає той, хто монтує."
            className="w-full resize-y rounded-[12px] border border-[color:var(--border)] bg-[color:var(--background)] px-3.5 py-2.5 text-[14px] leading-relaxed text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--border-strong)]"
          />
        </div>

        <ReelReferences reelId={project.id} references={references} onChange={saveReferences} />

        <div
          role="tablist"
          className="mb-5 flex w-fit gap-1 rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface1)] p-1"
        >
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`reel-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className="flex cursor-pointer items-center gap-2 rounded-[10px] px-4 py-2 text-[13.5px] font-semibold transition-colors"
                style={{
                  backgroundColor: active ? 'var(--background)' : 'transparent',
                  boxShadow: active ? 'var(--elev-1)' : undefined,
                  color: active ? 'var(--foreground)' : 'var(--text-muted)',
                }}
              >
                <t.Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.9} />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'write' ? (
          <>
            <div className="flex flex-col gap-3">
              {blocks.map((b, i) => (
                <BlockCard
                  key={b.id}
                  block={b}
                  index={i}
                  total={blocks.length}
                  hint={hints[b.id]}
                  reelAudio={reelAudio}
                  onPatch={(patch) => patchBlock(b.id, patch)}
                  onDuplicate={() => duplicate(b.id)}
                  onDelete={() => remove(b.id)}
                  onMove={(dir) => move(b.id, dir)}
                />
              ))}
            </div>

            {blocks.length === 0 && (
              <div className="rounded-[16px] border border-dashed border-[color:var(--border)] px-6 py-10 text-center">
                <p className="text-[15px] font-semibold text-[color:var(--foreground)]">
                  Порожній рілс
                </p>
                <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-[color:var(--text-muted)]">
                  Візьми готову форму — говорилку, діалог чи тренд — або збери свою з блоків.
                </p>
              </div>
            )}

            {/* Add + presets, in the flow of the stack rather than in a toolbar:
                you add a block where the reel ends, which is where you are. */}
            <div className="relative mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddOpen((v) => !v);
                  setPresetOpen(false);
                }}
                data-testid="add-block"
                className="flex cursor-pointer items-center gap-2 rounded-[12px] border-2 border-dashed border-[color:var(--border)] px-4 py-2.5 text-[13.5px] font-semibold text-zinc-600 transition-colors hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface1)]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.4} />
                Блок
              </button>

              <button
                type="button"
                onClick={() => {
                  setPresetOpen((v) => !v);
                  setAddOpen(false);
                }}
                data-testid="add-preset"
                className="flex cursor-pointer items-center gap-2 rounded-[12px] border-2 border-dashed border-[color:var(--border)] px-4 py-2.5 text-[13.5px] font-semibold text-zinc-600 transition-colors hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface1)]"
              >
                <Sparkles className="h-4 w-4" strokeWidth={2.2} />
                Готова форма
              </button>

              {addOpen && (
                <div className="absolute left-0 top-full z-20 mt-2 w-[320px] rounded-[14px] border border-[color:var(--border)] bg-white p-1.5 shadow-[var(--elev-3)]">
                  {BLOCK_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => add(k)}
                      data-testid={`add-block-${k}`}
                      className="flex w-full cursor-pointer items-start gap-2.5 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-[color:var(--surface1)]"
                    >
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: BLOCK_COLORS[k] }}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold text-[color:var(--foreground)]">
                          {BLOCK_LABELS[k]}
                        </span>
                        <span className="block text-[12px] text-[color:var(--text-muted)]">
                          {BLOCK_HINTS[k]}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {presetOpen && (
                <div className="absolute left-0 top-full z-20 mt-2 w-[380px] rounded-[14px] border border-[color:var(--border)] bg-white p-1.5 shadow-[var(--elev-3)]">
                  {REEL_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      data-testid={`preset-${p.id}`}
                      className="flex w-full cursor-pointer flex-col gap-0.5 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-[color:var(--surface1)]"
                    >
                      <span className="text-[13.5px] font-semibold text-[color:var(--foreground)]">
                        {p.label}
                        <span className="ml-1.5 text-[11.5px] font-medium text-[color:var(--text-muted)]">
                          {p.blocks.length} блоків
                        </span>
                      </span>
                      <span className="text-[12px] text-[color:var(--text-muted)]">{p.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* What she came here to see: how much of it is already done on the
                other side of the share link. */}
            {tabProgress && (
              <p
                data-testid="owner-progress"
                className="mb-3 rounded-[12px] border px-3.5 py-2 text-[12.5px] font-semibold"
                style={{ borderColor: '#0F8A6A55', backgroundColor: '#0F8A6A12', color: '#0F6B54' }}
              >
                {tab === 'shoot' ? 'Знято' : 'Змонтовано'}: {tabProgress.finished} з{' '}
                {tabProgress.total}
              </p>
            )}
            <ReelRecipe
              blocks={blocks}
              only={tab === 'shoot' ? 'shoot' : 'edit'}
              done={done}
              reelAudio={reelAudio}
              overview={tab === 'edit' ? overview : null}
              references={tab === 'edit' ? references : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}
