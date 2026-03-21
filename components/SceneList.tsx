'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
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
import { reorderScenes, createScene, deleteScene } from '@/app/actions';
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
}

export default function SceneList({
  project,
  scenes,
  onScenesUpdate,
  locations,
  onLocationsChange,
}: SceneListProps) {
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);
  const [animateInSceneId, setAnimateInSceneId] = useState<string | null>(null);

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
            <div key={scene.id} className="mb-4 last:mb-0">
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
                onDelete={async () => {
                  if (isOptimisticSceneId(scene.id)) {
                    onScenesUpdate((prev) =>
                      prev.filter((s) => s.id !== scene.id)
                    );
                    return;
                  }
                  const { deleteScene: deleteSceneAction } = await import('@/app/actions');
                  await deleteSceneAction(scene.id);
                  onScenesUpdate((prev) =>
                    prev.filter((s) => s.id !== scene.id)
                  );
                }}
                animateIn={scene.id === animateInSceneId}
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
