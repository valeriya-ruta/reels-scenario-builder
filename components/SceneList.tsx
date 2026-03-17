'use client';

import { useState } from 'react';
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
import { Project, Scene, Transition } from '@/lib/domain';
import SceneCard from './SceneCard';
import TransitionSeam from './TransitionSeam';
import { reorderScenes, createScene, createTransition, deleteScene, updateTransition } from '@/app/actions';

interface SceneListProps {
  project: Project;
  scenes: Scene[];
  transitions: Transition[];
  onScenesUpdate: (scenes: Scene[]) => void;
  onTransitionsUpdate: (transitions: Transition[]) => void;
}

export default function SceneList({
  project,
  scenes,
  transitions,
  onScenesUpdate,
  onTransitionsUpdate,
}: SceneListProps) {
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);

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

    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    const newIndex = scenes.findIndex((s) => s.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newScenes = arrayMove(scenes, oldIndex, newIndex);
      onScenesUpdate(newScenes);
      await reorderScenes(project.id, newScenes.map((s) => s.id));
    }
  };

  const handleAddScene = async () => {
    const newOrderIndex = scenes.length;
    const newScene = await createScene(project.id, newOrderIndex);
    if (newScene) {
      onScenesUpdate([...scenes, newScene]);
      setExpandedSceneId(newScene.id);
    }
  };

  // Build transition map for quick lookup
  const transitionMap = new Map<string, Transition>();
  transitions.forEach((t) => {
    transitionMap.set(`${t.scene_before_id}-${t.scene_after_id}`, t);
  });

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
          {scenes.map((scene, index) => {
            const transition = transitionMap.get(
              `${scene.id}-${scenes[index + 1]?.id}`
            );
            const nextScene = scenes[index + 1];

            return (
              <div key={scene.id} className="space-y-2">
                <SceneCard
                  scene={scene}
                  project={project}
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
                    const { deleteScene: deleteSceneAction } = await import('@/app/actions');
                    await deleteSceneAction(scene.id);
                    onScenesUpdate(scenes.filter((s) => s.id !== scene.id));
                  }}
                />
                {nextScene && (
                  <TransitionSeam
                    transition={transition}
                    sceneBeforeId={scene.id}
                    sceneAfterId={nextScene.id}
                    projectId={project.id}
                    onCreateTransition={async (sbId, saId) => {
                      const newTransition = await createTransition(
                        project.id,
                        sbId,
                        saId
                      );
                      if (newTransition) {
                        onTransitionsUpdate([...transitions, newTransition]);
                      }
                    }}
                    onUpdateTransition={async (updates) => {
                      if (transition) {
                        const { updateTransition: updateTransitionAction } = await import('@/app/actions');
                        await updateTransitionAction(transition.id, updates);
                        onTransitionsUpdate(
                          transitions.map((t) =>
                            t.id === transition.id ? { ...t, ...updates } : t
                          )
                        );
                      }
                    }}
                  />
                )}
              </div>
            );
          })}
        </SortableContext>
      </DndContext>

      <button
        onClick={handleAddScene}
        className="w-full rounded border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      >
        + Додати сцену
      </button>
    </div>
  );
}
