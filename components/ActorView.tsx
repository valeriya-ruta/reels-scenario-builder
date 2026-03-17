'use client';

import { useState } from 'react';
import { SnapshotData, Scene, formatLabel } from '@/lib/domain';

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
    <div className="space-y-3">
      {snapshotData.scenes.map((scene, index) => {
        const nextScene = snapshotData.scenes[index + 1];
        const transitionType = nextScene
          ? transitionMap.get(`${scene.id}-${nextScene.id}`)
          : null;

        return (
          <div key={scene.id} className="space-y-2">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={checkedScenes.has(scene.id)}
                  onChange={() => handleToggleCheck(scene.id)}
                  className="mt-1 h-5 w-5 rounded border-zinc-300 bg-white text-zinc-900 focus:ring-2 focus:ring-zinc-400"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-600">
                      Сцена {scene.order_index + 1}
                    </span>
                    <span className="text-zinc-400">•</span>
                    <span className="text-sm text-zinc-500">
                      {formatLabel(scene.framing)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700">
                    {expandedSceneId === scene.id
                      ? scene.lines || 'Немає діалогу'
                      : scene.lines
                      ? scene.lines.split('\n')[0].substring(0, 80) +
                        (scene.lines.length > 80 ? '...' : '')
                      : 'Немає діалогу'}
                  </p>
                  {expandedSceneId === scene.id && (
                    <div className="mt-4 space-y-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-600">Повний текст</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
                          {scene.lines || 'Немає діалогу'}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-zinc-600">Кадрування:</span>{' '}
                          <span className="text-zinc-700">
                            {formatLabel(scene.framing)}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-600">Положення рук:</span>{' '}
                          <span className="text-zinc-700">
                            {formatLabel(scene.arm_state)}
                          </span>
                        </div>
                      </div>
                      {scene.actor_note && (
                        <div className="rounded bg-zinc-50 p-3 border border-zinc-200">
                          <p className="text-xs font-medium text-zinc-600">Примітка для актора</p>
                          <p className="mt-1 text-sm text-zinc-700">
                            {scene.actor_note}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {scene.lines && (
                    <button
                      onClick={() =>
                        setExpandedSceneId(
                          expandedSceneId === scene.id ? null : scene.id
                        )
                      }
                      className="mt-2 text-xs text-zinc-500 hover:text-zinc-700"
                    >
                      {expandedSceneId === scene.id ? 'Показати менше' : 'Показати більше'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {nextScene && transitionType && (
              <div className="flex items-center justify-center py-1">
                <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs text-zinc-600">
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
