'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { LayoutTemplate, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Location, Project, Scene } from '@/lib/domain';
import SceneCard from './SceneCard';
import { reorderScenes, createScene, updateScene } from '@/app/actions';
import {
  buildOptimisticScene,
  isOptimisticSceneId,
  mergeServerSceneWithLocalDraft,
} from '@/lib/sceneOptimistic';

interface ReelFormulaTemplate {
  id: string;
  name: string;
  scenes: string[];
  description: string;
}

const REEL_FORMULA_TEMPLATES: ReelFormulaTemplate[] = [
  {
    id: 'problem-solution',
    name: 'Проблема → Рішення',
    scenes: ['Гачок', 'Проблема', 'Біль', 'Рішення', 'CTA'],
    description: 'Класична структура для порад і туторіалів',
  },
  {
    id: 'escalation-turn',
    name: 'Ескалація → Поворот',
    scenes: ['Гачок', 'Проблема', 'Більша проблема', 'Несподіваний урок', 'CTA'],
    description: 'Для сторітелінгу - коли спочатку стає гірше, а потім краще',
  },
  {
    id: 'result-first',
    name: 'Результат спочатку',
    scenes: ['Гачок (результат)', 'Біль (до)', 'Як я це зробив', 'CTA'],
    description: 'Покажи результат першим - для before/after і кейсів',
  },
];

function sceneCardVariantFor(
  scene: Scene,
  idx: number,
  total: number
): 'hook' | 'cta' | 'default' {
  const n = (scene.name ?? '').trim().toUpperCase();
  if (n === 'ХУК') return 'hook';
  if (n === 'CTA') return 'cta';
  if (total <= 1) return 'default';
  if (idx === 0) return 'hook';
  if (idx === total - 1) return 'cta';
  return 'default';
}

interface SceneListProps {
  project: Project;
  scenes: Scene[];
  onScenesUpdate: Dispatch<SetStateAction<Scene[]>>;
  locations: Location[];
  onLocationsChange: Dispatch<SetStateAction<Location[]>>;
  focusSceneId?: string | null;
  onFocusHandled?: () => void;
}

export default function SceneList({
  project,
  scenes,
  onScenesUpdate,
  locations,
  onLocationsChange,
  focusSceneId = null,
  onFocusHandled,
}: SceneListProps) {
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);
  const [animateInSceneId, setAnimateInSceneId] = useState<string | null>(null);
  const [glowSceneId, setGlowSceneId] = useState<string | null>(null);
  const [localFocusSceneId, setLocalFocusSceneId] = useState<string | null>(null);
  const [isFormulaPickerOpen, setIsFormulaPickerOpen] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const effectiveFocusSceneId = focusSceneId ?? localFocusSceneId;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    if (
      isOptimisticSceneId(String(active.id)) ||
      isOptimisticSceneId(String(over.id))
    ) {
      return;
    }

    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    const newIndex = scenes.findIndex((s) => s.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      let reorderedIds: string[] = [];
      onScenesUpdate((prev) => {
        const oi = prev.findIndex((s) => s.id === active.id);
        const ni = prev.findIndex((s) => s.id === over.id);
        if (oi === -1 || ni === -1) return prev;
        const next = arrayMove(prev, oi, ni);
        reorderedIds = next.map((s) => s.id);
        return next;
      });
      if (reorderedIds.length) {
        await reorderScenes(project.id, reorderedIds);
      }
    }
  };

  const hasOptimisticScene = scenes.some((s) => isOptimisticSceneId(s.id));
  
  useEffect(() => {
    if (!effectiveFocusSceneId) return;
    const target = rowRefs.current[effectiveFocusSceneId];
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setExpandedSceneId(effectiveFocusSceneId);
    setGlowSceneId(effectiveFocusSceneId);
    const t = window.setTimeout(() => {
      setGlowSceneId((current) =>
        current === effectiveFocusSceneId ? null : current
      );
    }, 1200);
    if (focusSceneId) {
      onFocusHandled?.();
    }
    if (localFocusSceneId) {
      setLocalFocusSceneId(null);
    }

    return () => window.clearTimeout(t);
  }, [effectiveFocusSceneId, focusSceneId, localFocusSceneId, scenes, onFocusHandled]);

  const normalizeSceneOrder = (list: Scene[]) =>
    list.map((s, index) => ({ ...s, order_index: index }));

  const handleAddScene = () => {
    const newOrderIndex = scenes.length;
    const optimistic = buildOptimisticScene(project.id, newOrderIndex);

    onScenesUpdate((prev) => [...prev, optimistic]);
    setExpandedSceneId(optimistic.id);
    setAnimateInSceneId(optimistic.id);
    window.setTimeout(
      () =>
        setAnimateInSceneId((current) =>
          current === optimistic.id ? null : current
        ),
      950
    );

    void (async () => {
      const newScene = await createScene(project.id, newOrderIndex);
      if (newScene) {
        let persistDraft: Partial<Scene> | null = null;
        onScenesUpdate((prev) => {
          const local = prev.find((s) => s.id === optimistic.id);
          if (!local) return prev;
          persistDraft = mergeServerSceneWithLocalDraft(newScene, local);
          return prev.map((s) =>
            s.id === optimistic.id
              ? { ...newScene, ...persistDraft }
              : s
          );
        });
        if (persistDraft) {
          void updateScene(newScene.id, persistDraft);
        }
        setExpandedSceneId((e) => (e === optimistic.id ? newScene.id : e));
        setAnimateInSceneId((a) =>
          a === optimistic.id ? null : a
        );
      } else {
        onScenesUpdate((prev) => prev.filter((s) => s.id !== optimistic.id));
        setExpandedSceneId((e) => (e === optimistic.id ? null : e));
        setAnimateInSceneId((a) => (a === optimistic.id ? null : a));
      }
    })();
  };

  const handleFormulaSelect = (template: ReelFormulaTemplate) => {
    if (hasOptimisticScene) return;

    const newScenesStartIndex = scenes.length;
    const optimisticScenes = template.scenes.map((sceneName, index) => ({
      ...buildOptimisticScene(project.id, newScenesStartIndex + index),
      name: sceneName,
      lines: '',
    }));

    const firstAddedSceneId = optimisticScenes[0]?.id ?? null;
    if (!firstAddedSceneId) {
      setIsFormulaPickerOpen(false);
      return;
    }

    onScenesUpdate((prev) =>
      normalizeSceneOrder([...prev, ...optimisticScenes])
    );
    setExpandedSceneId(firstAddedSceneId);
    setAnimateInSceneId(firstAddedSceneId);
    setLocalFocusSceneId(firstAddedSceneId);
    setIsFormulaPickerOpen(false);
    window.setTimeout(
      () =>
        setAnimateInSceneId((current) =>
          current === firstAddedSceneId ? null : current
        ),
      950
    );

    void (async () => {
      for (let idx = 0; idx < optimisticScenes.length; idx += 1) {
        const optimisticScene = optimisticScenes[idx];
        const nextOrderIndex = newScenesStartIndex + idx;
        const newScene = await createScene(project.id, nextOrderIndex);

        if (!newScene) {
          onScenesUpdate((prev) =>
            normalizeSceneOrder(
              prev.filter((scene) => scene.id !== optimisticScene.id)
            )
          );
          continue;
        }

        const sceneDraft = {
          name: optimisticScene.name,
          lines: optimisticScene.lines,
        };
        onScenesUpdate((prev) =>
          normalizeSceneOrder(
            prev.map((scene) =>
              scene.id === optimisticScene.id
                ? { ...newScene, ...sceneDraft }
                : scene
            )
          )
        );
        await updateScene(newScene.id, sceneDraft);

        if (optimisticScene.id === firstAddedSceneId) {
          setExpandedSceneId(newScene.id);
          setLocalFocusSceneId(newScene.id);
        }
      }
    })();
  };

  if (scenes.length === 0) {
    return (
      <>
        <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface)]/50 px-6 py-16 text-center">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white card-shadow text-[color:var(--accent)]">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="font-display text-lg font-semibold text-zinc-800">Поки без сцен</p>
            <p className="text-sm leading-normal text-zinc-600">Додай першу сцену — натисни кнопку нижче.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setIsFormulaPickerOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition-colors hover:border-[color:var(--accent)]/40 hover:bg-[color:var(--surface)]"
              >
                <LayoutTemplate className="h-4 w-4" />
                Структура
              </button>
              <button
                type="button"
                onClick={handleAddScene}
                className="btn-primary rounded-xl bg-[color:var(--accent)] px-5 py-3 text-sm font-semibold text-white transition-[background,transform] hover:brightness-110"
              >
                Додай першу сцену →
              </button>
            </div>
          </div>
        </div>
        <FormulaPickerModal
          open={isFormulaPickerOpen}
          formulas={REEL_FORMULA_TEMPLATES}
          onClose={() => setIsFormulaPickerOpen(false)}
          onSelect={handleFormulaSelect}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsFormulaPickerOpen(true)}
          disabled={hasOptimisticScene}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[color:var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:border-[color:var(--accent)]/40 hover:bg-[color:var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LayoutTemplate className="h-4 w-4" />
          Структура
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={scenes.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {scenes.map((scene, idx) => (
            <div
              key={scene.id}
              ref={(el) => {
                rowRefs.current[scene.id] = el;
              }}
              className="mb-4 last:mb-0"
            >
              <SceneCard
                scene={scene}
                sceneVariant={sceneCardVariantFor(scene, idx, scenes.length)}
                project={project}
                locations={locations}
                onLocationsChange={onLocationsChange}
                onLocationDeleted={(locationId) => {
                  onScenesUpdate((prev) =>
                    prev.map((s) =>
                      s.location_id === locationId
                        ? { ...s, location_id: null }
                        : s,
                    ),
                  );
                }}
                dragDisabled={hasOptimisticScene}
                isExpanded={expandedSceneId === scene.id}
                onToggleExpand={() =>
                  setExpandedSceneId(
                    expandedSceneId === scene.id ? null : scene.id
                  )
                }
                onUpdate={(updates) => {
                  onScenesUpdate((prev) =>
                    prev.map((s) => (s.id === scene.id ? { ...s, ...updates } : s))
                  );
                }}
                onSplitLines={(start, end, selectedText) => {
                  if (isOptimisticSceneId(scene.id)) return;
                  if (hasOptimisticScene) return;

                  const fullText = scene.lines || '';
                  if (!fullText) return;

                  const selected = selectedText.trim();
                  if (!selected) return;

                  const beforeRaw = fullText.slice(0, start);
                  const afterRaw = fullText.slice(end);
                  const joiner =
                    beforeRaw.length > 0 &&
                    afterRaw.length > 0 &&
                    !beforeRaw.endsWith('\n') &&
                    !afterRaw.startsWith('\n')
                      ? ' '
                      : '';
                  const remainingLines = `${beforeRaw}${joiner}${afterRaw}`.trim();
                  const insertAt = scene.order_index + 1;
                  const optimistic = buildOptimisticScene(project.id, insertAt);

                  onScenesUpdate((prev) => {
                    const base = prev.map((s) =>
                      s.id === scene.id ? { ...s, lines: remainingLines } : s
                    );
                    const next = [...base];
                    next.splice(insertAt, 0, { ...optimistic, lines: selected });
                    return normalizeSceneOrder(next);
                  });
                  setExpandedSceneId(optimistic.id);
                  setAnimateInSceneId(optimistic.id);
                  window.setTimeout(
                    () =>
                      setAnimateInSceneId((current) =>
                        current === optimistic.id ? null : current
                      ),
                    950
                  );

                  void (async () => {
                    await updateScene(scene.id, { lines: remainingLines });

                    const newScene = await createScene(project.id, insertAt);
                    if (!newScene) {
                      onScenesUpdate((prev) => {
                        const withoutOptimistic = prev.filter((s) => s.id !== optimistic.id);
                        return normalizeSceneOrder(withoutOptimistic);
                      });
                      setExpandedSceneId((e) => (e === optimistic.id ? scene.id : e));
                      setAnimateInSceneId((a) => (a === optimistic.id ? null : a));
                      return;
                    }

                    await updateScene(newScene.id, { lines: selected });

                    onScenesUpdate((prev) =>
                      normalizeSceneOrder(
                        prev.map((s) =>
                          s.id === optimistic.id ? { ...newScene, lines: selected } : s
                        )
                      )
                    );
                    setExpandedSceneId((e) => (e === optimistic.id ? newScene.id : e));
                    setAnimateInSceneId((a) => (a === optimistic.id ? null : a));

                    const baseIds = scenes.map((s) => s.id);
                    const currentIndex = baseIds.indexOf(scene.id);
                    if (currentIndex !== -1) {
                      const reorderedIds = [...baseIds];
                      reorderedIds.splice(currentIndex + 1, 0, newScene.id);
                      void reorderScenes(project.id, reorderedIds);
                    }
                  })();
                }}
                onDelete={async () => {
                  if (isOptimisticSceneId(scene.id)) {
                    onScenesUpdate((prev) =>
                      prev.filter((s) => s.id !== scene.id)
                    );
                    return;
                  }
                  const sceneSnapshot = scene;
                  const sceneId = scene.id;
                  const sceneOrderIndex = scene.order_index;

                  // Optimistically remove so the list reflows immediately.
                  onScenesUpdate((prev) =>
                    prev.filter((s) => s.id !== sceneId)
                  );

                  const { deleteScene: deleteSceneAction } = await import('@/app/actions');
                  try {
                    await deleteSceneAction(sceneId);
                  } catch {
                    // Roll back on failure to avoid silent data loss in UI.
                    onScenesUpdate((prev) => {
                      const next = [...prev];
                      const insertAt = Math.max(0, Math.min(sceneOrderIndex, next.length));
                      next.splice(insertAt, 0, sceneSnapshot);
                      return normalizeSceneOrder(next);
                    });
                  }
                }}
                animateIn={scene.id === animateInSceneId}
                shouldGlow={scene.id === glowSceneId}
              />
            </div>
          ))}
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={handleAddScene}
        className="w-full cursor-pointer rounded-xl border-2 border-dashed border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-6 text-sm font-medium leading-normal text-zinc-700 transition-colors hover:border-[color:var(--accent)]/40 hover:bg-white hover:text-zinc-900"
      >
        + Додати сцену
      </button>
      <FormulaPickerModal
        open={isFormulaPickerOpen}
        formulas={REEL_FORMULA_TEMPLATES}
        onClose={() => setIsFormulaPickerOpen(false)}
        onSelect={handleFormulaSelect}
      />
    </div>
  );
}

interface FormulaPickerModalProps {
  open: boolean;
  formulas: ReelFormulaTemplate[];
  onClose: () => void;
  onSelect: (formula: ReelFormulaTemplate) => void;
}

function FormulaPickerModal({
  open,
  formulas,
  onClose,
  onSelect,
}: FormulaPickerModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40 px-3 pb-0 pt-8 sm:items-center sm:justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="card-shadow w-full max-w-2xl rounded-t-2xl border border-[color:var(--border)] bg-white p-4 shadow-xl sm:rounded-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-zinc-900">
              Обери структуру рілсу
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              Сцени додадуться до поточного сценарію
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Закрити"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {formulas.map((formula) => (
            <button
              key={formula.id}
              type="button"
              onClick={() => onSelect(formula)}
              className="w-full rounded-xl border border-[color:var(--border)] bg-white p-4 text-left transition-colors hover:border-[color:var(--accent)]/40 hover:bg-[color:var(--surface)]"
            >
              <p className="text-sm font-semibold text-zinc-900">{formula.name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {formula.scenes.map((scene, index) => (
                  <div key={`${formula.id}-${scene}`} className="flex items-center gap-1.5">
                    <span className="rounded-full bg-[color:var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[color:var(--accent)]">
                      {scene}
                    </span>
                    {index < formula.scenes.length - 1 && (
                      <span className="text-xs text-zinc-400">→</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm text-zinc-600">{formula.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
