'use client';

import { useState } from 'react';
import { SnapshotData, formatLabel } from '@/lib/domain';

interface ActorViewProps {
  snapshotData: SnapshotData;
}

export default function ActorView({ snapshotData }: ActorViewProps) {
  const [checkedScenes, setCheckedScenes] = useState<Set<string>>(new Set());
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);

  const handleToggleCheck = (sceneId: string) => {
    const newChecked = new Set(checkedScenes);
    if (newChecked.has(sceneId)) {
      newChecked.delete(sceneId);
    } else {
      newChecked.add(sceneId);
    }
    setCheckedScenes(newChecked);
  };

  // Build transition map
  const transitionMap = new Map<string, string>();
  snapshotData.transitions.forEach((t) => {
    transitionMap.set(`${t.scene_before_id}-${t.scene_after_id}`, t.type);
  });

  return (
    <div className="space-y-3 md:space-y-4">
      {snapshotData.scenes.map((scene, index) => {
        const nextScene = snapshotData.scenes[index + 1];
        const transitionType = nextScene
          ? transitionMap.get(`${scene.id}-${nextScene.id}`)
          : null;

        return (
          <div key={scene.id} className="space-y-2">
            <div className="rounded-lg border border-[color:var(--border)] bg-white p-5 card-shadow">
              <div className="flex items-start gap-3 md:gap-4">
                <input
                  type="checkbox"
                  checked={checkedScenes.has(scene.id)}
                  onChange={() => handleToggleCheck(scene.id)}
                  className="mt-1 h-6 w-6 shrink-0 rounded border-zinc-300 bg-white text-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm md:text-base">
                    <span className="font-semibold text-zinc-700">
                      Сцена {scene.order_index + 1}
                    </span>
                    <span className="text-zinc-400">•</span>
                    <span className="text-zinc-600">
                      {formatLabel(scene.framing)}
                    </span>
                    <span className="text-zinc-400">•</span>
                    <span className="text-zinc-600">
                      {formatLabel(scene.arm_state)}
                    </span>
                    {scene.location_name && (
                      <>
                        <span className="text-zinc-400">•</span>
                        <span className="text-zinc-600">{scene.location_name}</span>
                      </>
                    )}
                  </div>
                  <p
                    className={
                      'mt-2.5 text-base leading-relaxed text-zinc-800 md:text-lg' +
                      (expandedSceneId === scene.id ? ' whitespace-pre-wrap' : '')
                    }
                  >
                    {expandedSceneId === scene.id
                      ? scene.lines || 'Немає діалогу'
                      : scene.lines
                        ? scene.lines.split('\n')[0].substring(0, 100) +
                          (scene.lines.length > 100 ? '...' : '')
                        : 'Немає діалогу'}
                  </p>
                  {expandedSceneId === scene.id && scene.actor_note && (
                    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 md:p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 md:text-sm">
                        Примітка для актора
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-zinc-800 md:text-base">
                        {scene.actor_note}
                      </p>
                    </div>
                  )}
                  {scene.lines && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSceneId(
                          expandedSceneId === scene.id ? null : scene.id
                        )
                      }
                      className="mt-2.5 text-sm font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-4 hover:text-zinc-900 md:text-base"
                    >
                      {expandedSceneId === scene.id ? 'Показати менше' : 'Показати більше'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {nextScene && transitionType && (
              <div className="flex items-center justify-center py-1.5">
                <span className="rounded-full bg-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 md:text-sm">
                  {formatLabel(transitionType)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
