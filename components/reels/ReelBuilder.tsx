'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Camera, Clapperboard, FileText, Plus, Sparkles } from 'lucide-react';
import EditorTopBar from '@/components/ui/EditorTopBar';
import ScheduleChip from '@/components/content/ScheduleChip';
import StatusPill from '@/components/content/StatusPill';
import BlockCard from '@/components/reels/BlockCard';
import ReelRecipe from '@/components/reels/ReelRecipe';
import ReelShareButton from '@/components/reels/ReelShareButton';
import {
  BLOCK_HINTS,
  BLOCK_KINDS,
  BLOCK_LABELS,
  BLOCK_COLORS,
  estimateSeconds,
  formatDuration,
  shotSummary,
  type BlockKind,
  type ReelBlock,
} from '@/lib/reels/blocks';
import { REEL_PRESETS } from '@/lib/reels/presets';
import {
  addReelBlock,
  applyReelPreset,
  deleteReelBlock,
  reorderReelBlocks,
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

/** Debounced field writes: typing must not fire a request per keystroke. */
function useDebouncedPersist() {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  return useCallback((key: string, run: () => void) => {
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    timers.current.set(key, setTimeout(run, 600));
  }, []);
}

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
  if ('audioSource' in patch) out.audio_source = patch.audioSource ?? null;
  return out;
}

export default function ReelBuilder({
  project,
  initialBlocks,
  shareToken = null,
}: {
  project: Project;
  initialBlocks: ReelBlock[];
  /** Existing share link for this reel, if one was already created. */
  shareToken?: string | null;
}) {
  const [blocks, setBlocks] = useState<ReelBlock[]>(initialBlocks);
  const [tab, setTab] = useState<Tab>('write');
  const [addOpen, setAddOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [hints, setHints] = useState<Record<string, string>>({});
  const persist = useDebouncedPersist();

  const seconds = useMemo(() => estimateSeconds(blocks), [blocks]);
  const shots = useMemo(() => shotSummary(blocks), [blocks]);

  const patchBlock = useCallback(
    (id: string, patch: Partial<ReelBlock>) => {
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
      // Keyed by block AND field, so editing the text does not cancel the write
      // of an overlay attached a moment earlier.
      persist(`${id}:${Object.keys(patch).join(',')}`, () => {
        void updateReelBlock(id, toPatch(patch));
      });
    },
    [persist],
  );

  const add = useCallback(
    (kind: BlockKind) => {
      setAddOpen(false);
      const orderIndex = blocks.length;
      void addReelBlock(project.id, kind, orderIndex).then((res) => {
        if (res.ok) setBlocks((prev) => [...prev, res.block]);
      });
    },
    [blocks.length, project.id],
  );

  const remove = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    void deleteReelBlock(id);
  }, []);

  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      const from = blocks.findIndex((b) => b.id === id);
      const to = from + dir;
      if (from < 0 || to < 0 || to >= blocks.length) return;
      const next = [...blocks];
      [next[from], next[to]] = [next[to], next[from]];
      setBlocks(next);
      void reorderReelBlocks(
        project.id,
        next.map((b) => b.id),
      );
    },
    [blocks, project.id],
  );

  const applyPreset = useCallback(
    (presetId: string) => {
      setPresetOpen(false);
      const preset = REEL_PRESETS.find((p) => p.id === presetId);
      void applyReelPreset(project.id, presetId).then((res) => {
        if (!res.ok) return;
        setBlocks((prev) => [...prev, ...res.blocks]);
        // The preset's per-block prompts become placeholders — an empty preset
        // should read as instructions, not as a column of blank boxes.
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
      });
    },
    [project.id],
  );

  const tabs: { id: Tab; label: string; Icon: typeof FileText }[] = [
    { id: 'write', label: 'Сценарій', Icon: FileText },
    { id: 'shoot', label: 'Що знімаємо', Icon: Camera },
    { id: 'edit', label: 'Монтаж', Icon: Clapperboard },
  ];

  return (
    <div className="app-canvas min-h-screen">
      <div className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-5">
        <EditorTopBar
          backHref="/projects"
          title={project.name}
          kind="reel"
          trailing={<ReelShareButton reelId={project.id} initialToken={shareToken} />}
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill refTable="projects" id={project.id} type="reel" initialStatus={project.status ?? 'idea'} />
              <ScheduleChip refTable="projects" id={project.id} initialDate={project.scheduled_date ?? null} />
            </div>
          }
        />

        <p className="mb-4 px-1 text-[12.5px] font-medium text-[color:var(--text-muted)]">
          {blocks.length} {blocks.length === 1 ? 'блок' : 'блоків'} · ~{formatDuration(seconds)}
          {shots ? ` · ${shots}` : ''}
        </p>

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
                  onPatch={(patch) => patchBlock(b.id, patch)}
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
          <ReelRecipe blocks={blocks} only={tab === 'shoot' ? 'shoot' : 'edit'} />
        )}
      </div>
    </div>
  );
}
