'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
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
} from '@/lib/sceneOptimistic';

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
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
      const newScenes = arrayMove(scenes, oldIndex, newIndex);
      onScenesUpdate(newScenes);
      await reorderScenes(project.id, newScenes.map((s) => s.id));
    }
  };

  const hasOptimisticScene = scenes.some((s) => isOptimisticSceneId(s.id));
  
  useEffect(() => {
    if (!focusSceneId) return;
    const target = rowRefs.current[focusSceneId];
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setExpandedSceneId(focusSceneId);
    setGlowSceneId(focusSceneId);
    const t = window.setTimeout(() => {
      setGlowSceneId((current) => (current === focusSceneId ? null : current));
    }, 1200);
    onFocusHandled?.();

    return () => window.clearTimeout(t);
  }, [focusSceneId, scenes, onFocusHandled]);

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
        onScenesUpdate((prev) =>
          prev.map((s) => (s.id === optimistic.id ? newScene : s))
        );
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

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={scenes.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {scenes.map((scene) => (
            <div
              key={scene.id}
              ref={(el) => {
                rowRefs.current[scene.id] = el;
              }}
              className="mb-4 last:mb-0"
            >
              <SceneCard
                scene={scene}
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
                  onScenesUpdate(
                    scenes.map((s) => (s.id === scene.id ? { ...s, ...updates } : s))
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
        onClick={handleAddScene}
        className="cursor-pointer w-full rounded border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      >
        + Додати сцену
      </button>
    </div>
  );
}
